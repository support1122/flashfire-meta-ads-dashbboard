"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface TrendRow {
  date: string;
  spend: number;
  leads: number;
  cpl: number | null;
  ctr: number;
  meetings?: number;
  roas?: number | null;
}

type Granularity = "daily" | "weekly" | "monthly";

function weekKey(date: string) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function groupData(data: TrendRow[], granularity: Granularity): TrendRow[] {
  if (granularity === "daily") return data;

  const buckets = new Map<string, { spend: number; leads: number; meetings: number; clicks: number; impressions: number; revenueINR: number }>();

  for (const row of data) {
    const key = granularity === "weekly" ? weekKey(row.date) : monthKey(row.date);
    const existing = buckets.get(key) ?? { spend: 0, leads: 0, meetings: 0, clicks: 0, impressions: 0, revenueINR: 0 };
    existing.spend += row.spend;
    existing.leads += row.leads;
    existing.meetings += row.meetings ?? 0;
    existing.revenueINR += row.roas != null ? row.roas * row.spend : 0;
    buckets.set(key, existing);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      date: key,
      spend: v.spend,
      leads: v.leads,
      meetings: v.meetings,
      cpl: v.leads > 0 ? v.spend / v.leads : null,
      ctr: 0,
      roas: v.spend > 0 && v.revenueINR > 0 ? v.revenueINR / v.spend : null,
    }));
}

function formatLabel(date: string, granularity: Granularity) {
  if (granularity === "monthly") {
    const [y, m] = date.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  }
  return date.slice(5); // MM-DD
}

export default function TrendChart({ data }: { data: TrendRow[] }) {
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const grouped = useMemo(() => groupData(data, granularity), [data, granularity]);

  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-[13px] text-[var(--text-muted)]">
        No data for selected period
      </div>
    );
  }

  const GRANULARITIES: { value: Granularity; label: string }[] = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  return (
    <div>
      {/* Granularity toggle */}
      <div className="flex items-center gap-1 mb-4">
        {GRANULARITIES.map((g) => (
          <button
            key={g.value}
            onClick={() => setGranularity(g.value)}
            className={`px-3 py-1 text-[11.5px] rounded-full border transition-colors ${
              granularity === g.value
                ? "bg-[var(--accent)] border-[var(--accent)] text-white font-medium"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={grouped} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickFormatter={(v) => formatLabel(v, granularity)}
            />
            <YAxis
              yAxisId="spend"
              orientation="left"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              width={48}
            />
            <YAxis
              yAxisId="cpl"
              orientation="right"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => `₹${v.toFixed(0)}`}
              width={48}
            />
            <YAxis yAxisId="leads" orientation="right" hide />
            <YAxis yAxisId="meetings" orientation="right" hide />
            <YAxis yAxisId="roas" orientation="right" hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
              labelFormatter={(v) => formatLabel(String(v), granularity)}
              formatter={(value, name) => {
                const v = value as number;
                if (name === "spend") return [`₹${v.toLocaleString("en-IN")}`, "Spend"];
                if (name === "cpl") return [v != null ? `₹${v.toFixed(0)}` : "—", "CPL"];
                if (name === "leads") return [String(v), "Leads"];
                if (name === "meetings") return [String(v), "Meetings"];
                if (name === "roas") return [v != null ? `${v.toFixed(2)}x` : "—", "ROAS"];
                return [String(v), String(name)];
              }}
            />
            <Area
              yAxisId="spend"
              type="monotone"
              dataKey="spend"
              fill="var(--accent-bg)"
              stroke="var(--accent)"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              yAxisId="cpl"
              type="monotone"
              dataKey="cpl"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="leads"
              type="monotone"
              dataKey="leads"
              stroke="#10b981"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              yAxisId="meetings"
              type="monotone"
              dataKey="meetings"
              stroke="#8b5cf6"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              yAxisId="roas"
              type="monotone"
              dataKey="roas"
              stroke="#ec4899"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
