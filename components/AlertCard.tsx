interface AlertCardProps {
  severity: "bad" | "watch" | "good" | "critical" | "warning";
  title: string;
  body: string;
}

export default function AlertCard({ severity, title, body }: AlertCardProps) {
  const isCritical = severity === "bad" || severity === "critical";
  const isWarning = severity === "watch" || severity === "warning";

  const dot = isCritical
    ? "bg-[var(--danger)]"
    : isWarning
    ? "bg-[var(--warning)]"
    : "bg-[var(--success)]";

  const bg = isCritical
    ? "bg-[var(--danger-bg)] border-[var(--danger)]"
    : isWarning
    ? "bg-[var(--warning-bg)] border-[var(--warning)]"
    : "bg-[var(--success-bg)] border-[var(--success)]";

  const titleColor = isCritical
    ? "text-[var(--danger)]"
    : isWarning
    ? "text-[var(--warning)]"
    : "text-[var(--success)]";

  return (
    <div className={`flex gap-2.5 border rounded-lg px-3.5 py-3 mb-2.5 ${bg}`}>
      <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dot}`} />
      <div>
        <div className={`text-[12.5px] font-semibold ${titleColor}`}>{title}</div>
        <div className="text-[12px] text-[var(--text-2)] mt-0.5">{body}</div>
      </div>
    </div>
  );
}
