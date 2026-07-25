import { prisma } from "@/lib/db";
import { calcCTR, calcCPL } from "@/lib/kpi-calc";
import { jsonCached } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

// GET /api/placements -> latest placement breakdown (publisher_platform x platform_position), refreshed each sync.
export async function GET() {
  const rows = await prisma.insight.findMany({
    where: { level: "placement_breakdown" },
    orderBy: { spend: "desc" },
  });

  const placements = rows.map((r) => ({
    placement: r.placement,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    leads: r.leads,
    ctr: calcCTR(r.clicks, r.impressions),
    cpl: calcCPL(r.spend, r.leads),
  }));

  return jsonCached({ placements });
}
