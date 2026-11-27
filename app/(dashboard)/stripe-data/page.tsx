"use client";

import { useEffect, useState } from "react";
import { CreditCard, TrendingUp, Users, Zap } from "lucide-react";

type Client = {
  name: string;
  email: string;
  source: "Meta" | "Referral" | "Direct";
  detail: string;
  monthLabel: string;
  date: string;
  plan: string;
};

type MonthSummary = {
  label: string;
  total: number;
  meta: number;
  referral: number;
  direct: number;
  clients: Client[];
};

const SOURCE_COLORS: Record<string, string> = {
  Meta: "var(--accent, #6366f1)",
  Referral: "#22c55e",
  Direct: "#f59e0b",
};

const SOURCE_BG: Record<string, string> = {
  Meta: "rgba(99,102,241,0.12)",
  Referral: "rgba(34,197,94,0.12)",
  Direct: "rgba(245,158,11,0.12)",
};

function Badge({ source }: { source: string }) {
  return (
    <span
      style={{
        background: SOURCE_BG[source] || "var(--surface-2)",
        color: SOURCE_COLORS[source] || "var(--text)",
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 20,
        display: "inline-block",
      }}
    >
      {source}
    </span>
  );
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          background: `${color}1a`,
          borderRadius: 8,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function StripeDataPage() {
  const [data, setData] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/stripe-source?months=${months}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d.monthlyData || []);
        // Auto-expand latest month
        const latest = d.monthlyData?.[d.monthlyData.length - 1];
        if (latest) setExpanded(latest.label);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [months]);

  // Totals across all months
  const totals = data.reduce(
    (acc, m) => {
      acc.total += m.total;
      acc.meta += m.meta;
      acc.referral += m.referral;
      acc.direct += m.direct;
      return acc;
    },
    { total: 0, meta: 0, referral: 0, direct: 0 }
  );

  return (
    <div>
      {/* Header */}
      <div
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}
      >
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>Stripe Payments</h1>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
            Source breakdown — Meta · Referral · Direct
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Show last</span>
          {[3, 6, 12].map((n) => (
            <button
              key={n}
              onClick={() => setMonths(n)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: months === n ? "var(--accent)" : "var(--surface)",
                color: months === n ? "#fff" : "var(--text)",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: months === n ? 600 : 400,
              }}
            >
              {n}mo
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}
      >
        <StatCard label="Total Paid" value={totals.total} color="#6366f1" icon={CreditCard} />
        <StatCard label="Meta" value={totals.meta} color="#6366f1" icon={Zap} />
        <StatCard label="Referral" value={totals.referral} color="#22c55e" icon={Users} />
        <StatCard label="Direct" value={totals.direct} color="#f59e0b" icon={TrendingUp} />
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: 13 }}>
          Loading payment data…
        </div>
      )}
      {error && (
        <div
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #ef4444", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#ef4444" }}
        >
          Error: {error}
        </div>
      )}

      {/* Month-wise accordion */}
      {!loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...data].reverse().map((month) => {
            const isOpen = expanded === month.label;
            const metaPct = month.total ? Math.round((month.meta / month.total) * 100) : 0;
            const refPct = month.total ? Math.round((month.referral / month.total) * 100) : 0;
            const dirPct = month.total ? Math.round((month.direct / month.total) * 100) : 0;

            return (
              <div
                key={month.label}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {/* Month header row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : month.label)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, minWidth: 90 }}>{month.label}</span>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", minWidth: 60 }}>
                    {month.total} paid
                  </span>

                  {/* Mini bar */}
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden", display: "flex" }}>
                    {month.meta > 0 && (
                      <div style={{ width: `${metaPct}%`, background: "#6366f1", transition: "width 0.3s" }} />
                    )}
                    {month.referral > 0 && (
                      <div style={{ width: `${refPct}%`, background: "#22c55e", transition: "width 0.3s" }} />
                    )}
                    {month.direct > 0 && (
                      <div style={{ width: `${dirPct}%`, background: "#f59e0b", transition: "width 0.3s" }} />
                    )}
                  </div>

                  {/* Pill counts */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {month.meta > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#6366f1", background: "rgba(99,102,241,0.12)", padding: "2px 8px", borderRadius: 20 }}>
                        {month.meta} Meta
                      </span>
                    )}
                    {month.referral > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#22c55e", background: "rgba(34,197,94,0.12)", padding: "2px 8px", borderRadius: 20 }}>
                        {month.referral} Ref
                      </span>
                    )}
                    {month.direct > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b", background: "rgba(245,158,11,0.12)", padding: "2px 8px", borderRadius: 20 }}>
                        {month.direct} Direct
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 16, color: "var(--text-muted)", marginLeft: 4 }}>
                    {isOpen ? "▲" : "▼"}
                  </span>
                </button>

                {/* Expanded client table */}
                {isOpen && month.clients.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ background: "var(--surface-2)" }}>
                          <th style={{ padding: "8px 18px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Date</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Name</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Email</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Plan</th>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Source</th>
                          <th style={{ padding: "8px 18px 8px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {month.clients
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((c, i) => (
                            <tr
                              key={`${c.email}-${i}`}
                              style={{ borderTop: "1px solid var(--border)" }}
                            >
                              <td style={{ padding: "9px 18px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{c.date.slice(5)}</td>
                              <td style={{ padding: "9px 12px", fontWeight: 500 }}>{c.name}</td>
                              <td style={{ padding: "9px 12px", color: "var(--text-muted)", fontSize: 11.5 }}>{c.email}</td>
                              <td style={{ padding: "9px 12px", color: "var(--text-muted)" }}>{c.plan || "—"}</td>
                              <td style={{ padding: "9px 12px" }}>
                                <Badge source={c.source} />
                              </td>
                              <td style={{ padding: "9px 18px 9px 12px", color: "var(--text-muted)", fontSize: 11.5, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.detail}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {isOpen && month.clients.length === 0 && (
                  <div style={{ padding: "16px 18px", color: "var(--text-muted)", fontSize: 13, borderTop: "1px solid var(--border)" }}>
                    No paid clients this month.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {!loading && !error && (
        <div
          style={{ marginTop: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Source Classification
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {[
              { label: "Meta", color: "#6366f1", desc: "leadSource = meta_lead_ad OR utmMedium = paid with campaign name" },
              { label: "Referral", desc: "Profile referredBy field has a real person name (non-junk)", color: "#22c55e" },
              { label: "Direct", desc: "No Meta campaign, no referral — came via website or other organic", color: "#f59e0b" },
            ].map(({ label, color, desc }) => (
              <div key={label} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 600, color, flexShrink: 0 }}>{label}</span>
                <span style={{ color: "var(--text-muted)" }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
