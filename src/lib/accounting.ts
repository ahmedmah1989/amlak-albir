import type { DB } from './types';
import type { Analysis } from './calc';

export interface JLine { date: string; ref: string; desc: string; account: string; debit: number; credit: number; tenant: string; property: string }
const r2 = (x: number) => Math.round(x * 100) / 100;
export const ACC = { ar: 'ذمم المستأجرين', arSettle: 'ذمم المستأجرين - اتفاقات جدولة', rev: 'إيرادات الإيجار', util: 'إيرادات خدمات مستردة (كهرباء ومياه)', pen: 'إيرادات غرامات التأخير', vat: 'ضريبة القيمة المضافة - المخرجات', bank: 'البنك', cash: 'الصندوق', disc: 'خصومات وإعفاءات الإيجار' };
/** قيود الاستحقاق والتحصيل للفترة (أساس الاستحقاق: القسط يُثبت في تاريخ استحقاقه) */
export function journal(db: DB, a: Analysis, from: string, to: string) {
  const out: JLine[] = [];
  const tn = (id: string) => a.T.get(id)?.name ?? '', pn = (id: string) => a.P.get(id)?.short ?? '';
  for (const r of a.rows) {
    if (r.due_date < from || r.due_date > to) continue;
    const c = r.contract, base = { date: r.due_date, ref: `قسط ${r.no}`, tenant: tn(c.tenant_id), property: pn(c.property_id) };
    const desc = `${r.propertyShort} — ${r.unitCode}${r.period_from ? ` (${r.period_from} → ${r.period_to})` : ''}`;
    if (r.kind === 'settlement') { out.push({ ...base, desc: `${desc} • استحقاق دفعة اتفاق جدولة`, account: ACC.ar, debit: r.amount, credit: 0 }, { ...base, desc, account: ACC.arSettle, debit: 0, credit: r.amount }); continue; }
    const vatRate = r.kind === 'rent' || !r.kind ? c.vat_rate ?? 0 : 0;
    const net = vatRate ? r2(r.amount / (1 + vatRate / 100)) : r.amount, tax = r2(r.amount - net);
    out.push({ ...base, desc, account: ACC.ar, debit: r.amount, credit: 0 });
    out.push({ ...base, desc, account: r.kind === 'utility' ? ACC.util : r.kind === 'penalty' ? ACC.pen : ACC.rev, debit: 0, credit: net });
    if (tax) out.push({ ...base, desc: `${desc} • ضريبة ${vatRate}%`, account: ACC.vat, debit: 0, credit: tax });
  }
  for (const x of db.adjustments) {
    if (x.status !== 'approved' || !x.date || x.date < from || x.date > to || x.type === 'ترحيل لاتفاق جدولة') continue;
    const base = { date: x.date, ref: x.decision_no ? `قرار ${x.decision_no}` : x.type, tenant: x.tenant_id ? tn(x.tenant_id) : '', property: x.property_id ? pn(x.property_id) : '' };
    out.push({ ...base, desc: `${x.type} على القسط ${x.installment_no ?? ''}`, account: ACC.disc, debit: x.amount, credit: 0 }, { ...base, desc: x.type, account: ACC.ar, debit: 0, credit: x.amount });
  }
  for (const x of db.adjustments) {
    if (x.status !== 'approved' || x.type !== 'ترحيل لاتفاق جدولة' || !x.date || x.date < from || x.date > to) continue;
    const base = { date: x.date, ref: `قرار ${x.decision_no ?? ''}`, tenant: x.tenant_id ? tn(x.tenant_id) : '', property: x.property_id ? pn(x.property_id) : '' };
    out.push({ ...base, desc: `ترحيل رصيد القسط ${x.installment_no ?? ''} لاتفاق جدولة`, account: ACC.arSettle, debit: x.amount, credit: 0 }, { ...base, desc: 'ترحيل لاتفاق جدولة', account: ACC.ar, debit: 0, credit: x.amount });
  }
  for (const p of a.payments) {
    if (p.paid_on < from || p.paid_on > to) continue;
    const c = p.contract_id ? a.C.get(p.contract_id) : undefined, base = { date: p.paid_on, ref: p.receipt_no, desc: `${p.method}${p.bank_ref ? ` • ${p.bank_ref}` : ''}`, tenant: tn(p.tenant_id), property: c ? pn(c.property_id) : '' };
    out.push({ ...base, account: p.method === 'نقدي' ? ACC.cash : ACC.bank, debit: p.amount, credit: 0 }, { ...base, account: ACC.ar, debit: 0, credit: p.amount });
  }
  out.sort((x, y) => x.date.localeCompare(y.date) || x.ref.localeCompare(y.ref) || y.debit - x.debit);
  const byAcc = new Map<string, { debit: number; credit: number }>();
  for (const l of out) { const v = byAcc.get(l.account) ?? { debit: 0, credit: 0 }; v.debit = r2(v.debit + l.debit); v.credit = r2(v.credit + l.credit); byAcc.set(l.account, v); }
  return { lines: out, byAcc: [...byAcc.entries()], debit: r2(out.reduce((x, l) => x + l.debit, 0)), credit: r2(out.reduce((x, l) => x + l.credit, 0)) };
}
/** ضريبة القيمة المضافة لإيجارات الفترة الخاضعة */
export function vatReport(a: Analysis, from: string, to: string) {
  const rows = a.rows.filter((r) => (r.kind === 'rent' || !r.kind) && (r.contract.vat_rate ?? 0) > 0 && r.due_date >= from && r.due_date <= to).map((r) => {
    const rate = r.contract.vat_rate!, net = r2(r.amount / (1 + rate / 100)), tax = r2(r.amount - net);
    const paidShare = r.amount ? Math.min(1, (r.amount - r.balance) / r.amount) : 0;
    return { r, rate, net, tax, collectedTax: r2(tax * paidShare) };
  });
  return { rows, net: r2(rows.reduce((x, y) => x + y.net, 0)), tax: r2(rows.reduce((x, y) => x + y.tax, 0)), collectedTax: r2(rows.reduce((x, y) => x + y.collectedTax, 0)) };
}
