"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

interface TrendRow {
  date: string;
  leads: number;
  meetings?: number;
  bookingRate?: number | null;
}

type Granularity = "daily" | "weekly" | "monthly";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

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

  const buckets = new Map<string, { leads: number; meetings: number }>();

  for (const row of data) {
    const key = granularity === "weekly" ? weekKey(row.date) : monthKey(row.date);
    const existing = buckets.get(key) ?? { leads: 0, meetings: 0 };
    existing.leads += row.leads;
    existing.meetings += row.meetings ?? 0;
    buckets.set(key, existing);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      date: key,
      leads: v.leads,
      meetings: v.meetings,
      bookingRate: v.leads > 0 ? (v.meetings / v.leads) * 100 : null,
    }));
}

function formatLabel(date: string, granularity: Granularity) {
  if (granularity === "monthly") {
    const [y, m] = date.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  }
  return date.slice(5);
}

const BTN = "px-2.5 py-1 text-[11.5px] rounded-md border transition-colors";
const BTN_DEFAULT = `${BTN} border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]`;
const BTN_PILL = "px-3 py-1 text-[11.5px] rounded-full border transition-colors";
const BTN_PILL_ACTIVE = `${BTN_PILL} bg-[var(--accent)] border-[var(--accent)] text-white font-medium`;
const BTN_PILL_DEFAULT = `${BTN_PILL} border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]`;

export default function BookingRateChart({ data }: { data: TrendRow[] }) {
  const [granularity, setGranularity] = useState<Granularity>("daily");

  // Internal date range — defaults to MTD
  const todayStr = fmt(new Date());
  const mtdFromStr = fmt(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const [from, setFrom] = useState<string>(mtdFromStr);
  const [to, setTo] = useState<string>(todayStr);
  const [activePreset, setActivePreset] = useState<string>("MTD");

  const GRANULARITIES: { value: Granularity; label: string }[] = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  function applyMTD() {
    const now = new Date();
    setFrom(fmt(new Date(now.getFullYear(), now.getMonth(), 1)));
    setTo(fmt(now));
    setActivePreset("MTD");
  }

  function applyDays(days: number) {
    const now = new Date();
    const f = new Date();
    f.setDate(f.getDate() - days + 1);
    setFrom(fmt(f));
    setTo(fmt(now));
    setActivePreset(`${days}d`);
  }

  // Filter data to internal date range
  const filtered = useMemo(() => {
    return data.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return true;
    });
  }, [data, from, to]);

  const grouped = useMemo(() => groupData(filtered, granularity), [filtered, granularity]);

  const avg = useMemo(() => {
    const valid = grouped.filter((r) => r.bookingRate != null).map((r) => r.bookingRate as number);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  }, [grouped]);

  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-[13px] text-[var(--text-muted)]">
        No data for selected period
      </div>
    );
  }

  return (
    <div>
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">

        {/* Left: granularity pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {GRANULARITIES.map((g) => (
            <button
              key={g.value}
              onClick={() => setGranularity(g.value)}
              className={granularity === g.value ? BTN_PILL_ACTIVE : BTN_PILL_DEFAULT}
            >
              {g.label}
            </button>
          ))}

          <div className="w-px h-4 bg-[var(--border)] mx-1" />

          {/* Quick date presets */}
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => applyDays(d)}
              className={activePreset === `${d}d` ? `${BTN} bg-[var(--accent)] border-[var(--accent)] text-white font-medium` : BTN_DEFAULT}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={applyMTD}
            className={activePreset === "MTD" ? `${BTN} bg-[var(--accent)] border-[var(--accent)] text-white font-medium` : BTN_DEFAULT}
          >
            MTD
          </button>
        </div>

        {/* Right: date inputs + avg */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setActivePreset(""); }}
            className="border border-[var(--border)] rounded-md px-2 py-1 text-[11.5px] bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <span className="text-[var(--text-muted)] text-xs">–</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setActivePreset(""); }}
            className="border border-[var(--border)] rounded-md px-2 py-1 text-[11.5px] bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          {avg !== null && (
            <div className="text-[11.5px] text-[var(--text-muted)] ml-2">
              Avg: <span className="font-semibold text-[var(--text-1)]">{avg.toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={grouped} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickFormatter={(v) => formatLabel(v, granularity)}
            />
            <YAxis
              yAxisId="rate"
              orientation="left"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              width={40}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
              labelFormatter={(v) => formatLabel(String(v), granularity)}
              formatter={(value, name) => {
                const v = value as number;
                if (name === "bookingRate") return [v != null ? `${v.toFixed(1)}%` : "—", "Booking Rate"];
                if (name === "leads") return [String(v), "Leads"];
                if (name === "meetings") return [String(v), "Meetings"];
                return [String(v), String(name)];
              }}
            />
            {avg !== null && (
              <ReferenceLine
                yAxisId="rate"
                y={avg}
                stroke="#f97316"
                strokeDasharray="4 3"
                strokeOpacity={0.5}
              />
            )}
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="bookingRate"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ r: 3, fill: "#f97316" }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
