"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "newest",   label: "Newest first" },
  { value: "spend",    label: "Spend (high → low)" },
  { value: "leads",    label: "Leads (high → low)" },
  { value: "cpl_asc",  label: "CPL (best first)" },
  { value: "cpl_desc", label: "CPL (worst first)" },
  { value: "ctr",      label: "CTR (high → low)" },
];

export default function CreativesSortBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sort") ?? "newest";
  const activeOnly = searchParams.get("activeOnly") === "1";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleActive() {
    const params = new URLSearchParams(searchParams.toString());
    if (activeOnly) params.delete("activeOnly");
    else params.set("activeOnly", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Active only toggle */}
      <button
        onClick={toggleActive}
        className={`px-3 py-1.5 text-[11.5px] rounded-lg border font-medium transition-colors ${
          activeOnly
            ? "bg-[var(--success-bg)] border-[var(--success)] text-[var(--success)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        }`}
      >
        {activeOnly ? "✓ Active only" : "Active only"}
      </button>

      {/* Sort dropdown */}
      <select
        value={currentSort}
        onChange={(e) => update("sort", e.target.value)}
        className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[11.5px] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
