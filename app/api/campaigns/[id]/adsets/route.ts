import { prisma } from "@/lib/db";
import { calcCTR, calcCPL } from "@/lib/kpi-calc";
import { parseDateRange, jsonCached } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/campaigns/[id]/adsets">
) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const range = parseDateRange(searchParams);

  const adSets = await prisma.adSet.findMany({
    where: { campaignId: id },
    orderBy: { name: "asc" },
  });
  const adSetIds = adSets.map((a) => a.id);

  const agg = await prisma.insight.groupBy({
    by: ["adSetId"],
    where: { level: "adset", adSetId: { in: adSetIds }, date: { gte: range.from, lte: range.to } },
    _sum: { spend: true, leads: true, clicks: true, impressions: true },
  });
  const aggMap = new Map(agg.map((a) => [a.adSetId, a]));

  const rows = adSets.map((a) => {
    const stats = aggMap.get(a.id);
    const spend = stats?._sum.spend ?? 0;
    const leads = stats?._sum.leads ?? 0;
    const clicks = stats?._sum.clicks ?? 0;
    const impressions = stats?._sum.impressions ?? 0;
    return {
      id: a.id,
      name: a.name,
      status: a.status,
      dailyBudget: a.dailyBudget,
      spend,
      leads,
      cpl: calcCPL(spend, leads),
      ctr: calcCTR(clicks, impressions),
    };
  });

  return jsonCached({ adSets: rows });
}
