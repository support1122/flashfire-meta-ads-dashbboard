import { prisma } from "@/lib/db";
import { calcCTR, calcCPC, calcCPM, calcCPL, calcPercentChange } from "@/lib/kpi-calc";
import { parseDateRange, previousPeriod, jsonCached } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = parseDateRange(searchParams);
  const prevRange = previousPeriod(range);
  const campaignId = searchParams.get("campaignId") || undefined;
  const status = searchParams.get("status") || undefined;

  const where = (r: { from: Date; to: Date }) => ({
    level: "campaign" as const,
    date: { gte: r.from, lte: r.to },
    ...(campaignId ? { campaignId } : {}),
    ...(status
      ? { campaign: { status } }
      : {}),
  });

  const [current, previous, activeCount, totalCount, budgetAgg] = await Promise.all([
    prisma.insight.aggregate({
      where: where(range),
      _sum: { spend: true, impressions: true, clicks: true, leads: true },
    }),
    prisma.insight.aggregate({
      where: where(prevRange),
      _sum: { spend: true, impressions: true, clicks: true, leads: true },
    }),
    prisma.campaign.count({ where: { status: "ACTIVE" } }),
    prisma.campaign.count(),
    prisma.campaign.aggregate({ _sum: { dailyBudget: true } }),
  ]);

  const spend = current._sum.spend ?? 0;
  const impressions = current._sum.impressions ?? 0;
  const clicks = current._sum.clicks ?? 0;
  const leads = current._sum.leads ?? 0;

  const prevSpend = previous._sum.spend ?? 0;
  const prevImpressions = previous._sum.impressions ?? 0;
  const prevClicks = previous._sum.clicks ?? 0;
  const prevLeads = previous._sum.leads ?? 0;

  const cpl = calcCPL(spend, leads);
  const ctr = calcCTR(clicks, impressions);
  const cpc = calcCPC(spend, clicks);
  const cpm = calcCPM(spend, impressions);

  const prevCpl = calcCPL(prevSpend, prevLeads);
  const prevCtr = calcCTR(prevClicks, prevImpressions);
  const prevCpc = calcCPC(prevSpend, prevClicks);
  const prevCpm = calcCPM(prevSpend, prevImpressions);

  const daysElapsed = Math.max(
    1,
    Math.ceil((range.to.getTime() - range.from.getTime()) / 86400000)
  );
  const totalDailyBudget = budgetAgg._sum.dailyBudget ?? 0;
  const budgetPacing =
    totalDailyBudget > 0 ? spend / (totalDailyBudget * daysElapsed) : null;

  return jsonCached({
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    spend: { value: spend, changePct: calcPercentChange(spend, prevSpend) },
    leads: { value: leads, changePct: calcPercentChange(leads, prevLeads) },
    cpl: { value: cpl, changePct: cpl !== null && prevCpl !== null ? calcPercentChange(cpl, prevCpl) : null },
    ctr: { value: ctr, changePct: calcPercentChange(ctr, prevCtr) },
    cpc: { value: cpc, changePct: calcPercentChange(cpc, prevCpc) },
    cpm: { value: cpm, changePct: calcPercentChange(cpm, prevCpm) },
    activeCampaigns: { value: activeCount, total: totalCount },
    budgetPacing: { value: budgetPacing },
  });
}
