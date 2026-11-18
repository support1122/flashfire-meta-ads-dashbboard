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
  TrendingUp,
  Percent,
  CalendarCheck,
  Search,
} from "lucide-react";
import { googlePrisma as prisma } from "@/lib/google-db";
import { calcCTR, calcCPC, calcCPM, calcCPL, calcPercentChange } from "@/lib/kpi-calc";
import KpiCard from "@/components/KpiCard";
import TrendChart from "@/components/TrendChart";
import { getGoogleMeetingsByDate } from "@/lib/google-crm";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
// Range bounds are local-midnight dates (set by parseDateRange), so format them locally.
const localKey = (d: Date) => d.toLocaleDateString("en-CA");

function direction(pct: number | null): "up" | "down" | "flat" {
  if (pct === null || Math.abs(pct) < 0.5) return "flat";
  return pct > 0 ? "up" : "down";
}

// invert = lower is better (CPL, CPC, CPM)
function pctLabel(pct: number | null, suffix: string | null, invert = false): string | undefined {
  if (pct === null) return undefined;
  const displayed = invert ? -pct : pct;
  const word = displayed > 0 ? (invert ? "worse" : "up") : displayed < 0 ? (invert ? "better" : "down") : "flat";
  if (Math.abs(pct) < 0.5) return "flat vs prev period";
  return `${Math.abs(pct).toFixed(1)}% ${suffix ?? word}`;
}

type Sum = { spend: number; impressions: number; clicks: number; conversions: number; interactions: number };

export default async function GoogleOverview({
  from,
  to,
  campaignId,
}: {
  from: Date;
  to: Date;
  campaignId?: string;
}) {
  const lengthDays = Math.round((to.getTime() - from.getTime()) / 86400000);
  const prevFrom = new Date(from.getTime() - (lengthDays + 1) * 86400000);
  const prevTo = new Date(from.getTime() - 1);
  const where = (a: Date, b: Date) => ({ date: { gte: a, lte: b }, ...(campaignId ? { campaignId } : {}) });
  const sums = { spend: true, impressions: true, clicks: true, conversions: true, interactions: true } as const;

  // "Today" in the ad account's timezone (India), not the server's.
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = new Date(todayKey);
  const sevenAgo = new Date(today.getTime() - 6 * 86400000);

  const [cur, prev, daily, campaigns, isAgg, todayRows, last7Rows] = await Promise.all([
    prisma.googleInsight.aggregate({ where: where(from, to), _sum: sums }),
    prisma.googleInsight.aggregate({ where: where(prevFrom, prevTo), _sum: sums }),
    prisma.googleInsight.groupBy({
      by: ["date"],
      where: where(from, to),
      _sum: sums,
      orderBy: { date: "asc" },
    }),
    prisma.googleCampaign.findMany({ where: { status: { not: "REMOVED" } }, orderBy: { name: "asc" } }),
    prisma.googleInsight.aggregate({
      where: where(from, to),
      _avg: { searchImpressionShare: true, searchBudgetLostIS: true, searchRankLostIS: true },
    }),
    prisma.googleInsight.groupBy({ by: ["campaignId"], where: { date: today }, _sum: { spend: true } }),
    prisma.googleInsight.groupBy({
      by: ["campaignId"],
      where: { date: { gte: sevenAgo, lte: today } },
      _sum: { spend: true },
    }),
  ]);

  // Meetings come from the CRM and can only be attributed at account level (see lib/google-crm.ts).
  let meetingsByDate = new Map<string, number>();
  let meetingsTotal = 0;
  let meetingsOk = !campaignId;
  if (!campaignId) {
    try {
      const m = await getGoogleMeetingsByDate(from, to);
      meetingsByDate = m.byDate;
      meetingsTotal = m.total;
    } catch (e) {
      console.error("CRM meetings fetch failed (google overview)", e);
      meetingsOk = false;
    }
  }

  const s = (a: typeof cur): Sum => ({
    spend: a._sum.spend ?? 0,
    impressions: a._sum.impressions ?? 0,
    clicks: a._sum.clicks ?? 0,
    conversions: a._sum.conversions ?? 0,
    interactions: a._sum.interactions ?? 0,
  });
  const c = s(cur);
  const p = s(prev);

  const leads = c.conversions;
  const cpl = calcCPL(c.spend, leads);
  const prevCpl = calcCPL(p.spend, p.conversions);
  const ctr = calcCTR(c.clicks, c.impressions);
  const prevCtr = calcCTR(p.clicks, p.impressions);
  const cpc = calcCPC(c.spend, c.clicks);
  const prevCpc = calcCPC(p.spend, p.clicks);
  const cpm = calcCPM(c.spend, c.impressions);
  const prevCpm = calcCPM(p.spend, p.impressions);
  const leadRate = c.clicks > 0 ? (leads / c.clicks) * 100 : 0;
  const prevLeadRate = p.clicks > 0 ? (p.conversions / p.clicks) * 100 : 0;

  const enabled = campaigns.filter((x) => x.status === "ENABLED");
  const totalDailyBudget = enabled.reduce((t, x) => t + (x.dailyBudget ?? 0), 0);
  const daysElapsed = Math.max(1, lengthDays + 1);
  const pacing = totalDailyBudget > 0 && daysElapsed <= 31 ? c.spend / (totalDailyBudget * daysElapsed) : null;

  // Day-wise rows for every day in range (up to today), zero-filled so quiet days show too.
  const byDay = new Map(daily.map((r) => [dayKey(r.date), r._sum]));
  const lastDay = localKey(to) < todayKey ? localKey(to) : todayKey;
  const days: string[] = [];
  for (let d = new Date(localKey(from)); dayKey(d) <= lastDay; d = new Date(d.getTime() + 86400000)) {
    days.push(dayKey(d));
  }
  const dayRows = days
    .map((date) => {
      const r = byDay.get(date);
      const spend = r?.spend ?? 0;
      const impressions = r?.impressions ?? 0;
      const clicks = r?.clicks ?? 0;
      const l = r?.conversions ?? 0;
      return {
        date,
        spend,
        impressions,
        clicks,
        leads: l,
        cpl: calcCPL(spend, l),
        ctr: calcCTR(clicks, impressions),
        cpc: calcCPC(spend, clicks),
        leadRate: clicks > 0 ? (l / clicks) * 100 : 0,
        meetings: meetingsByDate.get(date) ?? 0,
        costPerMeeting: calcCPL(spend, meetingsByDate.get(date) ?? 0),
        leadToMeeting: l > 0 ? ((meetingsByDate.get(date) ?? 0) / l) * 100 : null,
      };
    })
    .reverse(); // newest first

  const trendData = [...dayRows].reverse().map((r) => ({
    date: r.date,
    spend: r.spend,
    leads: r.leads,
    cpl: r.cpl,
    ctr: r.ctr,
    meetings: meetingsOk ? r.meetings : undefined,
  }));

  const todayMap = new Map(todayRows.map((r) => [r.campaignId, r._sum.spend ?? 0]));
  const last7Map = new Map(last7Rows.map((r) => [r.campaignId, r._sum.spend ?? 0]));
  const budgetRows = campaigns
    .filter((x) => (x.dailyBudget ?? 0) > 0)
    .map((x) => ({
      id: x.id,
      name: x.name,
      budget: x.dailyBudget as number,
      today: todayMap.get(x.id) ?? 0,
      avg7: (last7Map.get(x.id) ?? 0) / 7,
    }))
    .sort((a, b) => b.budget - a.budget);

  const costPerMeeting = meetingsOk ? calcCPL(c.spend, meetingsTotal) : null;
  const leadToMeeting = meetingsOk && leads > 0 ? (meetingsTotal / leads) * 100 : null;
  const meetingsNote = "From CRM bookings tagged utm_source=google & paid. Untagged bookings can't be attributed, so this is a lower bound.";

  const sis = isAgg._avg.searchImpressionShare;
  const lostBudget = isAgg._avg.searchBudgetLostIS;
  const lostRank = isAgg._avg.searchRankLostIS;

  const th = "text-right text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide px-3 py-2 whitespace-nowrap";
  const td = "px-3 py-2 text-[12.5px] text-right tabular-nums";
  const card = "bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4";

  return (
    <div>
      <div className="grid gap-3 mb-5.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <KpiCard icon={<IndianRupee size={13} />} label="Total spend" value={inr(c.spend)} deltaLabel={pctLabel(calcPercentChange(c.spend, p.spend), "vs prev period")} direction={direction(calcPercentChange(c.spend, p.spend))} />
        <KpiCard icon={<Target size={13} />} label="Leads" value={num(leads)} tooltip="Google conversions = 'Lead Form Submission' (your only conversion action)." deltaLabel={pctLabel(calcPercentChange(leads, p.conversions), "vs prev period")} direction={direction(calcPercentChange(leads, p.conversions))} />
        <KpiCard icon={<Receipt size={13} />} label="CPL (cost per lead)" value={cpl !== null ? inr(cpl) : "—"} deltaLabel={cpl !== null && prevCpl !== null ? pctLabel(calcPercentChange(cpl, prevCpl), null, true) : undefined} direction={cpl !== null && prevCpl !== null ? direction(-1 * (calcPercentChange(cpl, prevCpl) ?? 0)) : "flat"} />
        <KpiCard icon={<CalendarCheck size={13} />} label="Meetings" value={meetingsOk ? num(meetingsTotal) : "—"} subtitle={meetingsOk ? (leadToMeeting !== null ? `${leadToMeeting.toFixed(1)}% of leads` : undefined) : "account level only"} tooltip={meetingsNote} direction="flat" />
        <KpiCard icon={<CalendarCheck size={13} />} label="Cost per meeting" value={costPerMeeting !== null ? inr(costPerMeeting) : "—"} subtitle={meetingsOk ? "spend ÷ meetings" : "clear the campaign filter"} tooltip={meetingsNote} direction="flat" />
        <KpiCard icon={<MousePointerClick size={13} />} label="CTR" value={`${ctr.toFixed(2)}%`} deltaLabel={pctLabel(calcPercentChange(ctr, prevCtr), "vs prev")} direction={direction(calcPercentChange(ctr, prevCtr))} />
        <KpiCard icon={<Coins size={13} />} label="CPC" value={inr2(cpc)} deltaLabel={pctLabel(calcPercentChange(cpc, prevCpc), null, true)} direction={direction(-1 * (calcPercentChange(cpc, prevCpc) ?? 0))} />
        <KpiCard icon={<Eye size={13} />} label="CPM" value={inr(cpm)} deltaLabel={pctLabel(calcPercentChange(cpm, prevCpm), null, true)} direction={direction(-1 * (calcPercentChange(cpm, prevCpm) ?? 0))} />
        <KpiCard icon={<BarChart2 size={13} />} label="Impressions" value={num(c.impressions)} deltaLabel={pctLabel(calcPercentChange(c.impressions, p.impressions), "vs prev period")} direction={direction(calcPercentChange(c.impressions, p.impressions))} />
        <KpiCard icon={<Hand size={13} />} label="Clicks" value={num(c.clicks)} deltaLabel={pctLabel(calcPercentChange(c.clicks, p.clicks), "vs prev period")} direction={direction(calcPercentChange(c.clicks, p.clicks))} />
        <KpiCard icon={<TrendingUp size={13} />} label="Lead Rate" value={`${leadRate.toFixed(2)}%`} subtitle="Leads ÷ Clicks" deltaLabel={pctLabel(calcPercentChange(leadRate, prevLeadRate), "vs prev period")} direction={direction(calcPercentChange(leadRate, prevLeadRate))} />
        <KpiCard icon={<PlayCircle size={13} />} label="Active campaigns" value={`${enabled.length} / ${campaigns.length}`} deltaLabel={`${campaigns.length - enabled.length} paused`} direction="flat" />
        <KpiCard icon={<Wallet size={13} />} label="Budget pacing" value={pacing !== null ? `${(pacing * 100).toFixed(0)}%` : "—"} deltaLabel={pacing !== null ? "of budget spent this period" : "select 31 days or fewer"} direction="flat" />
        <KpiCard icon={<Search size={13} />} label="Search impr. share" value={sis != null ? `${(sis * 100).toFixed(0)}%` : "—"} tooltip="Share of eligible searches where your ad showed. Lost to budget / rank below." subtitle={lostBudget != null || lostRank != null ? `lost: ${lostBudget != null ? (lostBudget * 100).toFixed(0) : "—"}% budget · ${lostRank != null ? (lostRank * 100).toFixed(0) : "—"}% rank` : undefined} direction="flat" />
        <KpiCard icon={<Percent size={13} />} label="Interactions" value={num(c.interactions)} deltaLabel={pctLabel(calcPercentChange(c.interactions, p.interactions), "vs prev period")} direction={direction(calcPercentChange(c.interactions, p.interactions))} />
      </div>

      <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className={card}>
          <div className="mb-3.5">
            <div className="text-sm font-semibold">Spend vs CPL trend</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">Daily, selected period</div>
          </div>
          <TrendChart data={trendData} />
        </div>

        <div className={card}>
          <div className="mb-3.5">
            <div className="text-sm font-semibold">Budget vs Spend</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">Independent of date range · today&apos;s spend &amp; 7-day avg vs daily budget</div>
          </div>
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 pr-3 text-[var(--text-muted)] font-medium">Campaign</th>
                <th className="text-right py-2 px-2 text-[var(--text-muted)] font-medium">Budget/Day</th>
                <th className="text-right py-2 px-2 text-[var(--text-muted)] font-medium">Spent Today</th>
                <th className="text-right py-2 pl-2 text-[var(--text-muted)] font-medium">Avg/Day (7d)</th>
              </tr>
            </thead>
            <tbody>
              {budgetRows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)]">
                  <td className="py-2.5 pr-3 font-medium truncate max-w-[130px]">{r.name}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{inr(r.budget)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-medium">{inr(r.today)}</td>
                  <td className="py-2.5 pl-2 text-right tabular-nums text-[var(--text-2)]">{inr(r.avg7)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <div className="mb-3.5">
          <div className="text-sm font-semibold">Day-wise performance</div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            Leads, cost per lead, clicks, CPC, meetings and cost per meeting for every day in the selected period (newest first). Meetings come from CRM bookings tagged as Google paid, so they are a lower bound.
          </div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className={`${th} !text-left`}>Date</th>
              <th className={th}>Spend</th>
              <th className={th}>Leads</th>
              <th className={th}>CPL</th>
              <th className={th}>Clicks</th>
              <th className={th}>CPC</th>
              <th className={th}>CTR</th>
              <th className={th}>Impr.</th>
              <th className={th}>Lead rate</th>
              <th className={th}>Meetings</th>
              <th className={th}>Cost/meeting</th>
              <th className={th}>Lead→Meeting</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] font-semibold">
              <td className={`${td} !text-left`}>Total</td>
              <td className={td}>{inr(c.spend)}</td>
              <td className={td}>{num(leads)}</td>
              <td className={td}>{cpl !== null ? inr(cpl) : "—"}</td>
              <td className={td}>{num(c.clicks)}</td>
              <td className={td}>{inr2(cpc)}</td>
              <td className={td}>{ctr.toFixed(2)}%</td>
              <td className={td}>{num(c.impressions)}</td>
              <td className={td}>{leadRate.toFixed(2)}%</td>
              <td className={td}>{meetingsOk ? num(meetingsTotal) : "—"}</td>
              <td className={td}>{costPerMeeting !== null ? inr(costPerMeeting) : "—"}</td>
              <td className={td}>{leadToMeeting !== null ? `${leadToMeeting.toFixed(1)}%` : "—"}</td>
            </tr>
            {dayRows.map((r) => (
              <tr key={r.date} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                <td className={`${td} !text-left font-medium`}>
                  {new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" })}
                  {r.date === todayKey && <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">today</span>}
                </td>
                <td className={td}>{inr(r.spend)}</td>
                <td className={td}>{num(r.leads)}</td>
                <td className={td}>{r.cpl !== null ? inr(r.cpl) : "—"}</td>
                <td className={td}>{num(r.clicks)}</td>
                <td className={td}>{r.clicks > 0 ? inr2(r.cpc) : "—"}</td>
                <td className={td}>{r.impressions > 0 ? `${r.ctr.toFixed(2)}%` : "—"}</td>
                <td className={td}>{num(r.impressions)}</td>
                <td className={td}>{r.clicks > 0 ? `${r.leadRate.toFixed(1)}%` : "—"}</td>
                <td className={td}>{meetingsOk ? num(r.meetings) : "—"}</td>
                <td className={td}>{meetingsOk && r.costPerMeeting !== null ? inr(r.costPerMeeting) : "—"}</td>
                <td className={td}>{meetingsOk && r.leadToMeeting !== null ? `${r.leadToMeeting.toFixed(0)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
