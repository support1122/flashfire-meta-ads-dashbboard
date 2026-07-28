import { getCrmDb } from "@/lib/mongo-crm";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = new Date(searchParams.get("from") ?? "2026-01-01");
  const to = new Date(searchParams.get("to") ?? "2026-07-28T23:59:59Z");

  const db = await getCrmDb();
  const coll = db.collection("campaignbookings");

  const byCampaign = await coll.aggregate([
    {
      $match: {
        metaCampaignName: { $ne: null },
        bookingStatus: { $in: ["completed", "paid", "no-show", "canceled", "rescheduled"] },
        $or: [
          { bookingCreatedAt: { $gte: from, $lte: to } },
          { scheduledEventStartTime: { $gte: from, $lte: to } },
        ],
      },
    },
    { $group: { _id: "$metaCampaignName", meetings: { $sum: 1 } } },
    { $sort: { meetings: -1 } },
  ]).toArray();

  const byStatus = await coll.aggregate([
    {
      $match: {
        metaCampaignName: { $ne: null },
        $or: [
          { bookingCreatedAt: { $gte: from, $lte: to } },
          { scheduledEventStartTime: { $gte: from, $lte: to } },
        ],
      },
    },
    {
      $group: {
        _id: { campaign: "$metaCampaignName", status: "$bookingStatus" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.campaign": 1 } },
  ]).toArray();

  return Response.json({ ok: true, byCampaign, byStatus });
}
