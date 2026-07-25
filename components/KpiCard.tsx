import type { ReactNode } from "react";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  deltaLabel?: string;
  direction?: "up" | "down" | "flat";
}

export default function KpiCard({ icon, label, value, deltaLabel, direction = "flat" }: KpiCardProps) {
  const deltaColor =
    direction === "up"
      ? "text-[var(--success)]"
      : direction === "down"
      ? "text-[var(--danger)]"
      : "text-[var(--text-muted)]";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-2">
        {icon}
        <span className="text-[11.5px] font-medium">{label}</span>
      </div>
      <div className="text-[20px] font-semibold leading-tight">{value}</div>
      {deltaLabel && (
        <div className={`text-[11px] mt-1 ${deltaColor}`}>{deltaLabel}</div>
      )}
    </div>
  );
}
