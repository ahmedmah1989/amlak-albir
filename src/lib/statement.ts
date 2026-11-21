import type { DB } from './types';
import type { Analysis } from './calc';

export interface LedgerLine { date: string; kind: 'inst' | 'pay' | 'open' | 'adj'; ref: string; desc: string; debit: number; credit: number; balance: number; href?: string }

/** كشف حساب مستأجر: مدين (الأقساط المستحقة) ودائن (السندات والسداد الافتتاحي والخصومات المعتمدة) برصيد تراكمي */
export function tenantLedger(db: DB, a: Analysis, tenantId: string, opt: { from?: string; to?: string; contractId?: string } = {}) {
  const to = opt.to || a.today, from = opt.from || '';
  const rows = a.rows.filter((r) => r.contract.tenant_id === tenantId && (!opt.contractId || r.contract_id === opt.contractId) && r.due_date <= to);
  const ids = new Set(rows.map((r) => r.id));
  const label = (r: (typeof rows)[number]) => `${r.propertyShort} — ${r.unitCode}`;
  const raw: Omit<LedgerLine, 'balance'>[] = [];
  for (const r of rows) {
    raw.push({ date: r.due_date, kind: 'inst', ref: `قسط ${r.no}`, desc: `${label(r)} • عقد ${r.contract.start_date.slice(0, 4)}${r.period_from ? ` • ${r.period_from} إلى ${r.period_to}` : ''}`, debit: r.amount, credit: 0, href: `/installments/${r.id}` });
    if (r.opening_paid > 0) raw.push({ date: r.due_date, kind: 'open', ref: 'رصيد افتتاحي', desc: `سداد مسجل قبل البرنامج — قسط ${r.no} ${label(r)}`, debit: 0, credit: r.opening_paid, href: `/installments/${r.id}` });
  }
  for (const p of a.payments.filter((p) => p.tenant_id === tenantId && p.paid_on <= to)) {
    const al = db.allocations.filter((x) => x.payment_id === p.id && ids.has(x.installment_id));
    const amt = opt.contractId ? al.reduce((x, y) => x + y.amount, 0) : p.amount;
    if (!amt) continue;
    const nos = al.map((x) => rows.find((r) => r.id === x.installment_id)?.no).filter(Boolean).join('، ');
    raw.push({ date: p.paid_on, kind: 'pay', ref: p.receipt_no, desc: `${p.method}${p.bank_ref ? ` • ${p.bank_ref}` : ''}${nos ? ` • عن الأقساط ${nos}` : ''}`, debit: 0, credit: amt, href: `/payments/${p.id}` });
  }
  for (const x of db.adjustments.filter((x) => x.status === 'approved' && x.installment_id && ids.has(x.installment_id))) {
    const r = rows.find((z) => z.id === x.installment_id)!;
    raw.push({ date: x.date ?? r.due_date, kind: 'adj', ref: x.type, desc: `قسط ${r.no}${x.decision_no ? ` • قرار ${x.decision_no}` : ''}`, debit: 0, credit: x.amount, href: `/installments/${r.id}` });
  }
  const order = { inst: 0, open: 1, adj: 2, pay: 3 };
  raw.sort((p, q) => p.date.localeCompare(q.date) || order[p.kind] - order[q.kind] || p.ref.localeCompare(q.ref));
  let bal = 0, opening = 0; const lines: LedgerLine[] = [];
  for (const l of raw) {
    bal = Math.round((bal + l.debit - l.credit) * 100) / 100;
    if (from && l.date < from) { opening = bal; continue; }
    lines.push({ ...l, balance: bal });
  }
  const inRange = lines;
  return { opening, lines: inRange, closing: bal, debit: inRange.reduce((x, l) => x + l.debit, 0), credit: inRange.reduce((x, l) => x + l.credit, 0), from, to };
}
