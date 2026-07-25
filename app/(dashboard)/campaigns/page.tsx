import { prisma } from "@/lib/db";
import { parseDateRange } from "@/lib/query-helpers";
import { calcCTR, calcCPL, calcCPC } from "@/lib/kpi-calc";
import FilterBar from "@/components/FilterBar";
import CampaignTable from "@/components/CampaignTable";
import { getCrmDb } from "@/lib/mongo-crm";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const range = parseDateRange(params);
  const statusFilter = sp.status || undefined;

  const [campaigns, allCampaignsForFilter] = await Promise.all([
    prisma.campaign.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { name: "asc" },
    }),
    prisma.campaign.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const campaignIds = campaigns.map((c) => c.id);

  // Fetch CRM funnel data from MongoDB
  type CrmEntry = { meetings: number; paid: number; revenue: number };
  let crmMap: Map<string, CrmEntry> = new Map();
  try {
    const db = await getCrmDb();
    const coll = db.collection("campaignbookings");
    const [meetingsAgg, paidAgg] = await Promise.all([
      coll.aggregate([
        {
          $match: {
            metaCampaignName: { $ne: null },
            bookingStatus: { $in: ["completed", "paid", "no-show", "canceled", "rescheduled"] },
            bookingCreatedAt: { $gte: range.from, $lte: range.to },
          },
        },
        { $group: { _id: "$metaCampaignName", meetings: { $sum: 1 } } },
      ]).toArray(),
      coll.aggregate([
        {
          $match: {
            metaCampaignName: { $ne: null },
            bookingStatus: "paid",
            statusChangedAt: { $gte: range.from, $lte: range.to },
          },
        },
        {
          $group: {
            _id: "$metaCampaignName",
            paid: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$paymentPlan.price", 0] } },
          },
        },
      ]).toArray(),
    ]);
    for (const r of meetingsAgg) {
      const key = String(r._id).trim().toLowerCase();
      const cur = crmMap.get(key) ?? { meetings: 0, paid: 0, revenue: 0 };
      cur.meetings = r.meetings;
      crmMap.set(key, cur);
    }
    for (const r of paidAgg) {
      const key = String(r._id).trim().toLowerCase();
      const cur = crmMap.get(key) ?? { meetings: 0, paid: 0, revenue: 0 };
      cur.paid = r.paid;
      cur.revenue = r.revenue;
      crmMap.set(key, cur);
    }
  } catch (e) {
    console.error("CRM funnel fetch failed", e);
  }

  const [perCampaignAgg, sparkRows, accountAgg] = await Promise.all([
    prisma.insight.groupBy({
      by: ["campaignId"],
      where: { level: "campaign", campaignId: { in: campaignIds }, date: { gte: range.from, lte: range.to } },
      _sum: { spend: true, leads: true, clicks: true, impressions: true },
    }),
    prisma.insight.findMany({
      where: { level: "campaign", campaignId: { in: campaignIds }, date: { gte: range.from, lte: range.to } },
      select: { campaignId: true, date: true, spend: true },
      orderBy: { date: "asc" },
    }),
    prisma.insight.aggregate({
      where: { level: "campaign", date: { gte: range.from, lte: range.to } },
      _sum: { spend: true, leads: true, clicks: true, impressions: true },
    }),
  ]);

  const accountSpend = accountAgg._sum.spend ?? 0;
  const accountLeads = accountAgg._sum.leads ?? 0;
  const accountClicks = accountAgg._sum.clicks ?? 0;
  const accountImpressions = accountAgg._sum.impressions ?? 0;
  const accountAvgCpl = calcCPL(accountSpend, accountLeads);
  const accountAvgCtr = calcCTR(accountClicks, accountImpressions);

  const aggMap = new Map(perCampaignAgg.map((a) => [a.campaignId, a]));
  const sparkMap = new Map<string, number[]>();
  for (const r of sparkRows) {
    if (!r.campaignId) continue;
    const arr = sparkMap.get(r.campaignId) ?? [];
    arr.push(r.spend);
    sparkMap.set(r.campaignId, arr);
  }

  const rows = campaigns.map((c) => {
    const agg = aggMap.get(c.id);
    const spend = agg?._sum.spend ?? 0;
    const leads = agg?._sum.leads ?? 0;
    const clicks = agg?._sum.clicks ?? 0;
    const impressions = agg?._sum.impressions ?? 0;
    const cpl = calcCPL(spend, leads);
    const ctr = calcCTR(clicks, impressions);
    const cpc = calcCPC(spend, clicks);
    let health: "good" | "watch" | "bad" = "watch";
    if (cpl !== null && accountAvgCpl !== null) {
      if (cpl > 1.5 * accountAvgCpl) health = "bad";
      else if (cpl > accountAvgCpl) health = "watch";
      else if (cpl <= accountAvgCpl && ctr >= accountAvgCtr) health = "good";
    }
    const crm = crmMap.get(c.name.trim().toLowerCase()) ?? { meetings: 0, paid: 0, revenue: 0 };
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      spend,
      impressions,
      clicks,
      leads,
      cpl,
      ctr,
      cpc,
      health,
      sparkline: sparkMap.get(c.id) ?? [],
      meetings: crm.meetings,
      paid: crm.paid,
      revenue: crm.revenue,
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-[19px] font-semibold m-0">Campaigns</h1>
          <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">{campaigns.length} campaigns</div>
        </div>
        <FilterBar campaigns={allCampaignsForFilter} />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
        <CampaignTable rows={rows} />
      </div>
    </div>
  );
}
