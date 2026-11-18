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
  byDate: Map<string, number>; // YYYY-MM-DD (India time) -> meetings
  total: number;
}

export async function getGoogleMeetingsByDate(from: Date, to: Date): Promise<GoogleMeetings> {
  const db = await getCrmDb();
  const rows = await db
    .collection("campaignbookings")
    .aggregate([
      {
        $match: {
          bookingCreatedAt: { $gte: from, $lte: to },
          bookingStatus: { $ne: "not-scheduled" },
          utmSource: { $regex: "^google", $options: "i" },
          $or: [
            { utmMedium: { $regex: "^(paid|cpc)$", $options: "i" } },
            { gclid: { $exists: true, $nin: [null, ""] } },
          ],
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$bookingCreatedAt", timezone: "Asia/Kolkata" } },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const byDate = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    byDate.set(String(r._id), r.n);
    total += r.n;
  }
  return { byDate, total };
}
