import {
  IndianRupee,
  Target,
  Receipt,
  MousePointerClick,
  Coins,
  Eye,
  PlayCircle,
  Wallet,
  BarChart2,
  Hand,
  Users,
  TrendingUp,
  BadgeDollarSign,
  Percent,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { parseDateRange } from "@/lib/query-helpers";
import { calcCTR, calcCPC, calcCPM, calcCPL, calcPercentChange } from "@/lib/kpi-calc";
import KpiCard from "@/components/KpiCard";
import TrendChart from "@/components/TrendChart";
import AlertCard from "@/components/AlertCard";
import FilterBar from "@/components/FilterBar";
import CampaignTable from "@/components/CampaignTable";
import { getCrmDb } from "@/lib/mongo-crm";

export const dynamic = "force-dynamic";

function formatINR(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function direction(pct: number | null): "up" | "down" | "flat" {
  if (pct === null || Math.abs(pct) < 0.5) return "flat";
  return pct > 0 ? "up" : "down";
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const range = parseDateRange(params);
  const prevLengthDays = Math.round((range.to.getTime() - range.from.getTime()) / 86400000);
  const prevFrom = new Date(range.from.getTime() - (prevLengthDays + 1) * 86400000);
  const prevTo = new Date(range.from.getTime() - 1);

  const campaignIdFilter = sp.campaignId || undefined;
  const statusFilter = sp.status || undefined;

  const whereFor = (from: Date, to: Date) => ({
    level: "campaign" as const,
    date: { gte: from, lte: to },
    ...(campaignIdFilter ? { campaignId: campaignIdFilter } : {}),
    ...(statusFilter ? { campaign: { status: statusFilter } } : {}),
  });

  // All independent reads fire in parallel (no client-side waterfalls, no Meta calls here — Postgres only).
  const [
    currentAgg,
    previousAgg,
    activeCount,
    totalCount,
    budgetAgg,
    trendRows,
    alerts,
    allCampaigns,
    campaignsForTable,
  ] = await Promise.all([
    prisma.insight.aggregate({
      where: whereFor(range.from, range.to),
      _sum: { spend: true, impressions: true, clicks: true, leads: true, reach: true },
    }),
    prisma.insight.aggregate({
      where: whereFor(prevFrom, prevTo),
      _sum: { spend: true, impressions: true, clicks: true, leads: true, reach: true },
    }),
    prisma.campaign.count({ where: { status: "ACTIVE" } }),
    prisma.campaign.count(),
    prisma.campaign.aggregate({ _sum: { dailyBudget: true } }),
    prisma.insight.groupBy({
      by: ["date"],
      where: whereFor(range.from, range.to),
      _sum: { spend: true, leads: true, clicks: true, impressions: true },
      orderBy: { date: "asc" },
    }),
    prisma.alert.findMany({ where: { resolved: false }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.campaign.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({
      where: { status: "ACTIVE", ...(statusFilter ? { status: statusFilter } : {}) },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const spend = currentAgg._sum.spend ?? 0;
  const impressions = currentAgg._sum.impressions ?? 0;
  const clicks = currentAgg._sum.clicks ?? 0;
  const leads = currentAgg._sum.leads ?? 0;
  const reach = currentAgg._sum.reach ?? 0;
  const prevSpend = previousAgg._sum.spend ?? 0;
  const prevImpressions = previousAgg._sum.impressions ?? 0;
  const prevClicks = previousAgg._sum.clicks ?? 0;
  const prevLeads = previousAgg._sum.leads ?? 0;
  const prevReach = previousAgg._sum.reach ?? 0;

  const leadRate = clicks > 0 ? (leads / clicks) * 100 : 0;
  const prevLeadRate = prevClicks > 0 ? (prevLeads / prevClicks) * 100 : 0;

  const cpl = calcCPL(spend, leads);
  const prevCpl = calcCPL(prevSpend, prevLeads);
  const ctr = calcCTR(clicks, impressions);
  const prevCtr = calcCTR(prevClicks, prevImpressions);
  const cpc = calcCPC(spend, clicks);
  const prevCpc = calcCPC(prevSpend, prevClicks);
  const cpm = calcCPM(spend, impressions);
  const prevCpm = calcCPM(prevSpend, prevImpressions);

  const daysElapsed = Math.max(1, prevLengthDays + 1);
  const totalDailyBudget = budgetAgg._sum.dailyBudget ?? 0;
  // Budget pacing (spend vs. daily-budget * days) only means something over a short,
  // current window — over multi-month/all-time ranges the denominator dwarfs actual
  // spend and the % is meaningless, so we only compute it for ranges of 31 days or less.
  const budgetPacing =
    totalDailyBudget > 0 && daysElapsed <= 31 ? spend / (totalDailyBudget * daysElapsed) : null;

  const trendData = trendRows.map((r) => {
    const s = r._sum.spend ?? 0;
    const l = r._sum.leads ?? 0;
    const c = r._sum.clicks ?? 0;
    const i = r._sum.impressions ?? 0;
    return {
      date: r.date.toISOString().slice(0, 10),
      spend: s,
      leads: l,
      cpl: l > 0 ? s / l : null,
      ctr: i > 0 ? (c / i) * 100 : 0,
    };
  });

  // Campaign table rows for the top 8 campaigns (by name), with health flags computed against
  // the account average for the selected period.
  const campaignIds = campaignsForTable.map((c) => c.id);
  const [perCampaignAgg, sparkRows] = await Promise.all([
    prisma.insight.groupBy({
      by: ["campaignId"],
      where: { level: "campaign", campaignId: { in: campaignIds }, date: { gte: range.from, lte: range.to } },
      _sum: { spend: true, leads: true, clicks: true, impressions: true },
    }),
    prisma.insight.findMany({
      where: { level: "campaign", campaignId: { in: campaignIds }, date: { gte: range.from, lte: range.to } },
      select: { campaignId: true, date: true, spend: true },
      orderBy: { date: "asc" },
    }),
  ]);
  const aggMap = new Map(perCampaignAgg.map((a) => [a.campaignId, a]));
  const sparkMap = new Map<string, number[]>();
  for (const r of sparkRows) {
    if (!r.campaignId) continue;
    const arr = sparkMap.get(r.campaignId) ?? [];
    arr.push(r.spend);
    sparkMap.set(r.campaignId, arr);
  }

  const USD_TO_INR = 90;
  const CAD_TO_INR = 60;
  function toINR(amount: number, currency: string): number {
    const cur = (currency || "usd").toUpperCase();
    if (cur === "CAD") return amount * CAD_TO_INR;
    if (cur === "INR") return amount;
    return amount * USD_TO_INR;
  }
  function fmtRevenue(amount: number, currency: string): string {
    const cur = (currency || "usd").toUpperCase();
    const n = amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (cur === "USD") return `$${n}`;
    if (cur === "CAD") return `CA$${n}`;
    if (cur === "INR") return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    return `${cur} ${n}`;
  }

  type CrmEntry = { meetings: number; paid: number; revenueDisplay: string; revenueINR: number };
  let crmMap: Map<string, CrmEntry> = new Map();
  try {
    const db = await getCrmDb();
    const coll = db.collection("campaignbookings");
    const [meetingsAgg, paidAgg] = await Promise.all([
      coll.aggregate([
        {
          $match: {
            metaCampaignName: { $ne: null },
            bookingStatus: { $in: ["completed", "paid", "no-show", "canceled", "rescheduled"] },
            $or: [
              { bookingCreatedAt: { $gte: range.from, $lte: range.to } },
              { scheduledEventStartTime: { $gte: range.from, $lte: range.to } },
            ],
          },
        },
        { $group: { _id: "$metaCampaignName", meetings: { $sum: 1 } } },
      ]).toArray(),
      coll.aggregate([
        {
          $match: {
            metaCampaignName: { $ne: null },
            bookingStatus: "paid",
            statusChangedAt: { $gte: range.from, $lte: range.to },
          },
        },
        {
          $group: {
            _id: { campaign: "$metaCampaignName", currency: { $ifNull: ["$paymentPlan.currency", "usd"] } },
            paid: { $sum: 1 },
            total: { $sum: { $ifNull: ["$paymentPlan.price", 0] } },
          },
        },
      ]).toArray(),
    ]);
    for (const r of meetingsAgg) {
      const key = String(r._id).trim().toLowerCase();
      const cur = crmMap.get(key) ?? { meetings: 0, paid: 0, revenueDisplay: "", revenueINR: 0 };
      cur.meetings = r.meetings;
      crmMap.set(key, cur);
    }
    for (const r of paidAgg) {
      const key = String(r._id.campaign).trim().toLowerCase();
      const cur = crmMap.get(key) ?? { meetings: 0, paid: 0, revenueDisplay: "", revenueINR: 0 };
      cur.paid += r.paid;
      cur.revenueINR += toINR(r.total, r._id.currency);
      const part = fmtRevenue(r.total, r._id.currency);
      cur.revenueDisplay = cur.revenueDisplay ? `${cur.revenueDisplay} + ${part}` : part;
      crmMap.set(key, cur);
    }
  } catch (e) {
    console.error("CRM funnel fetch failed (overview)", e);
  }

  // Account-level ROAS & ROI (sum across all campaigns)
  const totalRevenueINR = Array.from(crmMap.values()).reduce((s, v) => s + v.revenueINR, 0);
  const accountRoas = spend > 0 && totalRevenueINR > 0 ? totalRevenueINR / spend : null;
  const accountRoi = spend > 0 && totalRevenueINR > 0 ? ((totalRevenueINR - spend) / spend) * 100 : null;

  const accountAvgCpl = cpl;
  const accountAvgCtr = ctr;

  const tableRows = campaignsForTable.map((c) => {
    const agg = aggMap.get(c.id);
    const cSpend = agg?._sum.spend ?? 0;
    const cLeads = agg?._sum.leads ?? 0;
    const cClicks = agg?._sum.clicks ?? 0;
    const cImpressions = agg?._sum.impressions ?? 0;
    const cCpl = calcCPL(cSpend, cLeads);
    const cCtr = calcCTR(cClicks, cImpressions);
    let health: "good" | "watch" | "bad" = "watch";
    if (cCpl !== null && accountAvgCpl !== null) {
      if (cCpl > 1.5 * accountAvgCpl) health = "bad";
      else if (cCpl > accountAvgCpl) health = "watch";
      else if (cCpl <= accountAvgCpl && cCtr >= accountAvgCtr) health = "good";
    }
    const crm = crmMap.get(c.name.trim().toLowerCase()) ?? { meetings: 0, paid: 0, revenueDisplay: "", revenueINR: 0 };
    const roas = cSpend > 0 && crm.revenueINR > 0 ? crm.revenueINR / cSpend : null;
    const roi = cSpend > 0 && crm.revenueINR > 0 ? ((crm.revenueINR - cSpend) / cSpend) * 100 : null;
    return {
      id: c.id,
      name: c.name,
      objective: null,
      status: c.status,
      spend: cSpend,
      leads: cLeads,
      impressions: cImpressions,
      clicks: cClicks,
      cpc: calcCPC(cSpend, cClicks),
      cpl: cCpl,
      ctr: cCtr,
      health,
      sparkline: sparkMap.get(c.id) ?? [],
      meetings: crm.meetings,
      paid: crm.paid,
      revenue: crm.revenueDisplay,
      roas,
      roi,
    };
  }).sort((a, b) => b.spend - a.spend);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-[19px] font-semibold m-0">Overview</h1>
          <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">
            {range.from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} –{" "}
            {range.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
        <FilterBar campaigns={allCampaigns} />
      </div>

      <div className="grid gap-3 mb-5.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<IndianRupee size={13} />} label="Total spend" value={formatINR(spend)} deltaLabel={pctLabel(calcPercentChange(spend, prevSpend), "vs prev period")} direction={direction(calcPercentChange(spend, prevSpend))} />
        <KpiCard icon={<Target size={13} />} label="Leads" value={leads.toLocaleString("en-IN")} deltaLabel={pctLabel(calcPercentChange(leads, prevLeads), "vs prev period")} direction={direction(calcPercentChange(leads, prevLeads))} />
        <KpiCard icon={<Receipt size={13} />} label="CPL" value={cpl !== null ? formatINR(cpl) : "—"} deltaLabel={cpl !== null && prevCpl !== null ? pctLabel(calcPercentChange(cpl, prevCpl), null, true) : undefined} direction={cpl !== null && prevCpl !== null ? direction(-1 * (calcPercentChange(cpl, prevCpl) ?? 0)) : "flat"} />
        <KpiCard icon={<MousePointerClick size={13} />} label="CTR" value={`${ctr.toFixed(2)}%`} deltaLabel={pctLabel(calcPercentChange(ctr, prevCtr), "vs prev")} direction={direction(calcPercentChange(ctr, prevCtr))} />
        <KpiCard icon={<Coins size={13} />} label="CPC" value={formatINR(cpc)} deltaLabel={pctLabel(calcPercentChange(cpc, prevCpc), null, true)} direction={direction(-1 * (calcPercentChange(cpc, prevCpc) ?? 0))} />
        <KpiCard icon={<Eye size={13} />} label="CPM" value={formatINR(cpm)} deltaLabel={pctLabel(calcPercentChange(cpm, prevCpm), null, true)} direction={direction(-1 * (calcPercentChange(cpm, prevCpm) ?? 0))} />
        <KpiCard icon={<PlayCircle size={13} />} label="Active campaigns" value={`${activeCount} / ${totalCount}`} deltaLabel={`${totalCount - activeCount} paused`} direction="flat" />
        <KpiCard icon={<Wallet size={13} />} label="Budget pacing" value={budgetPacing !== null ? `${(budgetPacing * 100).toFixed(0)}%` : "—"} deltaLabel={budgetPacing !== null ? "of budget spent this period" : "select 31 days or fewer"} direction="flat" />
        <KpiCard icon={<BarChart2 size={13} />} label="Impressions" value={impressions.toLocaleString("en-IN")} deltaLabel={pctLabel(calcPercentChange(impressions, prevImpressions), "vs prev period")} direction={direction(calcPercentChange(impressions, prevImpressions))} />
        <KpiCard icon={<Hand size={13} />} label="Clicks" value={clicks.toLocaleString("en-IN")} deltaLabel={pctLabel(calcPercentChange(clicks, prevClicks), "vs prev period")} direction={direction(calcPercentChange(clicks, prevClicks))} />
        <KpiCard icon={<TrendingUp size={13} />} label="Lead Rate" value={`${leadRate.toFixed(2)}%`} subtitle="Leads ÷ Clicks" deltaLabel={pctLabel(calcPercentChange(leadRate, prevLeadRate), "vs prev period")} direction={direction(calcPercentChange(leadRate, prevLeadRate))} />
        <KpiCard icon={<Users size={13} />} label="Reach" value={reach.toLocaleString("en-IN")} tooltip="Are you reaching new people or burning the same audience? If reach is flat but frequency is rising, refresh your creatives." deltaLabel={pctLabel(calcPercentChange(reach, prevReach), "vs prev period")} direction={direction(calcPercentChange(reach, prevReach))} />
        <KpiCard icon={<BadgeDollarSign size={13} />} label="ROAS" value={accountRoas !== null ? `${accountRoas.toFixed(2)}x` : "—"} tooltip="Revenue ÷ Ad Spend (1 USD=₹90, 1 CAD=₹60). Only counts CRM-tracked paid clients." deltaLabel={accountRoas !== null ? (accountRoas >= 3 ? "Strong" : accountRoas >= 1 ? "Breaking even" : "Below breakeven") : "No paid data"} direction={accountRoas !== null ? (accountRoas >= 3 ? "up" : accountRoas >= 1 ? "flat" : "down") : "flat"} />
        <KpiCard icon={<Percent size={13} />} label="ROI" value={accountRoi !== null ? `${accountRoi.toFixed(0)}%` : "—"} tooltip="(Revenue − Spend) ÷ Spend × 100" deltaLabel={accountRoi !== null ? (accountRoi >= 200 ? "Excellent" : accountRoi >= 0 ? "Profitable" : "Loss") : "No paid data"} direction={accountRoi !== null ? (accountRoi >= 0 ? "up" : "down") : "flat"} />
      </div>

      <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
          <div className="mb-3.5">
            <div className="text-sm font-semibold">Spend vs CPL trend</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">Daily, selected period</div>
          </div>
          <TrendChart data={trendData} />
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
          <div className="text-sm font-semibold mb-3.5">Alerts</div>
          {alerts.length === 0 && (
            <p className="text-[13px] text-[var(--text-muted)]">No active alerts.</p>
          )}
          {alerts.map((a) => (
            <AlertCard key={a.id} severity={a.severity as "bad" | "watch" | "good"} title={a.title} body={a.body} />
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <div className="text-sm font-semibold">Campaigns</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {activeCount} active · {totalCount - activeCount} paused
            </div>
          </div>
          <div className="text-xs text-[var(--text-muted)]">Click a row to drill into ad sets</div>
        </div>
        <CampaignTable rows={tableRows} />
      </div>
    </div>
  );
}

function pctLabel(pct: number | null, suffix: string | null, invert = false): string | undefined {
  if (pct === null) return undefined;
  const displayed = invert ? -pct : pct;
  const arrowWord = displayed > 0 ? (invert ? "worse" : "up") : displayed < 0 ? (invert ? "better" : "down") : "flat";
  if (Math.abs(pct) < 0.5) return "flat vs prev period";
  return `${Math.abs(pct).toFixed(1)}% ${suffix ?? arrowWord}`;
}
