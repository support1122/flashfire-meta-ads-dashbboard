import { prisma } from "@/lib/db";
import { calcCTR, calcCPL } from "@/lib/kpi-calc";
import { jsonCached } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

// GET /api/audience -> latest age x gender breakdown, refreshed each sync.
export async function GET() {
  const rows = await prisma.insight.findMany({
    where: { level: "audience_breakdown" },
    orderBy: { spend: "desc" },
  });

  const audience = rows.map((r) => ({
    ageGender: r.ageGender,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    leads: r.leads,
    ctr: calcCTR(r.clicks, r.impressions),
    cpl: calcCPL(r.spend, r.leads),
  }));

  return jsonCached({ audience });
}
