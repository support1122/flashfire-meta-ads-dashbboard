import { prisma } from "@/lib/db";
import { parseDateRange } from "@/lib/query-helpers";
import { calcCTR, calcCPL } from "@/lib/kpi-calc";
import StatusBadge from "@/components/StatusBadge";
import CreativesSortBar from "@/components/CreativesSortBar";

export const dynamic = "force-dynamic";

function formatINR(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const range = parseDateRange(params);
  const sortBy = sp.sort ?? "newest";
  const activeOnly = sp.activeOnly === "1";

  const ads = await prisma.ad.findMany({
    where: activeOnly ? { status: "ACTIVE" } : undefined,
    include: { adSet: { include: { campaign: true } } },
  });
  const adIds = ads.map((a) => a.id);

  const agg = await prisma.insight.groupBy({
    by: ["adId"],
    where: { level: "ad", adId: { in: adIds }, date: { gte: range.from, lte: range.to } },
    _sum: { spend: true, leads: true, clicks: true, impressions: true, videoPlays: true, videoP25: true, videoP50: true, videoP75: true, videoP100: true, thruPlays: true },
    _avg: { videoAvgWatchSec: true },
  });
  const aggMap = new Map(agg.map((a) => [a.adId, a]));

  const rows = ads
    .map((a) => {
      const stats = aggMap.get(a.id);
      const spend = stats?._sum.spend ?? 0;
      const leads = stats?._sum.leads ?? 0;
      const clicks = stats?._sum.clicks ?? 0;
      const impressions = stats?._sum.impressions ?? 0;
      const videoPlays = stats?._sum.videoPlays ?? null;
      const videoP25 = stats?._sum.videoP25 ?? null;
      const videoP50 = stats?._sum.videoP50 ?? null;
      const videoP75 = stats?._sum.videoP75 ?? null;
      const videoP100 = stats?._sum.videoP100 ?? null;
      const thruPlays = stats?._sum.thruPlays ?? null;
      const videoAvgWatchSec = stats?._avg.videoAvgWatchSec ?? null;
      const hookRate = videoPlays && videoP25 ? (videoP25 / videoPlays) * 100 : null;
      const completionRate = videoPlays && videoP100 ? (videoP100 / videoPlays) * 100 : null;
      return {
        ...a,
        spend,
        leads,
        cpl: calcCPL(spend, leads),
        ctr: calcCTR(clicks, impressions),
        videoPlays,
        videoAvgWatchSec,
        videoP25,
        videoP50,
        videoP75,
        videoP100,
        thruPlays,
        hookRate,
        completionRate,
        isVideo: videoPlays !== null && videoPlays > 0,
      };
    })
    .filter((r) => r.spend > 0)
    .sort((a, b) => {
      switch (sortBy) {
        case "spend":    return b.spend - a.spend;
        case "leads":    return b.leads - a.leads;
        case "cpl_asc":  return (a.cpl ?? Infinity) - (b.cpl ?? Infinity);
        case "cpl_desc": return (b.cpl ?? -Infinity) - (a.cpl ?? -Infinity);
        case "ctr":      return b.ctr - a.ctr;
        default:         return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  const sortLabel: Record<string, string> = {
    newest: "newest first",
    spend: "highest spend",
    leads: "most leads",
    cpl_asc: "best CPL",
    cpl_desc: "worst CPL",
    ctr: "highest CTR",
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-[19px] font-semibold m-0">Creatives</h1>
          <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">
            {rows.length} ads{activeOnly ? " · active only" : ""} · sorted by {sortLabel[sortBy] ?? "newest"} · last {Math.round((range.to.getTime() - range.from.getTime()) / 86400000)} days
          </div>
        </div>
        <CreativesSortBar />
      </div>

      {rows.length === 0 && (
        <p className="text-[var(--text-muted)] text-sm text-center py-10">
          No creative data in this period yet.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {rows.map((ad) => (
          <div key={ad.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] overflow-hidden flex flex-col">
            {/* Thumbnail */}
            <div className="w-full h-44 bg-[var(--surface-2)] overflow-hidden">
              {ad.creativeThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ad.creativeThumbnailUrl}
                  alt={ad.name}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] text-[var(--text-muted)]">No preview</div>
              )}
            </div>

            <div className="p-3.5 flex flex-col flex-1">
              {/* Name + badge */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-medium text-[13px] leading-snug line-clamp-2">{ad.name}</div>
                <div className="shrink-0 mt-0.5"><StatusBadge status={ad.status} /></div>
              </div>
              {/* Campaign › AdSet path */}
              <div className="text-[11px] text-[var(--text-muted)] truncate mb-3">
                {ad.adSet.campaign.name} <span className="mx-0.5">›</span> {ad.adSet.name}
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-4 gap-1 mt-auto text-center">
                <div>
                  <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wide">Spend</div>
                  <div className="text-[12px] font-semibold tabular-nums">{formatINR(ad.spend)}</div>
                </div>
                <div>
                  <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wide">Leads</div>
                  <div className="text-[12px] font-semibold tabular-nums">{ad.leads}</div>
                </div>
                <div>
                  <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wide">CPL</div>
                  <div className="text-[12px] font-semibold tabular-nums">{ad.cpl !== null ? formatINR(ad.cpl) : "—"}</div>
                </div>
                <div>
                  <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wide">CTR</div>
                  <div className="text-[12px] font-semibold tabular-nums">{ad.ctr.toFixed(2)}%</div>
                </div>
              </div>

              {/* Video metrics — only shown for video ads */}
              {ad.isVideo && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wide mb-2">Video performance</div>
                  <div className="grid grid-cols-4 gap-1 text-center mb-2">
                    <div>
                      <div className="text-[9px] text-[var(--text-muted)]">Plays</div>
                      <div className="text-[11.5px] font-semibold tabular-nums">{ad.videoPlays?.toLocaleString("en-IN") ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[var(--text-muted)]">Avg watch</div>
                      <div className="text-[11.5px] font-semibold tabular-nums">{ad.videoAvgWatchSec !== null ? `${ad.videoAvgWatchSec.toFixed(1)}s` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[var(--text-muted)]">Hook rate</div>
                      <div className="text-[11.5px] font-semibold tabular-nums" style={{ color: ad.hookRate !== null ? (ad.hookRate >= 25 ? "var(--success)" : ad.hookRate >= 15 ? "var(--warning)" : "var(--danger)") : undefined }}>
                        {ad.hookRate !== null ? `${ad.hookRate.toFixed(1)}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[var(--text-muted)]">Completed</div>
                      <div className="text-[11.5px] font-semibold tabular-nums">{ad.completionRate !== null ? `${ad.completionRate.toFixed(1)}%` : "—"}</div>
                    </div>
                  </div>
                  {/* Drop-off bar: 25 / 50 / 75 / 100 */}
                  {ad.videoPlays && ad.videoPlays > 0 && (
                    <div className="space-y-1">
                      {[
                        { label: "25%", val: ad.videoP25 },
                        { label: "50%", val: ad.videoP50 },
                        { label: "75%", val: ad.videoP75 },
                        { label: "100%", val: ad.videoP100 },
                      ].map(({ label, val }) => {
                        const pct = val ? (val / ad.videoPlays!) * 100 : 0;
                        return (
                          <div key={label} className="flex items-center gap-1.5">
                            <div className="text-[9px] text-[var(--text-muted)] w-6 text-right">{label}</div>
                            <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                              <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <div className="text-[9px] text-[var(--text-muted)] w-8">{pct.toFixed(0)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
