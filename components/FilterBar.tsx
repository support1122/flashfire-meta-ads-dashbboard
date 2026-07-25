"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface Campaign {
  id: string;
  name: string;
}

interface FilterBarProps {
  campaigns: Campaign[];
}

export default function FilterBar({ campaigns }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const DATE_PRESETS = [
    { label: "7d", days: 7 },
    { label: "14d", days: 14 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
  ];

  function applyPreset(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", fmt(from));
    params.set("to", fmt(to));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.days)}
            className="px-2.5 py-1 text-[11.5px] rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--accent-bg)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      <input
        type="date"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => update("from", e.target.value)}
        className="border border-[var(--border)] rounded-md px-2 py-1 text-[11.5px] bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
      <span className="text-[var(--text-muted)] text-xs">–</span>
      <input
        type="date"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => update("to", e.target.value)}
        className="border border-[var(--border)] rounded-md px-2 py-1 text-[11.5px] bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />

      {campaigns.length > 0 && (
        <select
          value={searchParams.get("campaignId") ?? ""}
          onChange={(e) => update("campaignId", e.target.value)}
          className="w-40 border border-[var(--border)] rounded-md px-2 py-1 text-[11.5px] bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] truncate"
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <select
        value={searchParams.get("status") ?? ""}
        onChange={(e) => update("status", e.target.value)}
        className="w-28 border border-[var(--border)] rounded-md px-2 py-1 text-[11.5px] bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      >
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="PAUSED">Paused</option>
      </select>
    </div>
  );
}
