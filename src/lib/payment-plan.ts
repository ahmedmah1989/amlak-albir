export type PaymentBalance = { id: string; no: number; due_date: string; balance: number };

/** Shared by the receipt preview and saving action; amounts are allocated in halalas. */
export function planPayment(rows: PaymentBalance[], amount: number, first?: string) {
  const cents = (value: number) => Math.round(value * 100);
  const ordered = rows.filter((r) => r.balance > 0).slice().sort((a, b) =>
    Number(b.id === first) - Number(a.id === first) || a.due_date.localeCompare(b.due_date) || a.no - b.no || a.id.localeCompare(b.id));
  let left = Number.isFinite(amount) && amount > 0 ? cents(amount) : 0;
  const total = ordered.reduce((sum, row) => sum + cents(row.balance), 0);
  const allocations = ordered.flatMap((row) => {
    const take = Math.min(left, cents(row.balance));
    left -= take;
    return take > 0 ? [{ ...row, amount: take / 100, remaining: (cents(row.balance) - take) / 100 }] : [];
  });
  return { allocations, total: total / 100, excess: left / 100 };
}
