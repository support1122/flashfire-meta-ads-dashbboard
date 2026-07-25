import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, good: 2 };

function severityConfig(severity: string) {
  if (severity === "critical" || severity === "bad") {
    return {
      label: "Critical",
      dot: "bg-red-500",
      badge: "bg-red-50 text-red-600 border-red-200",
      card: "border-l-red-500 bg-red-50/40",
      icon: "🔴",
    };
  }
  if (severity === "warning" || severity === "watch") {
    return {
      label: "Warning",
      dot: "bg-amber-500",
      badge: "bg-amber-50 text-amber-700 border-amber-200",
      card: "border-l-amber-400 bg-amber-50/40",
      icon: "🟡",
    };
  }
  return {
    label: "Info",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    card: "border-l-emerald-400 bg-emerald-50/40",
    icon: "🟢",
  };
}

function alertCategory(title: string) {
  if (title.toLowerCase().includes("cpl")) return { icon: "₹", label: "Cost per Lead" };
  if (title.toLowerCase().includes("ctr")) return { icon: "↗", label: "Click-Through Rate" };
  if (title.toLowerCase().includes("spend")) return { icon: "⚡", label: "Spend" };
  return { icon: "📋", label: "General" };
}

function timeAgo(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function AlertsPage() {
  const alerts = await prisma.alert.findMany({
    where: { resolved: false },
    orderBy: [{ createdAt: "desc" }],
  });

  const sorted = [...alerts].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  const criticalCount = alerts.filter((a) => a.severity === "critical" || a.severity === "bad").length;
  const warningCount = alerts.filter((a) => a.severity === "warning" || a.severity === "watch").length;
  const goodCount = alerts.filter((a) => a.severity === "good").length;

  const cplAlerts = sorted.filter((a) => a.title.toLowerCase().includes("cpl"));
  const ctrAlerts = sorted.filter((a) => a.title.toLowerCase().includes("ctr"));
  const spendAlerts = sorted.filter((a) => a.title.toLowerCase().includes("spend"));
  const otherAlerts = sorted.filter(
    (a) =>
      !a.title.toLowerCase().includes("cpl") &&
      !a.title.toLowerCase().includes("ctr") &&
      !a.title.toLowerCase().includes("spend")
  );

  const sections = [
    { key: "cpl", label: "Cost per Lead", icon: "₹", items: cplAlerts },
    { key: "ctr", label: "Click-Through Rate", icon: "↗", items: ctrAlerts },
    { key: "spend", label: "Spend", icon: "⚡", items: spendAlerts },
    { key: "other", label: "Other", icon: "📋", items: otherAlerts },
  ].filter((s) => s.items.length > 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[19px] font-semibold m-0">Alerts</h1>
        <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">
          Recomputed on every sync · last 7 days
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold text-[15px]">
            {criticalCount}
          </div>
          <div>
            <div className="text-[12px] text-[var(--text-muted)]">Critical</div>
            <div className="text-[13px] font-semibold text-red-600">
              {criticalCount === 0 ? "None" : `${criticalCount} issue${criticalCount > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-[15px]">
            {warningCount}
          </div>
          <div>
            <div className="text-[12px] text-[var(--text-muted)]">Warnings</div>
            <div className="text-[13px] font-semibold text-amber-700">
              {warningCount === 0 ? "None" : `${warningCount} issue${warningCount > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-[15px]">
            {goodCount}
          </div>
          <div>
            <div className="text-[12px] text-[var(--text-muted)]">Healthy</div>
            <div className="text-[13px] font-semibold text-emerald-700">
              {goodCount === 0 ? "None" : `${goodCount} item${goodCount > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-6 py-12 text-center">
          <div className="text-3xl mb-3">✅</div>
          <div className="text-[14px] font-semibold mb-1">All clear</div>
          <div className="text-[12.5px] text-[var(--text-muted)]">No active alerts. All campaigns are performing within expected ranges.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <div key={section.key} className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4.5 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
                <span className="text-[13px]">{section.icon}</span>
                <span className="text-[13px] font-semibold">{section.label}</span>
                <span className="ml-auto text-[11px] text-[var(--text-muted)] bg-[var(--border)] rounded-full px-2 py-0.5">
                  {section.items.length}
                </span>
              </div>

              {/* Alert rows */}
              <div className="divide-y divide-[var(--border)]">
                {section.items.map((a) => {
                  const cfg = severityConfig(a.severity);
                  return (
                    <div
                      key={a.id}
                      className={`flex gap-4 px-4.5 py-4 border-l-[3px] ${cfg.card}`}
                    >
                      {/* Severity dot */}
                      <div className="pt-0.5 shrink-0">
                        <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="text-[13px] font-semibold text-[var(--text)]">{a.title}</div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)]">{timeAgo(a.createdAt)}</span>
                          </div>
                        </div>
                        <div className="text-[12px] text-[var(--text-2)] mt-1 leading-relaxed">{a.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
