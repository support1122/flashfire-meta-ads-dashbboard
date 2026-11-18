/**
 * Google Ads meetings from the CRM (`campaignbookings`).
 *
 * Meta leads are matched through `metaCampaignName`. Google leads have no such field, but the
 * website tags them: utmSource = "google" (also "google-1", "google_arun" on older campaigns) with
 * utmMedium = "paid" | "cpc", and sometimes a `gclid`. A booking counts as a meeting under the
 * same rule as Meta: any bookingStatus except "not-scheduled".
 *
 * Limitation: only bookings that carry the UTM tags can be attributed, so these numbers are a
 * lower bound. Campaign-level attribution is not possible (utmCampaign is empty on Google
 * bookings), so meetings are reported at account level.
 */
import { getCrmDb } from "@/lib/mongo-crm";

export interface GoogleMeetings {
  byDate: Map<string, number>; // YYYY-MM-DD (India time) -> bookings counted as meetings
  uniqueByDate: Map<string, number>; // same, but distinct clients (a client can have 2+ bookings)
  total: number;
  uniqueTotal: number;
}

export async function getGoogleMeetingsByDate(from: Date, to: Date): Promise<GoogleMeetings> {
  const db = await getCrmDb();
  const match = {
    bookingCreatedAt: { $gte: from, $lte: to },
    bookingStatus: { $ne: "not-scheduled" },
    utmSource: { $regex: "^google", $options: "i" },
    $or: [
      { utmMedium: { $regex: "^(paid|cpc)$", $options: "i" } },
      { gclid: { $exists: true, $nin: [null, ""] } },
    ],
  };
  const client = { $toLower: { $ifNull: ["$clientEmail", { $toString: "$_id" }] } };
  const coll = db.collection("campaignbookings");

  const [rows, uniq] = await Promise.all([
    coll
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$bookingCreatedAt", timezone: "Asia/Kolkata" } },
            n: { $sum: 1 },
            clients: { $addToSet: client },
          },
        },
      ])
      .toArray(),
    coll.aggregate([{ $match: match }, { $group: { _id: client } }, { $count: "n" }]).toArray(),
  ]);

  const byDate = new Map<string, number>();
  const uniqueByDate = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    byDate.set(String(r._id), r.n);
    uniqueByDate.set(String(r._id), r.clients.length);
    total += r.n;
  }
  return { byDate, uniqueByDate, total, uniqueTotal: uniq[0]?.n ?? 0 };
}
