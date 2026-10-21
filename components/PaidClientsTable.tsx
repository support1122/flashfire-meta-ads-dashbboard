import type { PaidClient } from "@/lib/stripe-revenue";

export default function PaidClientsTable({ rows }: { rows: PaidClient[] }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-[var(--text-muted)] py-2">No paid clients in this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left py-2.5 pr-4 text-[var(--text-muted)] font-medium">Campaign</th>
            <th className="text-left py-2.5 px-3 text-[var(--text-muted)] font-medium">Client</th>
            <th className="text-left py-2.5 px-3 text-[var(--text-muted)] font-medium">Email</th>
            <th className="text-left py-2.5 px-3 text-[var(--text-muted)] font-medium">Lead date</th>
            <th className="text-right py-2.5 pl-3 text-[var(--text-muted)] font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.email} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
              <td className="py-2.5 pr-4 font-medium">{r.campaign}</td>
              <td className="py-2.5 px-3">{r.name}</td>
              <td className="py-2.5 px-3 text-[var(--text-2)]">{r.email}</td>
              <td className="py-2.5 px-3 tabular-nums text-[var(--text-2)]">{r.leadDate}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums font-medium">{r.amountDisplay}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
