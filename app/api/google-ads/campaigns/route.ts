import { fetchGoogleCampaigns, fetchGoogleInsights } from "@/lib/google-ads-api";
import { fetchAdGroups, fetchAds, fetchKeywords, fetchStats, fetchGeoNames } from "@/lib/google-ads-extra";

export const dynamic = "force-dynamic";

// GET /api/google-ads/campaigns?from=YYYY-MM-DD&to=YYYY-MM-DD[&all=1]
// Live data straight from Google (no DB). Default: campaigns with totals + daily rows.
// With all=1: also ad groups, ads, keywords and every breakdown (device, geo, age, ...).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const from =
    searchParams.get("from") ??
    new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const all = searchParams.get("all") === "1";

  try {
    const [campaigns, daily] = await Promise.all([
      fetchGoogleCampaigns(),
      fetchGoogleInsights(from, to),
    ]);

    const rows = campaigns.map((c) => {
      const d = daily.filter((r) => r.campaignId === c.id);
      const sum = (k: "spend" | "impressions" | "clicks" | "conversions" | "conversionValue" | "videoViews") =>
        d.reduce((a, r) => a + r[k], 0);
      const spend = sum("spend");
      const impressions = sum("impressions");
      const clicks = sum("clicks");
      const conversions = sum("conversions");
      return {
        ...c,
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        conversions,
        conversionValue: sum("conversionValue"),
        costPerConversion: conversions > 0 ? spend / conversions : null,
        videoViews: sum("videoViews"),
        daily: d.sort((a, b) => a.date.localeCompare(b.date)),
      };
    });

    if (!all) return Response.json({ ok: true, from, to, campaigns: rows });

    const [adGroups, ads, keywords, stats] = await Promise.all([
      fetchAdGroups(),
      fetchAds(),
      fetchKeywords(),
      fetchStats(from, to),
    ]);
    const geo = await fetchGeoNames(stats.filter((s) => s.level === "geo").map((s) => s.dim1 ?? ""));
    const breakdowns: Record<string, unknown[]> = {};
    for (const s of stats) {
      const row = s.level === "geo" ? { ...s, dim1: geo.get(s.dim1 ?? "") ?? s.dim1 } : s;
      (breakdowns[s.level] ??= []).push(row);
    }

    return Response.json({ ok: true, from, to, campaigns: rows, adGroups, ads, keywords, breakdowns });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
