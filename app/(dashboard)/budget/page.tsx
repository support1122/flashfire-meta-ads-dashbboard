import { prisma } from "@/lib/db";
import { parseDateRange } from "@/lib/query-helpers";
import { calcBudgetPacing } from "@/lib/kpi-calc";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

function formatINR(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const range = parseDateRange(params);
  const daysElapsed = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1);

  const campaigns = await prisma.campaign.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
  const campaignIds = campaigns.map((c) => c.id);

  const agg = await prisma.insight.groupBy({
    by: ["campaignId"],
    where: { level: "campaign", campaignId: { in: campaignIds }, date: { gte: range.from, lte: range.to } },
    _sum: { spend: true },
  });
  const aggMap = new Map(agg.map((a) => [a.campaignId, a._sum.spend ?? 0]));

  const rows = campaigns.map((c) => {
    const spendSoFar = aggMap.get(c.id) ?? 0;
    const pacing = c.dailyBudget ? calcBudgetPacing(spendSoFar, c.dailyBudget, daysElapsed) : null;
    return { ...c, spendSoFar, pacing };
  });

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold m-0">Budget & pacing</h1>
        <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">
          Active campaigns · spend vs daily budget × days elapsed in the selected period
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              {["Campaign", "Status", "Daily budget", "Spend (period)", "Pacing"].map((h) => (
                <th key={h} className="text-left font-semibold text-[var(--text-2)] text-[11.5px] uppercase tracking-wide px-2.5 py-2 border-b border-[var(--border)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                <td className="px-2.5 py-2.5 border-b border-[var(--border)] font-medium">{r.name}</td>
                <td className="px-2.5 py-2.5 border-b border-[var(--border)]">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{r.dailyBudget ? formatINR(r.dailyBudget) : "—"}</td>
                <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{formatINR(r.spendSoFar)}</td>
                <td className="px-2.5 py-2.5 border-b border-[var(--border)]">
                  {r.pacing !== null ? (
                    <span
                      className={
                        r.pacing > 1.1
                          ? "text-[var(--danger)] font-semibold"
                          : r.pacing < 0.7
                            ? "text-[var(--warning)] font-semibold"
                            : "text-[var(--success)] font-semibold"
                      }
                    >
                      {(r.pacing * 100).toFixed(0)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2.5 py-6 text-center text-[var(--text-muted)]">
                  No active campaigns.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
