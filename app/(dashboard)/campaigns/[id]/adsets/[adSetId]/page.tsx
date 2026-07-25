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

export default async function AdSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; adSetId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id, adSetId } = await params;
  const sp = await searchParams;
  const urlParams = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const range = parseDateRange(urlParams);

  const adSet = await prisma.adSet.findUnique({ where: { id: adSetId }, include: { campaign: true } });
  if (!adSet || adSet.campaignId !== id) notFound();

  const ads = await prisma.ad.findMany({ where: { adSetId }, orderBy: { name: "asc" } });
  const adIds = ads.map((a) => a.id);

  const agg = await prisma.insight.groupBy({
    by: ["adId"],
    where: { level: "ad", adId: { in: adIds }, date: { gte: range.from, lte: range.to } },
    _sum: { spend: true, leads: true, clicks: true, impressions: true },
  });
  const aggMap = new Map(agg.map((a) => [a.adId, a]));

  return (
    <div>
      <Link href={`/campaigns/${id}`} className="text-[13px] text-[var(--accent)] hover:underline">
        ← Back to {adSet.campaign.name}
      </Link>
      <div className="flex items-center gap-3 mt-2 mb-5">
        <h1 className="text-[19px] font-semibold m-0">{adSet.name}</h1>
        <StatusBadge status={adSet.status} />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
        <div className="text-sm font-semibold mb-3.5">Ads</div>
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              {["Ad", "Status", "Spend", "Leads", "CPL", "CTR"].map((h) => (
                <th key={h} className="text-left font-semibold text-[var(--text-2)] text-[11.5px] uppercase tracking-wide px-2.5 py-2 border-b border-[var(--border)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ads.map((a) => {
              const stats = aggMap.get(a.id);
              const spend = stats?._sum.spend ?? 0;
              const leads = stats?._sum.leads ?? 0;
              const clicks = stats?._sum.clicks ?? 0;
              const impressions = stats?._sum.impressions ?? 0;
              const cpl = calcCPL(spend, leads);
              const ctr = calcCTR(clicks, impressions);
              return (
                <tr key={a.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)] font-medium">
                    <div className="flex items-center gap-2">
                      {a.creativeThumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.creativeThumbnailUrl} alt="" className="w-8 h-8 rounded object-cover" />
                      )}
                      {a.name}
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{formatINR(spend)}</td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{leads}</td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{cpl !== null ? formatINR(cpl) : "—"}</td>
                  <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{ctr.toFixed(2)}%</td>
                </tr>
              );
            })}
            {ads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2.5 py-6 text-center text-[var(--text-muted)]">
                  No ads found for this ad set.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
