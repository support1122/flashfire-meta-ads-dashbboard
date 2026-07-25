interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const upper = status.toUpperCase();
  const isActive = upper === "ACTIVE";
  const isPaused = upper === "PAUSED";

  const cls = isActive
    ? "bg-[var(--success-bg)] text-[var(--success)]"
    : isPaused
    ? "bg-[var(--warning-bg)] text-[var(--warning)]"
    : "bg-[var(--surface-2)] text-[var(--text-muted)]";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {status}
    </span>
  );
}
