import { prisma } from "@/lib/db";
import { calcCPL, calcCTR } from "@/lib/kpi-calc";

export async function runAlertsEngine(): Promise<{ created: number }> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const now = new Date();

  const [campaignAggs, accountAgg] = await Promise.all([
    prisma.insight.groupBy({
      by: ["campaignId"],
      where: { level: "campaign", date: { gte: sevenDaysAgo, lte: now } },
      _sum: { spend: true, leads: true, clicks: true, impressions: true },
    }),
    prisma.insight.aggregate({
      where: { level: "campaign", date: { gte: sevenDaysAgo, lte: now } },
      _sum: { spend: true, leads: true, clicks: true, impressions: true },
    }),
  ]);

  const accountSpend = accountAgg._sum.spend ?? 0;
  const accountLeads = accountAgg._sum.leads ?? 0;
  const accountClicks = accountAgg._sum.clicks ?? 0;
  const accountImpressions = accountAgg._sum.impressions ?? 0;
  const accountAvgCpl = calcCPL(accountSpend, accountLeads);
  const accountAvgCtr = calcCTR(accountClicks, accountImpressions);

  // Resolve all existing alerts before creating fresh ones.
  await prisma.alert.updateMany({ where: { resolved: false }, data: { resolved: true } });

  const alerts: Array<{ severity: string; title: string; body: string }> = [];

  for (const agg of campaignAggs) {
    if (!agg.campaignId) continue;
    const spend = agg._sum.spend ?? 0;
    const leads = agg._sum.leads ?? 0;
    const clicks = agg._sum.clicks ?? 0;
    const impressions = agg._sum.impressions ?? 0;
    const cpl = calcCPL(spend, leads);
    const ctr = calcCTR(clicks, impressions);

    const campaign = await prisma.campaign.findUnique({ where: { id: agg.campaignId } });
    if (!campaign) continue;

    if (accountAvgCpl !== null && cpl !== null && cpl > accountAvgCpl * 2) {
      alerts.push({
        severity: "critical",
        title: `High CPL: ${campaign.name}`,
        body: `CPL ₹${cpl.toFixed(0)} is more than 2× the account average of ₹${accountAvgCpl.toFixed(0)} over the last 7 days.`,
      });
    } else if (accountAvgCpl !== null && cpl !== null && cpl > accountAvgCpl * 1.4) {
      alerts.push({
        severity: "warning",
        title: `Elevated CPL: ${campaign.name}`,
        body: `CPL ₹${cpl.toFixed(0)} is 40%+ above the account average of ₹${accountAvgCpl.toFixed(0)}.`,
      });
    }

    if (accountAvgCtr > 0 && ctr < accountAvgCtr * 0.4) {
      alerts.push({
        severity: "warning",
        title: `Low CTR: ${campaign.name}`,
        body: `CTR ${ctr.toFixed(2)}% is less than 40% of the account average ${accountAvgCtr.toFixed(2)}%.`,
      });
    }

    if (spend === 0 && campaign.status === "ACTIVE") {
      alerts.push({
        severity: "warning",
        title: `No spend: ${campaign.name}`,
        body: `Campaign is ACTIVE but recorded no spend in the last 7 days.`,
      });
    }
  }

  if (alerts.length > 0) {
    await prisma.alert.createMany({ data: alerts });
  }

  return { created: alerts.length };
}
