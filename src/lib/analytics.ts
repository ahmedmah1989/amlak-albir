/** تحليلات الإدارة: مؤشرات فترة، مقارنتها، أداء كل عقار، اتجاه شهري، وملاحظات آلية */
import type { DB } from './types';
import type { Analysis } from './calc';
import { addDays, addMonths, daysBetween } from './calc';
import { money, pct } from './fmt';

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const minD = (a: string, b: string) => (a < b ? a : b);
export const monthsIn = (from: string, to: string, cap = 36) => { const out: string[] = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7) && out.length < cap; m = addMonths(m + '-01', 1).slice(0, 7)) out.push(m); return out; };
const monthEnd = (m: string) => addDays(addMonths(m + '-01', 1), -1);

export type Metrics = ReturnType<typeof periodMetrics>;
export function periodMetrics(db: DB, a: Analysis, from: string, to: string, props: string[] = []) {
  const inP = (pid: string | undefined) => !!pid && (!props.length || props.includes(pid));
  const rng = (d: string | null | undefined) => !!d && d >= from && d <= to;
  const rows = a.rows.filter((r) => inP(r.contract.property_id) && rng(r.due_date));
  const pays = a.payments.filter((p) => inP(a.payProp(p)) && rng(p.paid_on));
  const exps = db.expenses.filter((e) => inP(e.property_id) && rng(e.date));
  const due = sum(rows.map((r) => r.amount));
  const settled = sum(rows.filter((r) => r.due_date <= a.today).map((r) => Math.min(r.amount, r.paidTotal + r.adjusted)));
  const dueToDate = sum(rows.filter((r) => r.due_date <= a.today).map((r) => r.amount));
  const collected = sum(pays.map((p) => p.amount)), expenses = sum(exps.map((e) => e.amount));
  const payIds = new Set(pays.map((p) => p.id)), R = new Map(a.rows.map((r) => [r.id, r]));
  let w = 0, d = 0; for (const al of db.allocations) { if (!payIds.has(al.payment_id)) continue; const r = R.get(al.installment_id), p = pays.find((x) => x.id === al.payment_id); if (!r || !p) continue; w += al.amount; d += al.amount * Math.max(0, daysBetween(r.due_date, p.paid_on)); }
  const at = minD(to, a.today), occ = occupancyAt(db, at, props);
  const started = db.contracts.filter((c) => inP(c.property_id) && rng(c.start_date) && !c.renewed_from).length;
  const renewed = db.contracts.filter((c) => inP(c.property_id) && rng(c.start_date) && !!c.renewed_from).length;
  const ended = db.contracts.filter((c) => inP(c.property_id) && rng(c.vacated_on ?? c.end_date) && !db.contracts.some((n) => n.renewed_from === c.id)).length;
  const days = Math.max(1, daysBetween(from, to) + 1);
  const value = sum(db.properties.filter((p) => inP(p.id)).map((p) => a.bookValue(p.id)));
  const net = Math.round((collected - expenses) * 100) / 100;
  return { from, to, days, due, dueToDate, settled, collRate: dueToDate ? (settled / dueToDate) * 100 : null, collected, expenses, net, avgDelay: w ? Math.round(d / w) : null,
    occ, started, renewed, ended, value, netYield: value ? ((net * 365) / days / value) * 100 : null, receipts: pays.length };
}

/** الوحدات الإيجارية المشغولة في تاريخ: عقد بدأ ولم ينتهِ (أو يُخلَ) بعد */
export function occupancyAt(db: DB, at: string, props: string[] = []) {
  const units = db.units.filter((u) => u.kind === 'lease' && (!props.length || props.includes(u.property_id)));
  const busy = new Set(db.contracts.filter((c) => c.start_date <= at && (c.vacated_on ?? c.end_date) >= at).map((c) => c.unit_id));
  const occupied = units.filter((u) => busy.has(u.id)).length;
  return { units: units.length, occupied, rate: units.length ? (occupied / units.length) * 100 : null };
}

export function monthlySeries(db: DB, a: Analysis, months: string[], props: string[] = [], shift = 0) {
  return months.map((m0) => {
    const m = shift ? addMonths(m0 + '-01', shift).slice(0, 7) : m0;
    const x = periodMetrics(db, a, m + '-01', monthEnd(m), props);
    return { m: m0, real: m, due: x.due, collected: x.collected, expenses: x.expenses, net: x.net, occ: x.occ.rate, future: m + '-01' > a.today };
  });
}

export function propertyTable(db: DB, a: Analysis, from: string, to: string, props: string[] = []) {
  return db.properties.filter((p) => !props.length || props.includes(p.id)).map((p) => {
    const m = periodMetrics(db, a, from, to, [p.id]), s = a.propStats.find((x) => x.p.id === p.id)!;
    return { p, m, rent: s.rent, arrears: s.arrears, value: s.bv, grossYield: s.bv ? (s.rent / s.bv) * 100 : null };
  });
}

export type Insight = { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string; href?: string };
export function insights(cur: Metrics, prev: Metrics | null, cmpLabel: string, table: ReturnType<typeof propertyTable>, a: Analysis): Insight[] {
  const out: Insight[] = [];
  const ch = (x: number, y: number) => (y ? ((x - y) / Math.abs(y)) * 100 : null);
  if (prev) {
    const c = ch(cur.collected, prev.collected);
    if (c != null && Math.abs(c) >= 5) out.push({ tone: c > 0 ? 'ok' : 'bad', text: `المحصّل ${c > 0 ? 'ارتفع' : 'انخفض'} ${Math.abs(c).toFixed(0)}% مقارنة بـ${cmpLabel} (${money(cur.collected)} مقابل ${money(prev.collected)} ريال).`, href: '/reports/collection' });
    const e = ch(cur.expenses, prev.expenses);
    if (e != null && e >= 20 && cur.expenses - prev.expenses > 1000) out.push({ tone: 'warn', text: `المصروفات زادت ${e.toFixed(0)}% عن ${cmpLabel} بفرق ${money(cur.expenses - prev.expenses)} ريال.`, href: '/reports/expenses' });
    if (cur.collRate != null && prev.collRate != null && Math.abs(cur.collRate - prev.collRate) >= 5) out.push({ tone: cur.collRate > prev.collRate ? 'ok' : 'bad', text: `نسبة تحصيل مستحقات الفترة ${pct(cur.collRate)} مقابل ${pct(prev.collRate)} في ${cmpLabel}.` });
    if (cur.occ.rate != null && prev.occ.rate != null && cur.occ.occupied !== prev.occ.occupied) out.push({ tone: cur.occ.occupied > prev.occ.occupied ? 'ok' : 'warn', text: `الوحدات المؤجرة ${cur.occ.occupied} من ${cur.occ.units} مقابل ${prev.occ.occupied} في ${cmpLabel}.`, href: '/reports/occupancy' });
  }
  if (cur.collRate != null && cur.collRate < 80) out.push({ tone: 'bad', text: `تم تحصيل ${pct(cur.collRate)} فقط من مستحقات الفترة حتى اليوم؛ المتبقي ${money(cur.dueToDate - cur.settled)} ريال.`, href: '/reports/arrears' });
  if (cur.avgDelay != null && cur.avgDelay > 30) out.push({ tone: 'warn', text: `متوسط تأخر السداد في الفترة ${cur.avgDelay} يوماً بعد تاريخ الاستحقاق.`, href: '/reports/tenant-score' });
  const idle = table.filter((t) => t.rent === 0);
  if (idle.length) out.push({ tone: 'bad', text: `${idle.length} عقار بلا عقد ساري: ${idle.map((t) => t.p.short).join('، ')}${sum(idle.map((t) => t.value)) ? ` (قيمتها ${money(sum(idle.map((t) => t.value)))} ريال)` : ''}.`, href: '/reports/occupancy' });
  const low = table.filter((t) => t.rent > 0 && t.m.netYield != null && t.m.netYield < 3).sort((x, y) => (x.m.netYield ?? 0) - (y.m.netYield ?? 0));
  if (low.length) out.push({ tone: 'warn', text: `عائد صافٍ سنوي أقل من 3% على القيمة: ${low.slice(0, 4).map((t) => `${t.p.short} (${pct(t.m.netYield!)})`).join('، ')}.`, href: '/reports/performance' });
  const noVal = table.filter((t) => !t.value);
  if (noVal.length) out.push({ tone: 'info', text: `${noVal.length} عقار بلا قيمة أرض ومبنى، فلا يُحسب له عائد: ${noVal.slice(0, 5).map((t) => t.p.short).join('، ')}.`, href: '/reports/valuations' });
  const soon = a.renewals.filter((r) => r.days >= 0 && r.days <= 90);
  if (soon.length) out.push({ tone: 'warn', text: `${soon.length} عقد ينتهي خلال 90 يوماً بإيجار سنوي ${money(sum(soon.map((r) => r.c.annual_rent)))} ريال.`, href: '/reports/renewals?days=90' });
  const top = [...a.tenantStats].filter((t) => t.arrears > 0).sort((x, y) => y.arrears - x.arrears);
  if (top.length && a.arrearsTotal) { const share = (sum(top.slice(0, 3).map((t) => t.arrears)) / a.arrearsTotal) * 100; if (share >= 50) out.push({ tone: 'info', text: `أكبر 3 متأخرين يمثلون ${share.toFixed(0)}% من المتأخرات (${top.slice(0, 3).map((t) => t.t.name).join('، ')}).`, href: '/reports/arrears' }); }
  if (!out.length) out.push({ tone: 'ok', text: 'لا ملاحظات جوهرية في هذه الفترة.' });
  return out;
}
