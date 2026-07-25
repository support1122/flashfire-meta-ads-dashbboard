import { prisma } from "@/lib/db";
import { parseDateRange, jsonCached } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

// GET /api/kpis/trend?from=&to=&campaignId=&status= -> daily time series for the trend chart.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = parseDateRange(searchParams);
  const campaignId = searchParams.get("campaignId") || undefined;
  const status = searchParams.get("status") || undefined;

  const rows = await prisma.insight.groupBy({
    by: ["date"],
    where: {
      level: "campaign",
      date: { gte: range.from, lte: range.to },
      ...(campaignId ? { campaignId } : {}),
      ...(status ? { campaign: { status } } : {}),
    },
    _sum: { spend: true, leads: true, clicks: true, impressions: true },
    orderBy: { date: "asc" },
  });

  const series = rows.map((r) => {
    const spend = r._sum.spend ?? 0;
    const leads = r._sum.leads ?? 0;
    const clicks = r._sum.clicks ?? 0;
    const impressions = r._sum.impressions ?? 0;
    return {
      date: r.date.toISOString().slice(0, 10),
      spend,
      leads,
      cpl: leads > 0 ? spend / leads : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    };
  });

  return jsonCached({ series });
}
