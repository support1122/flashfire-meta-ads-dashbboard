import { prisma } from "@/lib/db";
import { calcCTR, calcCPL } from "@/lib/kpi-calc";
import { parseDateRange, jsonCached } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

// GET /api/creatives?from=&to= -> ad-level rows with thumbnails, sorted by CPL asc (best first).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = parseDateRange(searchParams);

  const ads = await prisma.ad.findMany({
    include: { adSet: { include: { campaign: true } } },
  });
  const adIds = ads.map((a) => a.id);

  const agg = await prisma.insight.groupBy({
    by: ["adId"],
    where: { level: "ad", adId: { in: adIds }, date: { gte: range.from, lte: range.to } },
    _sum: { spend: true, leads: true, clicks: true, impressions: true },
  });
  const aggMap = new Map(agg.map((a) => [a.adId, a]));

  const rows = ads
    .map((a) => {
      const stats = aggMap.get(a.id);
      const spend = stats?._sum.spend ?? 0;
      const leads = stats?._sum.leads ?? 0;
      const clicks = stats?._sum.clicks ?? 0;
      const impressions = stats?._sum.impressions ?? 0;
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        campaignName: a.adSet.campaign.name,
        adSetName: a.adSet.name,
        creativeThumbnailUrl: a.creativeThumbnailUrl,
        creativeTitle: a.creativeTitle,
        creativeBody: a.creativeBody,
        spend,
        leads,
        cpl: calcCPL(spend, leads),
        ctr: calcCTR(clicks, impressions),
      };
    })
    .filter((r) => r.spend > 0)
    .sort((a, b) => {
      if (a.cpl === null) return 1;
      if (b.cpl === null) return -1;
      return a.cpl - b.cpl;
    });

  return jsonCached({ creatives: rows });
}
