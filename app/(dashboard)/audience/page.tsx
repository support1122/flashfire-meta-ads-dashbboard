import { prisma } from "@/lib/db";
import { calcCTR, calcCPL } from "@/lib/kpi-calc";
import { parseDateRange } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

function formatINR(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const range = parseDateRange(params);

  // Campaign-level breakdown
  const campaignAgg = await prisma.insight.groupBy({
    by: ["campaignId"],
    where: { level: "campaign", date: { gte: range.from, lte: range.to } },
    _sum: { spend: true, leads: true, clicks: true, impressions: true },
    orderBy: { _sum: { spend: "desc" } },
  });

  const campaignIds = campaignAgg.map((r) => r.campaignId).filter(Boolean) as string[];
  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true, name: true, objective: true },
  });
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  const totalSpend = campaignAgg.reduce((s, r) => s + (r._sum.spend ?? 0), 0);

  const campaignRows = campaignAgg.map((r) => {
    const spend = r._sum.spend ?? 0;
    const leads = r._sum.leads ?? 0;
    const clicks = r._sum.clicks ?? 0;
    const impressions = r._sum.impressions ?? 0;
    const c = campaignMap.get(r.campaignId ?? "");
    return {
      label: c?.name ?? r.campaignId ?? "Unknown",
      objective: c?.objective ?? null,
      spend,
      leads,
      cpl: calcCPL(spend, leads),
      ctr: calcCTR(clicks, impressions),
      sharePct: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
    };
  });

  // Ad set breakdown
  const adSetAgg = await prisma.insight.groupBy({
    by: ["adSetId"],
    where: { level: "adset", date: { gte: range.from, lte: range.to } },
    _sum: { spend: true, leads: true, clicks: true, impressions: true },
    orderBy: { _sum: { spend: "desc" } },
    take: 20,
  });

  const adSetIds = adSetAgg.map((r) => r.adSetId).filter(Boolean) as string[];
  const adSets = await prisma.adSet.findMany({
    where: { id: { in: adSetIds } },
    select: { id: true, name: true },
  });
  const adSetMap = new Map(adSets.map((a) => [a.id, a]));

  const adSetRows = adSetAgg.map((r) => {
    const spend = r._sum.spend ?? 0;
    const leads = r._sum.leads ?? 0;
    const clicks = r._sum.clicks ?? 0;
    const impressions = r._sum.impressions ?? 0;
    return {
      id: r.adSetId ?? "unknown",
      label: adSetMap.get(r.adSetId ?? "")?.name ?? r.adSetId ?? "Unknown",
      spend,
      leads,
      cpl: calcCPL(spend, leads),
      ctr: calcCTR(clicks, impressions),
      sharePct: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
    };
  });

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold m-0">Audience</h1>
        <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">
          Spend &amp; performance breakdown by campaign and ad set ·{" "}
          {range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} –{" "}
          {range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Campaign breakdown */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
          <div className="text-sm font-semibold mb-1">Campaign breakdown</div>
          <div className="text-[11.5px] text-[var(--text-muted)] mb-4">Spend share &amp; performance per campaign</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {["Campaign", "Objective", "Spend share", "Spend", "Leads", "CPL", "CTR"].map((h) => (
                    <th key={h} className="text-left font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wide px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaignRows.map((r, i) => (
                  <tr key={r.label + i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                    <td className="px-3 py-2.5 font-medium max-w-[200px] truncate">{r.label}</td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">{r.objective ?? "—"}</td>
                    <td className="px-3 py-2.5 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${r.sharePct}%` }} />
                        </div>
                        <span className="tabular-nums text-[11px] text-[var(--text-muted)] w-8 text-right">{r.sharePct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatINR(r.spend)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.leads}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.cpl !== null ? formatINR(r.cpl) : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.ctr.toFixed(2)}%</td>
                  </tr>
                ))}
                {campaignRows.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--text-muted)]">No data for selected period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ad set breakdown */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
          <div className="text-sm font-semibold mb-1">Ad set breakdown</div>
          <div className="text-[11.5px] text-[var(--text-muted)] mb-4">Top 20 ad sets by spend</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {["Ad set", "Spend share", "Spend", "Leads", "CPL", "CTR"].map((h) => (
                    <th key={h} className="text-left font-medium text-[var(--text-muted)] text-[11px] uppercase tracking-wide px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adSetRows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                    <td className="px-3 py-2.5 font-medium max-w-[220px] truncate">{r.label}</td>
                    <td className="px-3 py-2.5 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${r.sharePct}%` }} />
                        </div>
                        <span className="tabular-nums text-[11px] text-[var(--text-muted)] w-8 text-right">{r.sharePct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatINR(r.spend)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.leads}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.cpl !== null ? formatINR(r.cpl) : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.ctr.toFixed(2)}%</td>
                  </tr>
                ))}
                {adSetRows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--text-muted)]">No data for selected period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
