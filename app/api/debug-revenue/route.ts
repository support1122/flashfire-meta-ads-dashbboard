import { getCrmDb } from "@/lib/mongo-crm";
export const dynamic = "force-dynamic";

const USD_TO_INR = 90;
const CAD_TO_INR = 60;
const GBP_TO_INR = 120;

function toINR(amount: number, currency: string): number {
  const cur = (currency || "usd").toUpperCase();
  if (cur === "CAD") return amount * CAD_TO_INR;
  if (cur === "GBP") return amount * GBP_TO_INR;
  if (cur === "INR") return amount;
  return amount * USD_TO_INR;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = new Date(searchParams.get("from") ?? "2026-07-01");
  const to = new Date(searchParams.get("to") ?? "2026-07-31");
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10) + "T23:59:59";

  const db = await getCrmDb();

  // Raw paid bookings in range (before dedup)
  const raw = await db.collection("campaignbookings").find(
    {
      bookingStatus: "paid",
      metaCampaignName: { $ne: null, $exists: true },
      $or: [
        { "metaRawData.created_time": { $gte: fromStr, $lte: toStr } },
        { $and: [{ "metaRawData.created_time": { $exists: false } }, { bookingCreatedAt: { $gte: from, $lte: to } }] },
        { $and: [{ "metaRawData.created_time": null }, { bookingCreatedAt: { $gte: from, $lte: to } }] },
      ],
    },
    {
      projection: {
        clientEmail: 1, clientName: 1, metaCampaignName: 1,
        bookingCreatedAt: 1, "metaRawData.created_time": 1, paymentPlan: 1,
      },
    }
  ).toArray();

  // Dedup by clientEmail
  const deduped = new Map<string, typeof raw[0]>();
  for (const b of raw) {
    const key = (b.clientEmail || "").toLowerCase();
    const existing = deduped.get(key);
    if (!existing) { deduped.set(key, b); continue; }
    if (b.metaCampaignName && !existing.metaCampaignName) deduped.set(key, b);
  }

  // Group by campaign
  const byCampaign: Record<string, {
    paid: number; totalUSD: number; totalINR: number;
    clients: { name: string; email: string; price: number; currency: string; leadDate: string; }[];
  }> = {};

  for (const b of deduped.values()) {
    const camp = (b.metaCampaignName || "").trim();
    if (!byCampaign[camp]) byCampaign[camp] = { paid: 0, totalUSD: 0, totalINR: 0, clients: [] };
    const price = b.paymentPlan?.price ?? 0;
    const currency = (b.paymentPlan?.currency || "usd").toUpperCase();
    const inr = toINR(price, currency);
    const leadDate = b.metaRawData?.created_time || b.bookingCreatedAt?.toISOString?.() || "";
    byCampaign[camp].paid++;
    byCampaign[camp].totalINR += inr;
    if (currency === "USD") byCampaign[camp].totalUSD += price;
    byCampaign[camp].clients.push({
      name: b.clientName || "",
      email: b.clientEmail || "",
      price,
      currency,
      leadDate: String(leadDate).slice(0, 10),
    });
  }

  const summary = Object.entries(byCampaign)
    .map(([campaign, d]) => ({ campaign, ...d }))
    .sort((a, b) => b.totalINR - a.totalINR);

  return Response.json({
    ok: true,
    range: { from: fromStr, to: toStr },
    rawCount: raw.length,
    dedupedCount: deduped.size,
    summary,
  });
}
