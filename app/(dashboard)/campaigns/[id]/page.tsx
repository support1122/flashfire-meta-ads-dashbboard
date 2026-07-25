import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseDateRange } from "@/lib/query-helpers";
import { calcCTR, calcCPL } from "@/lib/kpi-calc";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

function formatINR(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const urlParams = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const range = parseDateRange(urlParams);

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const adSets = await prisma.adSet.findMany({ where: { campaignId: id }, orderBy: { name: "asc" } });
  const adSetIds = adSets.map((a) => a.id);

  const agg = await prisma.insight.groupBy({
    by: ["adSetId"],
    where: { level: "adset", adSetId: { in: adSetIds }, date: { gte: range.from, lte: range.to } },
    _sum: { spend: true, leads: true, clicks: true, impressions: true },
  });
  const aggMap = new Map(agg.map((a) => [a.adSetId, a]));

  return (
    <div>
      <Link href="/campaigns" className="text-[13px] text-[var(--accent)] hover:underline">
        ← Back to campaigns
      </Link>
      <div className="flex items-center gap-3 mt-2 mb-5">
        <h1 className="text-[19px] font-semibold m-0">{campaign.name}</h1>
        <StatusBadge status={campaign.status} />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
        <div className="text-sm font-semibold mb-3.5">Ad sets</div>
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              {["Ad set", "Status", "Daily budget", "Spend", "Leads", "CPL", "CTR"].map((h) => (
                <th key={h} className="text-left font-semibold text-[var(--text-2)] text-[11.5px] uppercase tracking-wide px-2.5 py-2 border-b border-[var(--border)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adSets.map((a) => {
              const stats = aggMap.get(a.id);
              const spend = stats?._sum.spend ?? 0;
              const leads = stats?._sum.leads ?? 0;
              const clicks = stats?._sum.clicks ?? 0;
              const impressions = stats?._sum.impressions ?? 0;
              const cpl = calcCPL(spend, leads);
              const ctr = calcCTR(clicks, impressions);
              return (
                <tr key={a.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">
                    <Link href={`/campaigns/${id}/adsets/${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">
                    {a.dailyBudget ? formatINR(a.dailyBudget) : "—"}
                  </td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{formatINR(spend)}</td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{leads}</td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{cpl !== null ? formatINR(cpl) : "—"}</td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{ctr.toFixed(2)}%</td>
                </tr>
              );
            })}
            {adSets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2.5 py-6 text-center text-[var(--text-muted)]">
                  No ad sets found for this campaign.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
