import { NextRequest } from "next/server";
import { getCrmDb } from "@/lib/mongo-crm";
import { getDashDb } from "@/lib/mongo-dash";
import { jsonCached } from "@/lib/query-helpers";

const JUNK = new Set([
  "", "no", "none", "na", "n/a", "nobody", "myself", "self",
  "i saw in the social media", "social media", "instagram",
  "facebook", "youtube", "google", "online",
]);
function isRealReferral(v: string) {
  return v && !JUNK.has(v.trim().toLowerCase());
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const monthsBack = Math.min(parseInt(sp.get("months") || "6"), 12);

  try {
    const [crmDb, dashDb] = await Promise.all([getCrmDb(), getDashDb()]);

    // Build month buckets: last N full months + current partial month
    const now = new Date();
    const months: { label: string; from: Date; to: Date }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to = i === 0
        ? new Date() // current month up to now
        : new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = from.toLocaleString("en-US", { month: "short", year: "numeric" });
      months.push({ label, from, to });
    }

    const overallFrom = months[0].from;
    const overallTo = months[months.length - 1].to;

    // Fetch ALL paid bookings in range (any source — not just meta)
    const paidBookings = await crmDb.collection("campaignbookings").find(
      {
        bookingStatus: "paid",
        bookingCreatedAt: { $gte: overallFrom, $lte: overallTo },
      },
      {
        projection: {
          clientEmail: 1,
          clientName: 1,
          bookingCreatedAt: 1,
          utmSource: 1,
          utmMedium: 1,
          metaCampaignName: 1,
          leadSource: 1,
          paymentPlan: 1,
        },
      }
    ).toArray();

    // Dedupe: keep paid status booking, prefer meta-sourced if multiple
    const dedupedMap = new Map<string, typeof paidBookings[0]>();
    for (const b of paidBookings) {
      const key = (b.clientEmail || "").toLowerCase();
      const existing = dedupedMap.get(key);
      if (!existing) { dedupedMap.set(key, b); continue; }
      if (b.leadSource === "meta_lead_ad" && existing.leadSource !== "meta_lead_ad") {
        dedupedMap.set(key, b);
      }
    }

    const allEmails = [...dedupedMap.keys()];

    // Bridge CRM email → dashboard email via dashboardtrackings
    const trackings = await dashDb.collection("dashboardtrackings").find(
      { $or: [{ crmEmail: { $in: allEmails } }, { email: { $in: allEmails } }] },
      { projection: { email: 1, crmEmail: 1 } }
    ).toArray();
    const crmToDash = new Map<string, string>();
    for (const t of trackings) {
      const crm = (t.crmEmail || t.email)?.toLowerCase();
      const dash = t.email?.toLowerCase();
      if (crm && dash) crmToDash.set(crm, dash);
    }

    // Fetch referredBy from profiles
    const dashEmails = [...new Set([...crmToDash.values(), ...allEmails])];
    const profiles = await dashDb.collection("profiles").find(
      { email: { $in: dashEmails } },
      { projection: { email: 1, referredBy: 1 } }
    ).toArray();
    const profileMap = new Map(profiles.map((p) => [p.email?.toLowerCase(), p.referredBy || ""]));

    // Classify each booking
    type Client = {
      name: string;
      email: string;
      source: "Meta" | "Referral" | "Direct";
      detail: string;
      monthLabel: string;
      date: string;
      plan: string;
    };
    const clients: Client[] = [];

    for (const [email, booking] of dedupedMap.entries()) {
      const dashEmail = crmToDash.get(email) || email;
      const referredBy = profileMap.get(dashEmail) || profileMap.get(email) || "";
      const realRef = isRealReferral(referredBy);
      const isMeta =
        booking.leadSource === "meta_lead_ad" ||
        (booking.utmMedium === "paid" && booking.metaCampaignName);

      const source: Client["source"] = realRef ? "Referral" : isMeta ? "Meta" : "Direct";
      const detail =
        source === "Referral" ? String(referredBy)
        : source === "Meta" ? (booking.metaCampaignName || booking.utmSource || "Meta Ad")
        : booking.utmSource || "website/organic";

      const bookingDate = new Date(booking.bookingCreatedAt);
      // Find which month bucket this falls in
      const bucket = months.find(
        (m) => bookingDate >= m.from && bookingDate <= m.to
      );
      if (!bucket) continue;

      clients.push({
        name: booking.clientName || email,
        email,
        source,
        detail,
        monthLabel: bucket.label,
        date: bookingDate.toISOString().slice(0, 10),
        plan: booking.paymentPlan?.name || "",
      });
    }

    // Build month-wise summary
    type MonthSummary = {
      label: string;
      total: number;
      meta: number;
      referral: number;
      direct: number;
      clients: Client[];
    };

    const monthMap = new Map<string, MonthSummary>();
    for (const m of months) {
      monthMap.set(m.label, { label: m.label, total: 0, meta: 0, referral: 0, direct: 0, clients: [] });
    }
    for (const c of clients) {
      const bucket = monthMap.get(c.monthLabel);
      if (!bucket) continue;
      bucket.total++;
      if (c.source === "Meta") bucket.meta++;
      else if (c.source === "Referral") bucket.referral++;
      else bucket.direct++;
      bucket.clients.push(c);
    }

    const monthlyData = [...monthMap.values()];

    return jsonCached({ monthlyData }, 300);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("stripe-source error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
