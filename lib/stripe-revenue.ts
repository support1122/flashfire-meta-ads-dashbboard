/**
 * Stripe → Client Tracking → CRM revenue attribution
 *
 * Flow:
 *   1. Fetch all succeeded Stripe charges in date range
 *   2. Match paymentEmail in Client Tracking DB → get crmEmail (or email fallback)
 *   3. Match crmEmail in CRM DB (campaignbookings) → get metaCampaignName
 *   4. Return revenue grouped by campaign name (in original currency + INR equivalent)
 */

import Stripe from "stripe";
import { MongoClient } from "mongodb";

const USD_TO_INR = 90;
const CAD_TO_INR = 60;
const GBP_TO_INR = 105;

function toINR(amount: number, currency: string): number {
  const cur = (currency || "usd").toUpperCase();
  if (cur === "CAD") return amount * CAD_TO_INR;
  if (cur === "GBP") return amount * GBP_TO_INR;
  if (cur === "INR") return amount;
  return amount * USD_TO_INR;
}

function fmtRevenue(amount: number, currency: string): string {
  const cur = (currency || "usd").toUpperCase();
  const n = (amount / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (cur === "USD") return `$${n}`;
  if (cur === "CAD") return `CA$${n}`;
  if (cur === "GBP") return `£${n}`;
  if (cur === "INR") return `₹${n}`;
  return `${cur} ${n}`;
}

// Singleton MongoDB clients
let trackingClient: MongoClient | null = null;
let crmClient: MongoClient | null = null;

async function getTrackingDb() {
  if (!trackingClient) {
    trackingClient = new MongoClient(process.env.CLIENTS_TRACKING_MONGODB_URI!);
    await trackingClient.connect();
  }
  return trackingClient.db();
}

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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-06-24.dahlia" });

  // 1. Fetch all succeeded Stripe charges in date range
  const fromTs = Math.floor(from.getTime() / 1000);
  const toTs = Math.floor(to.getTime() / 1000);

  const charges: Stripe.Charge[] = [];
  let startingAfter: string | undefined;
  while (true) {
    const params: Stripe.ChargeListParams = {
      limit: 100,
      created: { gte: fromTs, lte: toTs },
    };
    if (startingAfter) params.starting_after = startingAfter;
    const page = await stripe.charges.list(params);
    charges.push(...page.data.filter((c) => c.status === "succeeded" && c.amount > 0));
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  if (charges.length === 0) {
    return { revenueMap: existingCrmMap, revenueByDate: new Map() };
  }

  // Extract payment emails
  const paymentEmails = [
    ...new Set(
      charges
        .map((c) => (c.billing_details?.email || c.receipt_email || "").toLowerCase().trim())
        .filter(Boolean)
    ),
  ];

  // 2. Client Tracking DB — get crmEmail by paymentEmail
  const trackingDb = await getTrackingDb();
  const trackingDocs = await trackingDb
    .collection("dashboardtrackings")
    .find(
      { paymentEmail: { $in: paymentEmails } },
      { projection: { paymentEmail: 1, crmEmail: 1, email: 1 } }
    )
    .toArray();

  // paymentEmail → best available CRM email
  const emailMap = new Map<string, string>();
  for (const doc of trackingDocs) {
    const pe = (doc.paymentEmail || "").toLowerCase();
    // prefer crmEmail field (newly saved), fall back to email field, then payment email itself
    const crmEmail = (doc.crmEmail || doc.email || pe).toLowerCase();
    if (pe) emailMap.set(pe, crmEmail);
  }
  // For any payment email not in Client Tracking, try it directly in CRM
  for (const pe of paymentEmails) {
    if (!emailMap.has(pe)) emailMap.set(pe, pe);
  }

  // 3. CRM DB — get campaign name by crmEmail
  const allCrmEmails = [...new Set(emailMap.values())];
  const crmDb = await getCrmDb();
  const crmBookings = await crmDb
    .collection("campaignbookings")
    .find(
      { clientEmail: { $in: allCrmEmails } },
      { projection: { clientEmail: 1, metaCampaignName: 1, utmSource: 1, bookingStatus: 1 } }
    )
    .toArray();

  // crmEmail → metaCampaignName (prefer booking with campaign name)
  const campaignByEmail = new Map<string, string>();
  for (const b of crmBookings) {
    const key = (b.clientEmail || "").toLowerCase();
    if (!campaignByEmail.has(key) || (b.metaCampaignName && !campaignByEmail.get(key))) {
      campaignByEmail.set(key, b.metaCampaignName || "");
    }
  }

  // 4. Build revenue maps
  const revenueMap = new Map<string, CampaignRevenue>(existingCrmMap);
  const revenueByDate = new Map<string, number>();

  for (const charge of charges) {
    const paymentEmail = (charge.billing_details?.email || charge.receipt_email || "").toLowerCase().trim();
    if (!paymentEmail) continue;

    const crmEmail = emailMap.get(paymentEmail) || paymentEmail;
    const campaignName = campaignByEmail.get(crmEmail) || campaignByEmail.get(paymentEmail) || "";
    if (!campaignName) continue; // skip charges with no campaign attribution

    const amount = charge.amount; // in cents
    const currency = charge.currency.toUpperCase();
    const revenueINR = toINR(amount / 100, currency);
    const display = fmtRevenue(amount, currency);
    const dateStr = new Date(charge.created * 1000).toISOString().slice(0, 10);

    // Campaign revenue map
    const campKey = campaignName.trim().toLowerCase();
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
