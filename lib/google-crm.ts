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

export interface GoogleLead {
  name: string;
  email: string;
  phone: string | null;
  status: string; // bookingStatus; "not-scheduled" = lead who never booked a meeting
  isMeeting: boolean;
  market: string | null;
  time: string; // ISO, when the lead/booking was created
  meetingAt: string | null; // ISO, scheduled meeting start
}

/** Every Google-tagged CRM row per day (India time), including leads that never booked a meeting. */
export async function getGoogleLeadsByDate(from: Date, to: Date): Promise<Map<string, GoogleLead[]>> {
  const db = await getCrmDb();
  const rows = await db
    .collection("campaignbookings")
    .find(
      {
        bookingCreatedAt: { $gte: from, $lte: to },
        utmSource: { $regex: "^google", $options: "i" },
        $or: [
          { utmMedium: { $regex: "^(paid|cpc)$", $options: "i" } },
          { gclid: { $exists: true, $nin: [null, ""] } },
        ],
      },
      {
        projection: {
          clientName: 1, clientEmail: 1, clientPhone: 1, bookingStatus: 1,
          leadMarket: 1, bookingCreatedAt: 1, scheduledEventStartTime: 1,
        },
      },
    )
    .sort({ bookingCreatedAt: -1 })
    .toArray();

  const out = new Map<string, GoogleLead[]>();
  for (const r of rows) {
    const created = new Date(r.bookingCreatedAt);
    const day = created.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const status = String(r.bookingStatus ?? "unknown");
    const lead: GoogleLead = {
      name: r.clientName || "—",
      email: r.clientEmail || "—",
      phone: r.clientPhone ?? null,
      status,
      isMeeting: status !== "not-scheduled",
      market: r.leadMarket ? String(r.leadMarket).toUpperCase() : null,
      time: created.toISOString(),
      meetingAt: r.scheduledEventStartTime ? new Date(r.scheduledEventStartTime).toISOString() : null,
    };
    out.set(day, [...(out.get(day) ?? []), lead]);
  }
  return out;
}
