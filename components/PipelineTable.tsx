"use client";

import { useState } from "react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  attended:    { label: "Attended",    color: "var(--success, #22c55e)" },
  paid:        { label: "Paid",        color: "var(--accent, #6366f1)" },
  "no-show":   { label: "No Show",     color: "var(--danger, #ef4444)" },
  canceled:    { label: "Cancelled",   color: "var(--warning, #f59e0b)" },
  rescheduled: { label: "Rescheduled", color: "#a78bfa" },
  scheduled:   { label: "Scheduled",  color: "var(--text-2, #94a3b8)" },
};

type Row = {
  campaign: string;
  byStatus: Record<string, number>;
  paid: number;
};

export default function PipelineTable({ rows, allStatuses }: { rows: Row[]; allStatuses: string[] }) {
  const [mode, setMode] = useState<"count" | "pct">("count");

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] overflow-x-auto">
      {/* Toggle */}
      <div className="flex justify-end px-4 pt-3 pb-1">
        <div className="flex text-[12px] border border-[var(--border)] rounded-md overflow-hidden">
          <button
            onClick={() => setMode("count")}
            className={`px-3 py-1 transition-colors ${mode === "count" ? "bg-[var(--accent)] text-white font-medium" : "text-[var(--text-2)] hover:bg-[var(--surface-2)]"}`}
          >
            Count
          </button>
          <button
            onClick={() => setMode("pct")}
            className={`px-3 py-1 transition-colors ${mode === "pct" ? "bg-[var(--accent)] text-white font-medium" : "text-[var(--text-2)] hover:bg-[var(--surface-2)]"}`}
          >
            %
          </button>
        </div>
      </div>

      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left py-3 px-4 text-[var(--text-muted)] font-medium whitespace-nowrap">Campaign</th>
            {allStatuses.map((s) => (
              <th key={s} className="text-right py-3 px-3 font-medium whitespace-nowrap" style={{ color: STATUS_LABELS[s]?.color }}>
                {STATUS_LABELS[s]?.label ?? s}
              </th>
            ))}
            <th className="text-right py-3 px-4 font-medium whitespace-nowrap" style={{ color: "var(--accent)" }}>
              Paid
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowTotal = allStatuses.reduce((sum, s) => sum + (row.byStatus[s] ?? 0), 0) + row.paid;
            const display = (val: number, color: string) => {
              if (!val) return <span className="text-[var(--text-muted)]">—</span>;
              if (mode === "pct") {
                const p = rowTotal > 0 ? ((val / rowTotal) * 100).toFixed(0) : "0";
                return <span style={{ color }}>{p}%</span>;
              }
              return <span style={{ color }}>{val}</span>;
            };
            return (
              <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                <td className="py-3 px-4 font-medium max-w-[220px] truncate">{row.campaign}</td>
                {allStatuses.map((s) => (
                  <td key={s} className="py-3 px-3 text-right tabular-nums">
                    {display(row.byStatus[s] ?? 0, STATUS_LABELS[s]?.color)}
                  </td>
                ))}
                <td className="py-3 px-4 text-right tabular-nums font-semibold">
                  {display(row.paid, "var(--accent)")}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={1 + allStatuses.length + 1} className="py-8 text-center text-[var(--text-muted)]">
                No data for selected date range
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
