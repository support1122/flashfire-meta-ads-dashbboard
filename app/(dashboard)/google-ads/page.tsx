import Link from "next/link";
import { googlePrisma as prisma } from "@/lib/google-db";
import { parseDateRange } from "@/lib/query-helpers";
import { calcCTR, calcCPC } from "@/lib/kpi-calc";
import FilterBar from "@/components/FilterBar";
import StatusBadge from "@/components/StatusBadge";
import GoogleOverview from "./GoogleOverview";

export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "campaigns", label: "Campaigns" },
  { key: "ad_group", label: "Ad groups" },
  { key: "ad", label: "Ads" },
  { key: "keyword", label: "Keywords" },
  { key: "search_term", label: "Search terms" },
  { key: "device", label: "Devices" },
  { key: "geo", label: "Locations" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "hour", label: "Hour of day" },
  { key: "network", label: "Networks" },
  { key: "conversion_action", label: "Conversions" },
] as const;

const pretty = (v: string | null) =>
  v ? v.replace(/^AGE_RANGE_/, "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "—";

type Metrics = { spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number };

const th = "text-left text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide px-3 py-2 whitespace-nowrap";
const thR = `${th} text-right`;
const td = "px-3 py-2.5 text-[12.5px]";
const tdR = `${td} text-right tabular-nums`;

function MetricHeads({ withValue = true }: { withValue?: boolean }) {
  return (
    <>
      <th className={thR}>Spend</th>
      <th className={thR}>Impr.</th>
      <th className={thR}>Clicks</th>
      <th className={thR}>CTR</th>
      <th className={thR}>CPC</th>
      <th className={thR}>Leads</th>
      <th className={thR}>CPL</th>
      {withValue && <th className={thR}>Conv. value</th>}
    </>
  );
}

function MetricCells({ m }: { m: Metrics }) {
  return (
    <>
      <td className={tdR}>{inr(m.spend)}</td>
      <td className={tdR}>{num(m.impressions)}</td>
      <td className={tdR}>{num(m.clicks)}</td>
      <td className={tdR}>{calcCTR(m.clicks, m.impressions).toFixed(2)}%</td>
      <td className={tdR}>{inr2(calcCPC(m.spend, m.clicks))}</td>
      <td className={tdR}>{m.conversions.toFixed(1)}</td>
      <td className={tdR}>{m.conversions > 0 ? inr(m.spend / m.conversions) : "—"}</td>
      <td className={tdR}>{inr(m.conversionValue)}</td>
    </>
  );
}

export default async function GoogleAdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!process.env.GOOGLE_DATABASE_URL) {
    return (
      <div>
        <h1 className="text-[19px] font-semibold m-0">Google Ads</h1>
        <div className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4 text-[13px] text-[var(--text-muted)]">
          The Google Ads database is not configured. Set <code>GOOGLE_DATABASE_URL</code> (and the{" "}
          <code>GOOGLE_ADS_*</code> variables), redeploy, then run <code>/api/sync/google?full=1</code>.
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][],
  );
  const range = parseDateRange(params);
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "overview";
  const campaignId = sp.campaignId || undefined;
  // FilterBar uses Meta-style statuses; Google calls "ACTIVE" -> "ENABLED".
  const statusFilter = sp.status === "ACTIVE" ? "ENABLED" : sp.status || undefined;

  const allCampaigns = await prisma.googleCampaign.findMany({ orderBy: { name: "asc" } });
  const campaignName = new Map(allCampaigns.map((c) => [c.id, c.name]));
  const dateWhere = { gte: range.from, lte: range.to };

  const tabHref = (key: string) => {
    const p = new URLSearchParams(params);
    p.set("view", key);
    return `/google-ads?${p.toString()}`;
  };

  /* ───────── campaigns view (+ KPI tiles) ───────── */
  const kpiAgg = await prisma.googleInsight.aggregate({
    where: { date: dateWhere, ...(campaignId ? { campaignId } : {}) },
    _sum: { spend: true, impressions: true, clicks: true, conversions: true, conversionValue: true },
  });
  const t = {
    spend: kpiAgg._sum.spend ?? 0,
    impressions: kpiAgg._sum.impressions ?? 0,
    clicks: kpiAgg._sum.clicks ?? 0,
    conversions: kpiAgg._sum.conversions ?? 0,
    conversionValue: kpiAgg._sum.conversionValue ?? 0,
  };
  const kpis = [
    { label: "Spend", value: inr(t.spend) },
    { label: "Impressions", value: num(t.impressions) },
    { label: "Clicks", value: num(t.clicks) },
    { label: "CTR", value: `${calcCTR(t.clicks, t.impressions).toFixed(2)}%` },
    { label: "Avg CPC", value: inr2(calcCPC(t.spend, t.clicks)) },
    { label: "Leads", value: t.conversions.toFixed(1) },
    { label: "CPL", value: t.conversions > 0 ? inr(t.spend / t.conversions) : "—" },
  ];

  let body: React.ReactNode;

  if (view === "campaigns") {
    const agg = await prisma.googleInsight.groupBy({
      by: ["campaignId"],
      where: { date: dateWhere },
      _sum: { spend: true, impressions: true, clicks: true, conversions: true, conversionValue: true },
    });
    const aggMap = new Map(agg.map((a) => [a.campaignId, a._sum]));
    const rows = allCampaigns
      .filter((c) => c.status !== "REMOVED")
      .filter((c) => (campaignId ? c.id === campaignId : true))
      .filter((c) => (statusFilter ? c.status === statusFilter : true))
      .map((c) => {
        const s = aggMap.get(c.id);
        return {
          c,
          m: {
            spend: s?.spend ?? 0,
            impressions: s?.impressions ?? 0,
            clicks: s?.clicks ?? 0,
            conversions: s?.conversions ?? 0,
            conversionValue: s?.conversionValue ?? 0,
          },
        };
      })
      .sort((a, b) => b.m.spend - a.m.spend);

    body = (
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className={th}>Campaign</th>
            <th className={th}>Type</th>
            <th className={thR}>Budget/day</th>
            <MetricHeads />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, m }) => (
            <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
              <td className={td}>
                <div className="font-medium">{c.name}</div>
                <div className="mt-0.5">
                  <StatusBadge status={c.status === "ENABLED" ? "ACTIVE" : c.status} />
                </div>
              </td>
              <td className={`${td} text-[var(--text-muted)]`}>{pretty(c.channelType)}</td>
              <td className={tdR}>{c.dailyBudget != null ? inr(c.dailyBudget) : "—"}</td>
              <MetricCells m={m} />
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (view !== "overview") {
    /* ───────── every other view reads the flat GoogleStat table ───────── */
    const grouped = await prisma.googleStat.groupBy({
      by: ["campaignId", "adGroupId", "entityId", "dim1", "dim2"],
      where: { level: view, date: dateWhere, ...(campaignId ? { campaignId } : {}) },
      _sum: { spend: true, impressions: true, clicks: true, conversions: true, conversionValue: true },
    });

    const [adGroups, ads, keywords] = await Promise.all([
      prisma.googleAdGroup.findMany(),
      view === "ad" ? prisma.googleAd.findMany() : Promise.resolve([]),
      view === "keyword" ? prisma.googleKeyword.findMany() : Promise.resolve([]),
    ]);
    const adGroupName = new Map(adGroups.map((g) => [g.id, g.name]));
    const adById = new Map(ads.map((a) => [a.id, a]));
    const kwById = new Map(keywords.map((k) => [k.id, k]));

    const rows = grouped
      .map((g) => ({
        g,
        m: {
          spend: g._sum.spend ?? 0,
          impressions: g._sum.impressions ?? 0,
          clicks: g._sum.clicks ?? 0,
          conversions: g._sum.conversions ?? 0,
          conversionValue: g._sum.conversionValue ?? 0,
        },
      }))
      .sort((a, b) =>
        view === "hour" ? Number(a.g.dim1) - Number(b.g.dim1) : b.m.spend - a.m.spend || b.m.impressions - a.m.impressions,
      )
      .slice(0, 1000);

    const label = (g: (typeof rows)[number]["g"]) => {
      switch (view) {
        case "ad_group":
          return adGroupName.get(g.adGroupId ?? "") ?? g.adGroupId ?? "—";
        case "ad": {
          const ad = adById.get(g.entityId ?? "");
          return ad?.headlines?.[0] ? `${ad.headlines.slice(0, 3).join(" | ")}` : `Ad ${g.entityId}`;
        }
        case "hour":
          return `${String(g.dim1).padStart(2, "0")}:00`;
        case "keyword":
        case "search_term":
        case "geo":
          return g.dim1 ?? "—";
        default:
          return pretty(g.dim1);
      }
    };

    const sub = (g: (typeof rows)[number]["g"]) => {
      if (view === "keyword") {
        const k = kwById.get(g.entityId ?? "");
        return `${pretty(g.dim2)}${k?.qualityScore ? ` · QS ${k.qualityScore}` : ""}${k?.negative ? " · negative" : ""}`;
      }
      if (view === "search_term") return `${pretty(g.dim2)}`;
      if (view === "ad") return adById.get(g.entityId ?? "")?.finalUrls?.[0] ?? "";
      if (view === "geo") return pretty(g.dim2);
      return "";
    };

    const showAdGroup = ["ad", "keyword", "search_term", "age", "gender"].includes(view);

    body =
      rows.length === 0 ? (
        <div className="text-[13px] text-[var(--text-muted)] py-6 text-center">No data for this period.</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className={th}>{VIEWS.find((v) => v.key === view)?.label.replace(/s$/, "")}</th>
              {showAdGroup && <th className={th}>Ad group</th>}
              <th className={th}>Campaign</th>
              <MetricHeads withValue />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ g, m }, i) => (
              <tr key={i} className="border-b border-[var(--border)] last:border-0">
                <td className={td}>
                  <div className="font-medium max-w-[360px] truncate">{label(g)}</div>
                  {sub(g) && <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5 max-w-[360px] truncate">{sub(g)}</div>}
                </td>
                {showAdGroup && <td className={`${td} text-[var(--text-muted)]`}>{adGroupName.get(g.adGroupId ?? "") ?? "—"}</td>}
                <td className={`${td} text-[var(--text-muted)]`}>{campaignName.get(g.campaignId) ?? g.campaignId}</td>
                <MetricCells m={m} />
              </tr>
            ))}
          </tbody>
        </table>
      );
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-[19px] font-semibold m-0">Google Ads</h1>
          <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">{allCampaigns.length} campaigns</div>
        </div>
        <FilterBar campaigns={allCampaigns.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      {view !== "overview" && (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        {kpis.map((k) => (
          <div key={k.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4 py-3.5">
            <div className="text-[11.5px] text-[var(--text-muted)]">{k.label}</div>
            <div className="text-[18px] font-semibold mt-1 tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>
      )}

      <div className="flex gap-1 flex-wrap mb-3">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={tabHref(v.key)}
            className={`px-2.5 py-1 text-[12px] rounded-md border transition-colors ${
              view === v.key
                ? "bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)] font-medium"
                : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-2)] hover:border-[var(--accent)]"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {view === "overview" && allCampaigns.length > 0 ? (
        <GoogleOverview from={range.from} to={range.to} campaignId={campaignId} />
      ) : (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4 overflow-x-auto">
        {allCampaigns.length === 0 ? (
          <div className="text-[13px] text-[var(--text-muted)] py-6 text-center">
            No Google Ads data yet. Run a sync: <code>/api/sync/google?full=1</code>
          </div>
        ) : (
          body
        )}
      </div>
      )}
    </div>
  );
}
