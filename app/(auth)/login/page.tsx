"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Login failed");
        setLoading(false);
        return;
      }
      const next = searchParams.get("next") || "/";
      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[10px] p-8 shadow-sm"
      >
        <div className="flex items-center gap-2 font-semibold text-[15px] mb-6">
          <span className="text-[var(--accent)] text-xl">◆</span> Meta Ads Dashboard
        </div>
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-3 bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="Enter username"
        />
        <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-3 bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="Enter password"
        />
        {error && <p className="text-[var(--danger)] text-xs mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--text)] text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
