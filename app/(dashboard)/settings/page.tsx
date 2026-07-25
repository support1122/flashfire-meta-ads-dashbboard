import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const recentSyncs = await prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 });

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[19px] font-semibold m-0">Settings</h1>
        <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">Sync history and account info</div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4.5 py-4">
        <div className="text-sm font-semibold mb-3.5">Recent syncs</div>
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              {["Ran at", "Status", "Message"].map((h) => (
                <th key={h} className="text-left font-semibold text-[var(--text-2)] text-[11.5px] uppercase tracking-wide px-2.5 py-2 border-b border-[var(--border)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentSyncs.map((s) => (
              <tr key={s.id}>
                <td className="px-2.5 py-2.5 border-b border-[var(--border)]">{new Date(s.createdAt).toLocaleString("en-IN")}</td>
                <td className="px-2.5 py-2.5 border-b border-[var(--border)]">
                  <span className={s.status === "success" ? "text-[var(--success)] font-semibold" : "text-[var(--danger)] font-semibold"}>
                    {s.status}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 border-b border-[var(--border)] text-[var(--text-2)]">{s.message}</td>
              </tr>
            ))}
            {recentSyncs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2.5 py-6 text-center text-[var(--text-muted)]">
                  No syncs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
