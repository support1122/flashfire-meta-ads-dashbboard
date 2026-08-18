/**
 * Revenue attribution — Stripe price + CRM lead date + CRM campaign
 *
 * Flow:
 *   1. Fetch paid CRM bookings in date range (by Meta lead date)
 *   2. Collect client emails
 *   3. Look up Stripe charges by those emails → get actual charge amount/currency
 *   4. If no Stripe charge found for a client, fall back to CRM paymentPlan price
 *   5. Group revenue by metaCampaignName
 */

import Stripe from "stripe";
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

  // Step 1 — fetch paid CRM bookings where payment date (bookingCreatedAt) is in range
  const paidBookings = await db.collection("campaignbookings").find(
    {
      bookingStatus: "paid",
      metaCampaignName: { $ne: null, $exists: true },
      bookingCreatedAt: { $gte: from, $lte: to },
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

  // Dedupe by clientEmail
  const dedupedByEmail = new Map<string, typeof paidBookings[0]>();
  for (const b of paidBookings) {
    const key = (b.clientEmail || "").toLowerCase();
    const existing = dedupedByEmail.get(key);
    if (!existing) { dedupedByEmail.set(key, b); continue; }
    if (b.metaCampaignName && !existing.metaCampaignName) dedupedByEmail.set(key, b);
  }

  if (dedupedByEmail.size === 0) {
    return { revenueMap: new Map(existingCrmMap), revenueByDate: new Map() };
  }

  // Step 2 — fetch Stripe charges for these emails to get real price/currency
  // Search a wide window (from - 90 days to to + 30 days) to catch charges near the lead date
  const stripeEmailToCharge = new Map<string, { amount: number; currency: string }>();
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" });
    const clientEmails = [...dedupedByEmail.keys()]; // already lowercased

    // Fetch charges in a wide window around the date range
    const wideFrom = Math.floor(new Date(from.getTime() - 90 * 86400000).getTime() / 1000);
    const wideTo = Math.floor(new Date(to.getTime() + 30 * 86400000).getTime() / 1000);

    const charges: Stripe.Charge[] = [];
    let startingAfter: string | undefined;
    while (true) {
      const params: Stripe.ChargeListParams = {
        limit: 100,
        created: { gte: wideFrom, lte: wideTo },
      };
      if (startingAfter) params.starting_after = startingAfter;
      const page = await stripe.charges.list(params);
      charges.push(...page.data.filter((c) => c.status === "succeeded" && c.amount > 0));
      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1].id;
    }

    // Map email → most recent succeeded charge
    for (const charge of charges) {
      const email = (charge.billing_details?.email || charge.receipt_email || "").toLowerCase().trim();
      if (!email || !clientEmails.includes(email)) continue;
      // Keep the largest charge per email (most likely the actual plan payment)
      const existing = stripeEmailToCharge.get(email);
      if (!existing || charge.amount > existing.amount) {
        stripeEmailToCharge.set(email, {
          amount: charge.amount / 100, // Stripe stores in cents
          currency: charge.currency.toUpperCase(),
        });
      }
    }
  } catch (e) {
    console.error("Stripe lookup failed, falling back to CRM prices", e);
  }

  // Step 3 — build revenue maps using Stripe price if available, else CRM price
  const revenueMap = new Map<string, CampaignRevenue>(existingCrmMap);
  const revenueByDate = new Map<string, number>();

  for (const [email, booking] of dedupedByEmail.entries()) {
    const campaignName = (booking.metaCampaignName || "").trim();
    if (!campaignName) continue;

    // Use Stripe amount if found, otherwise fall back to CRM paymentPlan
    const stripeCharge = stripeEmailToCharge.get(email);
    const price = stripeCharge?.amount ?? booking.paymentPlan?.price ?? 0;
    const currency = stripeCharge?.currency ?? booking.paymentPlan?.currency ?? "usd";
    if (price <= 0) continue;

    const revenueINR = toINR(price, currency);
    const display = fmtRevenue(price, currency);

    // Lead date from CRM (Meta lead date, not Stripe charge date)
    const leadDateRaw = booking.metaRawData?.created_time || booking.bookingCreatedAt;
    const dateStr = leadDateRaw
      ? new Date(leadDateRaw).toISOString().slice(0, 10)
      : from.toISOString().slice(0, 10);

    const campKey = campaignName.toLowerCase();
    const existing = revenueMap.get(campKey) ?? { meetings: 0, paid: 0, revenueDisplay: "", revenueINR: 0 };
    existing.paid += 1;
    existing.revenueINR += revenueINR;
    existing.revenueDisplay = existing.revenueDisplay
      ? `${existing.revenueDisplay} + ${display}`
      : display;
    revenueMap.set(campKey, existing);

    revenueByDate.set(dateStr, (revenueByDate.get(dateStr) ?? 0) + revenueINR);
  }

  return { revenueMap, revenueByDate };
}
