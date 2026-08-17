/**
 * CRM revenue attribution
 *
 * Flow:
 *   1. Fetch all paid bookings in CRM where meta_created_time (or bookingCreatedAt) is within date range
 *   2. Group revenue by metaCampaignName
 *   3. Return revenueMap (by campaign) and revenueByDate (by lead date)
 *
 * This matches how the performance marketing team calculates revenue —
 * by when the Meta lead came in, not when the Stripe charge happened.
 */

import { MongoClient } from "mongodb";

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

function fmtRevenue(amount: number, currency: string): string {
  const cur = (currency || "usd").toUpperCase();
  const n = amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (cur === "USD") return `$${n}`;
  if (cur === "CAD") return `CA$${n}`;
  if (cur === "GBP") return `£${n}`;
  if (cur === "INR") return `₹${n}`;
  return `${cur} ${n}`;
}

let crmClient: MongoClient | null = null;

async function getCrmDb() {
  if (!crmClient) {
    crmClient = new MongoClient(process.env.SALES_MONGO_URI!);
    await crmClient.connect();
  }
  return crmClient.db("test");
}

export type CampaignRevenue = {
  meetings: number;
  paid: number;
  revenueDisplay: string;
  revenueINR: number;
};

export async function getStripeRevenueBycampaign(
  from: Date,
  to: Date,
  existingCrmMap: Map<string, CampaignRevenue>
): Promise<{ revenueMap: Map<string, CampaignRevenue>; revenueByDate: Map<string, number> }> {

  const db = await getCrmDb();
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10) + "T23:59:59";

  // Fetch all paid bookings where the Meta lead date falls within the selected range
  const paidBookings = await db.collection("campaignbookings").find(
    {
      bookingStatus: "paid",
      metaCampaignName: { $ne: null, $exists: true },
      $or: [
        { "metaRawData.created_time": { $gte: fromStr, $lte: toStr } },
        {
          $and: [
            { "metaRawData.created_time": { $exists: false } },
            { bookingCreatedAt: { $gte: from, $lte: to } },
          ],
        },
        {
          $and: [
            { "metaRawData.created_time": null },
            { bookingCreatedAt: { $gte: from, $lte: to } },
          ],
        },
      ],
    },
    {
      projection: {
        clientEmail: 1,
        metaCampaignName: 1,
        bookingCreatedAt: 1,
        "metaRawData.created_time": 1,
        paymentPlan: 1,
      },
    }
  ).toArray();

  // Dedupe by clientEmail — one revenue entry per client, prefer booking with campaign name
  const dedupedByEmail = new Map<string, typeof paidBookings[0]>();
  for (const b of paidBookings) {
    const key = (b.clientEmail || "").toLowerCase();
    const existing = dedupedByEmail.get(key);
    if (!existing) { dedupedByEmail.set(key, b); continue; }
    if (b.metaCampaignName && !existing.metaCampaignName) dedupedByEmail.set(key, b);
  }

  const revenueMap = new Map<string, CampaignRevenue>(existingCrmMap);
  const revenueByDate = new Map<string, number>();

  for (const booking of dedupedByEmail.values()) {
    const campaignName = (booking.metaCampaignName || "").trim();
    if (!campaignName) continue;

    const price = booking.paymentPlan?.price ?? 0;
    const currency = booking.paymentPlan?.currency || "usd";
    if (price <= 0) continue;

    const revenueINR = toINR(price, currency);
    const display = fmtRevenue(price, currency);

    // Lead date — meta_created_time first, fallback to bookingCreatedAt
    const leadDateRaw = booking.metaRawData?.created_time || booking.bookingCreatedAt;
    const dateStr = leadDateRaw
      ? new Date(leadDateRaw).toISOString().slice(0, 10)
      : from.toISOString().slice(0, 10);

    // Campaign revenue map
    const campKey = campaignName.toLowerCase();
    const existing = revenueMap.get(campKey) ?? { meetings: 0, paid: 0, revenueDisplay: "", revenueINR: 0 };
    existing.paid += 1;
    existing.revenueINR += revenueINR;
    existing.revenueDisplay = existing.revenueDisplay
      ? `${existing.revenueDisplay} + ${display}`
      : display;
    revenueMap.set(campKey, existing);

    // Daily revenue map (for trend chart)
    revenueByDate.set(dateStr, (revenueByDate.get(dateStr) ?? 0) + revenueINR);
  }

  return { revenueMap, revenueByDate };
}
