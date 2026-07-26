"use client";

import { useState } from "react";

type User = { id: string; username: string; role: string; createdAt: string };

export default function UserManager({ initialUsers, currentUsername }: { initialUsers: User[]; currentUsername: string }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [newUsername, setNewUsername] = useState("");
  const [creating, setCreating] = useState(false);
  const [newCreds, setNewCreds] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createUser() {
    if (!newUsername.trim()) return;
    setCreating(true);
    setError(null);
    setNewCreds(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername.trim() }),
    });
    const json = await res.json();
    setCreating(false);
    if (!json.ok) { setError(json.error); return; }
    setUsers((u) => [...u, json.user]);
    setNewCreds({ username: json.user.username, password: json.plainPassword });
    setNewUsername("");
  }

  async function deleteUser(id: string) {
    if (!confirm("Revoke access for this user? They will be logged out on next request.")) return;
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!json.ok) { alert(json.error); return; }
    setUsers((u) => u.filter((x) => x.id !== id));
  }

  return (
    <div>
      {/* New credentials banner */}
      {newCreds && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--success-bg)] border border-[var(--success)] text-[12.5px]">
          <div className="font-semibold text-[var(--success)] mb-1">✓ User created — share these credentials once, they won't be shown again</div>
          <div className="font-mono mt-1">Username: <strong>{newCreds.username}</strong></div>
          <div className="font-mono">Password: <strong>{newCreds.password}</strong></div>
          <button onClick={() => setNewCreds(null)} className="mt-2 text-[11px] text-[var(--text-muted)] underline">Dismiss</button>
        </div>
      )}

      {/* Create user */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createUser()}
          placeholder="Enter username for new user"
          className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-[12.5px] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          onClick={createUser}
          disabled={creating || !newUsername.trim()}
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-[12.5px] font-medium hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create user"}
        </button>
      </div>
      {error && <p className="text-[var(--danger)] text-xs mb-3">{error}</p>}

      {/* User list */}
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left py-2 px-2 text-[var(--text-muted)] font-medium">Username</th>
            <th className="text-left py-2 px-2 text-[var(--text-muted)] font-medium">Role</th>
            <th className="text-left py-2 px-2 text-[var(--text-muted)] font-medium">Created</th>
            <th className="py-2 px-2" />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-[var(--border)]">
              <td className="py-2.5 px-2 font-medium">{u.username}</td>
              <td className="py-2.5 px-2">
                <span className={`inline-block px-2 py-0.5 rounded text-[10.5px] font-medium ${u.role === "admin" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--text-2)]"}`}>
                  {u.role}
                </span>
              </td>
              <td className="py-2.5 px-2 text-[var(--text-muted)]">{new Date(u.createdAt).toLocaleDateString("en-IN")}</td>
              <td className="py-2.5 px-2 text-right">
                {u.username !== currentUsername && u.role !== "admin" && (
                  <button
                    onClick={() => deleteUser(u.id)}
                    className="text-[11px] text-[var(--danger)] hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
