import { prisma } from "@/lib/db";
import { calcCTR, calcCPL, calcHealthFlag } from "@/lib/kpi-calc";
import { parseDateRange, jsonCached } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

// GET /api/campaigns?from=&to=&status= -> table rows with health flags + 7-day sparkline.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = parseDateRange(searchParams);
  const status = searchParams.get("status") || undefined;

  const campaigns = await prisma.campaign.findMany({
    where: status ? { status } : undefined,
    orderBy: { name: "asc" },
  });

  const campaignIds = campaigns.map((c) => c.id);

  const [perCampaignAgg, dailyRows, accountAgg] = await Promise.all([
    prisma.insight.groupBy({
      by: ["campaignId"],
      where: { level: "campaign", date: { gte: range.from, lte: range.to }, campaignId: { in: campaignIds } },
      _sum: { spend: true, leads: true, clicks: true, impressions: true },
    }),
    prisma.insight.findMany({
      where: {
        level: "campaign",
        campaignId: { in: campaignIds },
        date: { gte: range.from, lte: range.to },
      },
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

  const aggByCampaign = new Map(perCampaignAgg.map((a) => [a.campaignId, a]));
  const sparkByCampaign = new Map<string, number[]>();
  for (const row of dailyRows) {
    if (!row.campaignId) continue;
    const arr = sparkByCampaign.get(row.campaignId) ?? [];
    arr.push(row.spend);
    sparkByCampaign.set(row.campaignId, arr);
  }

  const rows = campaigns.map((c) => {
    const agg = aggByCampaign.get(c.id);
    const spend = agg?._sum.spend ?? 0;
    const leads = agg?._sum.leads ?? 0;
    const clicks = agg?._sum.clicks ?? 0;
    const impressions = agg?._sum.impressions ?? 0;
    const cpl = calcCPL(spend, leads);
    const ctr = calcCTR(clicks, impressions);
    const budget = c.dailyBudget ?? c.lifetimeBudget ?? null;
    const frequency = impressions > 0 ? impressions / Math.max(1, impressions) : 0; // placeholder if reach unavailable at this granularity

    const health = calcHealthFlag({
      cpl,
      ctr,
      frequency,
      spend,
      budget,
      leads,
      accountAvgCpl,
      accountAvgCtr,
    });

    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      dailyBudget: c.dailyBudget,
      spend,
      leads,
      cpl,
      ctr,
      health,
      sparkline: sparkByCampaign.get(c.id) ?? [],
    };
  });

  return jsonCached({ campaigns: rows, accountAvgCpl, accountAvgCtr });
}
