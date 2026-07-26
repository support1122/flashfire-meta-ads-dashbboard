"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  Image,
  Users,
  Wallet,
  Bell,
  RefreshCw,
  Settings,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/creatives", label: "Creatives", icon: Image },
  { href: "/audience", label: "Audience", icon: Users },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col min-h-screen px-3 py-4">
      <div className="flex items-center gap-2 font-semibold text-[14px] px-2 mb-6">
        <span className="text-[var(--accent)] text-lg">◆</span>
        <span>Meta Ads</span>
      </div>

      <nav className="flex-1 flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                isActive
                  ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium"
                  : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          );
        })}

        <div className="my-1 border-t border-[var(--border)]" />

        <form action="/api/sync" method="GET" target="_blank">
          <button
            type="submit"
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
          >
            <RefreshCw size={14} />
            Sync now
          </button>
        </form>

        <Link
          href="/settings"
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
            pathname === "/settings"
              ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium"
              : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          }`}
        >
          <Settings size={14} />
          Settings
        </Link>

        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)] transition-colors"
        >
          <LogOut size={14} />
          Log out
        </button>
      </nav>
    </aside>
  );
}
