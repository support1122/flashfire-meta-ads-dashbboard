"use client";

import type { ReactNode } from "react";
import { useState } from "react";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tooltip?: string;
  deltaLabel?: string;
  direction?: "up" | "down" | "flat";
}

export default function KpiCard({ icon, label, value, subtitle, tooltip, deltaLabel, direction = "flat" }: KpiCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const deltaColor =
    direction === "up"
      ? "text-[var(--success)]"
      : direction === "down"
      ? "text-[var(--danger)]"
      : "text-[var(--text-muted)]";

  return (
    <div
      className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4 py-3.5 relative"
      onMouseEnter={() => tooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-2">
        {icon}
        <span className="text-[11.5px] font-medium">{label}</span>
        {tooltip && (
          <span className="ml-auto text-[10px] text-[var(--text-muted)] opacity-50">ⓘ</span>
        )}
      </div>
      <div className="text-[20px] font-semibold leading-tight">{value}</div>
      {subtitle && (
        <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">{subtitle}</div>
      )}
      {deltaLabel && (
        <div className={`text-[11px] mt-1 ${deltaColor}`}>{deltaLabel}</div>
      )}

      {/* Tooltip */}
      {showTooltip && tooltip && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-52 bg-[#1e1e2e] text-white text-[11.5px] rounded-lg px-3 py-2 shadow-lg leading-relaxed pointer-events-none">
          {tooltip}
          <div className="absolute top-full left-4 border-4 border-transparent border-t-[#1e1e2e]" />
        </div>
      )}
    </div>
  );
}
