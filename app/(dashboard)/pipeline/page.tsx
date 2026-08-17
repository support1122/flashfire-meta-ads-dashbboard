import { getCrmDb } from "@/lib/mongo-crm";
import { parseDateRange } from "@/lib/query-helpers";
import FilterBar from "@/components/FilterBar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed:    { label: "Attended",    color: "var(--success, #22c55e)" },
  paid:         { label: "Paid",        color: "var(--accent, #6366f1)" },
  "no-show":    { label: "No Show",     color: "var(--danger, #ef4444)" },
  canceled:     { label: "Cancelled",   color: "var(--warning, #f59e0b)" },
  rescheduled:  { label: "Rescheduled", color: "#a78bfa" },
  scheduled:    { label: "Scheduled",   color: "var(--text-2, #94a3b8)" },
};

const STATUS_ORDER = ["completed", "paid", "no-show", "canceled", "rescheduled", "scheduled"];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const range = parseDateRange(params);
  const fromStr = range.from.toISOString().slice(0, 10);
  const toStr = range.to.toISOString().slice(0, 10) + "T23:59:59";

  const allCampaigns = await prisma.campaign.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  type Row = {
    campaign: string;
    leads: number;
    byStatus: Record<string, number>;
    totalMeetings: number;
    paid: number;
  };

  const rows: Row[] = [];

  try {
    const db = await getCrmDb();
    const coll = db.collection("campaignbookings");

    const agg = await coll.aggregate([
      {
        $match: {
          metaCampaignName: { $ne: null, $exists: true },
          $or: [
            { "metaRawData.created_time": { $gte: fromStr, $lte: toStr } },
            { $and: [{ "metaRawData.created_time": { $exists: false } }, { bookingCreatedAt: { $gte: range.from, $lte: range.to } }] },
            { $and: [{ "metaRawData.created_time": null }, { bookingCreatedAt: { $gte: range.from, $lte: range.to } }] },
          ],
        },
      },
      {
        $group: {
          _id: { campaign: "$metaCampaignName", status: "$bookingStatus" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.campaign": 1 } },
    ]).toArray();

    // Also get leads count from Meta insights (Prisma)
    const insightLeads = await prisma.insight.groupBy({
      by: ["campaignId"],
      where: { level: "campaign", date: { gte: range.from, lte: range.to } },
      _sum: { leads: true },
    });
    const campaignLeadsMap = new Map<string, number>();
    for (const row of insightLeads) {
      const camp = allCampaigns.find((c) => c.id === row.campaignId);
      if (camp) campaignLeadsMap.set(camp.name.trim().toLowerCase(), row._sum.leads ?? 0);
    }

    // Group by campaign
    const bycamp = new Map<string, Record<string, number>>();
    for (const r of agg) {
      const camp = String(r._id.campaign).trim();
      const status = String(r._id.status).toLowerCase();
      if (!bycamp.has(camp)) bycamp.set(camp, {});
      bycamp.get(camp)![status] = (bycamp.get(camp)![status] ?? 0) + r.count;
    }

    for (const [campaign, statusMap] of bycamp.entries()) {
      const paid = statusMap["paid"] ?? 0;
      const totalMeetings = Object.entries(statusMap)
        .filter(([s]) => s !== "not-scheduled")
        .reduce((sum, [, c]) => sum + c, 0);
      const leads = campaignLeadsMap.get(campaign.toLowerCase()) ?? 0;
      rows.push({ campaign, leads, byStatus: statusMap, totalMeetings, paid });
    }

    rows.sort((a, b) => b.totalMeetings - a.totalMeetings);
  } catch (e) {
    console.error("Pipeline fetch failed", e);
  }

  // Collect all statuses seen
  const allStatuses = STATUS_ORDER.filter((s) =>
    rows.some((r) => r.byStatus[s])
  );

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-[19px] font-semibold m-0">Pipeline</h1>
          <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">
            Campaign-wise lead funnel · {rows.length} campaigns
          </div>
        </div>
        <FilterBar campaigns={allCampaigns} />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-3 px-4 text-[var(--text-muted)] font-medium whitespace-nowrap">Campaign</th>
              <th className="text-right py-3 px-3 text-[var(--text-muted)] font-medium whitespace-nowrap">Leads</th>
              <th className="text-right py-3 px-3 text-[var(--text-muted)] font-medium whitespace-nowrap">Meetings</th>
              <th className="text-right py-3 px-3 text-[var(--text-muted)] font-medium whitespace-nowrap">L→M %</th>
              {allStatuses.map((s) => (
                <th key={s} className="text-right py-3 px-3 font-medium whitespace-nowrap" style={{ color: STATUS_LABELS[s]?.color }}>
                  {STATUS_LABELS[s]?.label ?? s}
                </th>
              ))}
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap" style={{ color: "var(--accent)" }}>
                Paid
              </th>
              <th className="text-right py-3 px-4 text-[var(--text-muted)] font-medium whitespace-nowrap">Conv %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const lm = row.leads > 0 && row.totalMeetings > 0 ? ((row.totalMeetings / row.leads) * 100).toFixed(1) : "—";
              const conv = row.totalMeetings > 0 && row.paid > 0 ? ((row.paid / row.totalMeetings) * 100).toFixed(1) : "—";
              return (
                <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                  <td className="py-3 px-4 font-medium max-w-[220px] truncate">{row.campaign}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{row.leads > 0 ? row.leads.toLocaleString() : "—"}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium">{row.totalMeetings}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-[var(--text-2)]">{lm}{lm !== "—" ? "%" : ""}</td>
                  {allStatuses.map((s) => (
                    <td key={s} className="py-3 px-3 text-right tabular-nums">
                      {row.byStatus[s] ? (
                        <span style={{ color: STATUS_LABELS[s]?.color }}>{row.byStatus[s]}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  ))}
                  <td className="py-3 px-4 text-right tabular-nums font-semibold" style={{ color: "var(--accent)" }}>
                    {row.paid > 0 ? row.paid : "—"}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-[var(--text-2)]">{conv}{conv !== "—" ? "%" : ""}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4 + allStatuses.length + 2} className="py-8 text-center text-[var(--text-muted)]">
                  No data for selected date range
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
