"use client";

import { useRouter } from "next/navigation";
import { SparklineBar } from "@/components/SparklineBar";

interface CampaignRow {
  id: string;
  name: string;
  objective?: string | null;
  status: string;
  spend: number;
  leads: number;
  cpl: number | null;
  ctr: number;
  health: "good" | "watch" | "bad" | "neutral" | "warning" | "critical";
  sparkline: number[];
  impressions?: number;
  clicks?: number;
  cpc?: number;
  meetings?: number;
  paid?: number;
  revenue?: number;
}

const healthDot: Record<string, string> = {
  good: "bg-[var(--success)]",
  watch: "bg-[var(--warning)]",
  bad: "bg-[var(--danger)]",
  warning: "bg-[var(--warning)]",
  critical: "bg-[var(--danger)]",
  neutral: "bg-[var(--border)]",
};

const healthLabel: Record<string, { label: string; cls: string }> = {
  good: { label: "Good", cls: "bg-[var(--success-bg)] text-[var(--success)]" },
  watch: { label: "Watch", cls: "bg-[var(--warning-bg)] text-[var(--warning)]" },
  bad: { label: "Poor", cls: "bg-[var(--danger-bg)] text-[var(--danger)]" },
  warning: { label: "Watch", cls: "bg-[var(--warning-bg)] text-[var(--warning)]" },
  critical: { label: "Poor", cls: "bg-[var(--danger-bg)] text-[var(--danger)]" },
  neutral: { label: "—", cls: "bg-[var(--surface-2)] text-[var(--text-muted)]" },
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  const router = useRouter();

  if (rows.length === 0) {
    return <p className="text-[13px] text-[var(--text-muted)] py-2">No campaigns found for this filter.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left py-2.5 pr-3 text-[var(--text-muted)] font-medium w-4" />
            <th className="text-left py-2.5 pr-4 text-[var(--text-muted)] font-medium min-w-[180px]">Campaign</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">Spend</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">Impressions</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">Clicks</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">Leads</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">Meetings</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">Paid</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">Revenue</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">CTR</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">CPC</th>
            <th className="text-right py-2.5 px-3 text-[var(--text-muted)] font-medium">CPL</th>
            <th className="text-center py-2.5 px-3 text-[var(--text-muted)] font-medium">Health</th>
            <th className="text-right py-2.5 pl-3 text-[var(--text-muted)] font-medium">Spend trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const h = healthLabel[row.health] ?? healthLabel.neutral;
            return (
              <tr
                key={row.id}
                className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                onClick={() => router.push(`/campaigns/${row.id}`)}
              >
                <td className="py-3 pr-3">
                  <span className={`inline-block w-2 h-2 rounded-full ${healthDot[row.health] ?? healthDot.neutral}`} />
                </td>
                <td className="py-3 pr-4 max-w-[220px]">
                  <div className="font-medium truncate">{row.name}</div>
                  <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">{row.status}{row.objective ? ` · ${row.objective}` : ""}</div>
                </td>
                <td className="py-3 px-3 text-right tabular-nums font-medium">{fmt(row.spend)}</td>
                <td className="py-3 px-3 text-right tabular-nums text-[var(--text-2)]">
                  {row.impressions ? row.impressions.toLocaleString("en-IN") : "—"}
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-[var(--text-2)]">
                  {row.clicks ? row.clicks.toLocaleString("en-IN") : "—"}
                </td>
                <td className="py-3 px-3 text-right tabular-nums">{row.leads}</td>
                <td className="py-3 px-3 text-right tabular-nums text-[var(--text-2)]">{row.meetings ?? 0}</td>
                <td className="py-3 px-3 text-right tabular-nums font-medium" style={{ color: (row.paid ?? 0) > 0 ? "var(--success)" : undefined }}>{row.paid ?? 0}</td>
                <td className="py-3 px-3 text-right tabular-nums text-[var(--text-2)]">{(row.revenue ?? 0) > 0 ? row.revenue : "—"}</td>
                <td className="py-3 px-3 text-right tabular-nums text-[var(--text-2)]">{row.ctr.toFixed(2)}%</td>
                <td className="py-3 px-3 text-right tabular-nums text-[var(--text-2)]">
                  {row.cpc ? fmt(row.cpc) : "—"}
                </td>
                <td className="py-3 px-3 text-right tabular-nums">
                  {row.cpl !== null ? fmt(row.cpl) : "—"}
                </td>
                <td className="py-3 px-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10.5px] font-medium ${h.cls}`}>
                    {h.label}
                  </span>
                </td>
                <td className="py-3 pl-3 text-right">
                  <SparklineBar data={row.sparkline} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
