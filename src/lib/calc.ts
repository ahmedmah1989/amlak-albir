import type { DB, Installment, Contract, Frequency } from './types';

export type IStatus = 'paid' | 'overdue' | 'due' | 'upcoming' | 'unconfirmed';
export const ISTATUS: Record<IStatus, { label: string; tone: string }> = {
  paid: { label: 'مسدَّد', tone: 'ok' }, overdue: { label: 'متأخر', tone: 'bad' }, due: { label: 'مستحق (ضمن المهلة)', tone: 'warn' },
  upcoming: { label: 'قادم', tone: 'info' }, unconfirmed: { label: 'يحتاج تأكيداً', tone: 'est' },
};
const DAY = 86400000;
const toD = (iso: string) => new Date(iso + 'T00:00:00Z').getTime();
export const daysBetween = (a: string, b: string) => Math.round((toD(b) - toD(a)) / DAY);
export const addDays = (iso: string, n: number) => new Date(toD(iso) + n * DAY).toISOString().slice(0, 10);
export function addMonths(iso: string, m: number) {
  const d = new Date(iso + 'T00:00:00Z'); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + m);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10);
}
export const FREQ_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

/** يولّد جدول أقساط عقد حسب دورية الدفع (يبدأ كل قسط في أول فترته).
 *  escalation: نسبة الزيادة السنوية % تطبق على كل سنة تعاقدية بعد الأولى. vat: نسبة الضريبة % تضاف لقيمة القسط. */
export function buildSchedule(start: string, end: string, annual: number, freq: Frequency, opt: { escalation?: number | null; vat?: number | null } = {}) {
  const m = FREQ_MONTHS[freq]; if (!m) return [];
  const out: { no: number; period_from: string; period_to: string; due_date: string; amount: number }[] = [];
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (let k = 0; ; k++) {
    const ps = addMonths(start, k * m); if (ps > end) break;
    let pe = addDays(addMonths(start, (k + 1) * m), -1); if (pe > end) pe = end;
    const fullEnd = addDays(addMonths(start, (k + 1) * m), -1);
    const year = Math.floor((k * m) / 12), rent = annual * Math.pow(1 + (opt.escalation ?? 0) / 100, year);
    const base = pe === fullEnd ? (rent * m) / 12 : (rent * (daysBetween(ps, pe) + 1)) / 365;
    out.push({ no: k + 1, period_from: ps, period_to: pe, due_date: ps, amount: r2(base * (1 + (opt.vat ?? 0) / 100)) });
  }
  return out;
}
/** الأقساط الناقصة من آخر فترة مسجلة حتى نهاية العقد، بنفس مواعيد الجدول الأصلي. */
export function missingSchedule(c: Contract, all: { no: number; period_to: string | null; due_date: string; kind?: string }[]) {
  const existing = all.filter((i) => !i.kind || i.kind === 'rent');
  if (!c.frequency || c.frequency === 'special' || !FREQ_MONTHS[c.frequency]) return [];
  const lastEnd = existing.reduce((mx, i) => { const e = i.period_to ?? i.due_date; return e > mx ? e : mx; }, '');
  if (lastEnd && lastEnd >= c.end_date) return [];
  const maxNo = all.reduce((mx, i) => Math.max(mx, i.no), 0);
  const full = buildSchedule(c.start_date, c.end_date, c.annual_rent, c.frequency, { escalation: c.escalation_pct, vat: c.vat_rate });
  const out: { no: number; period_from: string; period_to: string; due_date: string; amount: number }[] = [];
  for (const i of full) {
    if (lastEnd && i.period_to <= lastEnd) continue;
    const from = lastEnd && i.period_from <= lastEnd ? addDays(lastEnd, 1) : i.period_from;
    const days = daysBetween(i.period_from, i.period_to) + 1, part = daysBetween(from, i.period_to) + 1;
    out.push({ no: maxNo + out.length + 1, period_from: from, period_to: i.period_to, due_date: from, amount: Math.round((i.amount * part) / days * 100) / 100 });
  }
  return out;
}

export interface IRow extends Installment {
  allocated: number; adjusted: number; paidTotal: number; balance: number; status: IStatus; daysLate: number; partial: boolean; paidPct: number; receipts: number;
  contract: Contract; tenantName: string; propertyName: string; propertyShort: string; unitCode: string;
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function analyze(db: DB) {
  const today = db.meta.today, grace = db.meta.grace_days;
  const P = new Map(db.properties.map((p) => [p.id, p])), U = new Map(db.units.map((u) => [u.id, u]));
  const T = new Map(db.tenants.map((t) => [t.id, t])), C = new Map(db.contracts.map((c) => [c.id, c]));
  const alloc = new Map<string, number>(); db.allocations.forEach((a) => alloc.set(a.installment_id, (alloc.get(a.installment_id) ?? 0) + a.amount));
  const rc = new Map<string, number>(); db.allocations.forEach((a) => rc.set(a.installment_id, (rc.get(a.installment_id) ?? 0) + 1));
  const adj = new Map<string, number>(); db.adjustments.forEach((a) => a.installment_id && (a.status ?? 'approved') === 'approved' && adj.set(a.installment_id, (adj.get(a.installment_id) ?? 0) + a.amount));

  const rows: IRow[] = db.installments.map((i) => {
    const c = C.get(i.contract_id)!; const allocated = alloc.get(i.id) ?? 0; const adjusted = adj.get(i.id) ?? 0;
    const paidTotal = i.opening_paid + allocated; const balance = Math.max(0, Math.round((i.amount - paidTotal - adjusted) * 100) / 100);
    let status: IStatus; let daysLate = 0;
    if (balance <= 0) status = 'paid';
    else if (i.needs_confirmation) status = 'unconfirmed';
    else { const lateFrom = addDays(i.due_date, grace);
      if (today > lateFrom) { status = 'overdue'; daysLate = daysBetween(lateFrom, today); } else if (i.due_date <= today) status = 'due'; else status = 'upcoming'; }
    const p = P.get(c.property_id)!;
    const settled = Math.min(i.amount, paidTotal + adjusted), partial = balance > 0 && settled > 0.009;
    return { ...i, allocated, adjusted, paidTotal, balance, status, daysLate, partial, paidPct: i.amount > 0 ? Math.min(100, (settled / i.amount) * 100) : 100,
      receipts: (rc.get(i.id) ?? 0) + (i.opening_paid > 0 ? 1 : 0), contract: c, tenantName: T.get(c.tenant_id)?.name ?? '—',
      propertyName: p.name, propertyShort: p.short, unitCode: U.get(c.unit_id)?.code ?? '—' };
  });

  const active = db.contracts.filter((c) => c.status === 'active');
  const overdue = rows.filter((r) => r.status === 'overdue'), unconfirmed = rows.filter((r) => r.status === 'unconfirmed');
  const bookValue = (pid: string) => { const p = P.get(pid)!; return (p.land_value ?? 0) + (p.building_value ?? 0); };
  const totalBook = sum(db.properties.map((p) => bookValue(p.id))), annualRent = sum(active.map((c) => c.annual_rent));
  const payments = db.payments.filter((p) => !p.voided);
  const year = today.slice(0, 4), month = today.slice(0, 7);
  const payProp = (p: { contract_id: string | null; tenant_id: string }) => p.contract_id ? C.get(p.contract_id)?.property_id : undefined;

  const propStats = db.properties.map((p) => {
    const pc = active.filter((c) => c.property_id === p.id); const rent = sum(pc.map((c) => c.annual_rent));
    const arrears = sum(overdue.filter((r) => r.contract.property_id === p.id).map((r) => r.balance));
    const pending = sum(unconfirmed.filter((r) => r.contract.property_id === p.id).map((r) => r.balance));
    const nextEnd = pc.map((c) => c.end_date).sort()[0] ?? null; const bv = bookValue(p.id);
    const expYear = sum(db.expenses.filter((e) => e.property_id === p.id && e.date.startsWith(year)).map((e) => e.amount));
    const collYear = sum(payments.filter((x) => payProp(x) === p.id && x.paid_on.startsWith(year)).map((x) => x.amount));
    const units = db.units.filter((u) => u.property_id === p.id);
    const vals = (db.valuations ?? []).filter((v) => v.property_id === p.id)
      .sort((x, y) => (x.val_date ? 1 : 0) - (y.val_date ? 1 : 0) || (x.val_date ?? '').localeCompare(y.val_date ?? '') || String(x.created_at).localeCompare(String(y.created_at)));
    const vt = (v: { land_value: number | null; building_value: number | null }) => (v.land_value ?? 0) + (v.building_value ?? 0);
    const initialTotal = vals.length ? vt(vals[0]) : null, revs = vals.filter((v) => v.kind === 'revaluation');
    const lastVal = vals[vals.length - 1] ?? null;
    return { p, rent, arrears, pending, nextEnd, bv, vals, initialTotal, revCount: revs.length, lastValDate: lastVal?.val_date ?? null, revDiff: initialTotal == null ? null : bv - initialTotal, yield: bv ? (rent / bv) * 100 : null, netYield: bv ? ((rent - expYear) / bv) * 100 : null,
      contracts: pc.length, idle: pc.length === 0, expYear, collYear, units };
  });

  const rowById = new Map(rows.map((r) => [r.id, r])), payById = new Map(payments.map((p) => [p.id, p]));
  const tenantStats = db.tenants.map((t) => {
    const tr = rows.filter((r) => r.contract.tenant_id === t.id), tc = db.contracts.filter((c) => c.tenant_id === t.id);
    const od = tr.filter((r) => r.status === 'overdue');
    return { t, contracts: tc, activeContracts: tc.filter((c) => c.status === 'active'), rows: tr,
      arrears: sum(od.map((r) => r.balance)), pending: sum(tr.filter((r) => r.status === 'unconfirmed').map((r) => r.balance)),
      maxLate: Math.max(0, ...od.map((r) => r.daysLate)), overdueCount: od.length,
      lastFollow: db.followups.filter((f) => f.tenant_id === t.id)[0] ?? null,
      lastPayment: payments.filter((p) => p.tenant_id === t.id)[0] ?? null,
      nextFollow: db.followups.filter((f) => f.tenant_id === t.id && f.next_date).map((f) => f.next_date!).sort().reverse()[0] ?? null,
      avgDelay: (() => { let w = 0, d = 0; for (const al of db.allocations) { const r = rowById.get(al.installment_id); const p = payById.get(al.payment_id);
        if (!r || !p || r.contract.tenant_id !== t.id) continue; w += al.amount; d += al.amount * Math.max(0, daysBetween(r.due_date, p.paid_on)); } return w ? Math.round(d / w) : null; })(),
      completeness: tenantCompleteness(t),
      collRate: (() => { const d = tr.filter((r) => r.due_date <= today && !r.needs_confirmation); const due = sum(d.map((r) => r.amount)); return due ? (sum(d.map((r) => Math.min(r.amount, r.paidTotal + r.adjusted))) / due) * 100 : null; })() };
  });

  const renewals = active.filter((c) => daysBetween(today, c.end_date) <= 365)
    .map((c) => ({ c, days: daysBetween(today, c.end_date), negotiate: addMonths(c.end_date, -3), tenantName: T.get(c.tenant_id)!.name,
      unitCode: U.get(c.unit_id)!.code, prop: P.get(c.property_id)!,
      arrears: sum(overdue.filter((r) => r.contract_id === c.id).map((r) => r.balance)),
      pending: sum(unconfirmed.filter((r) => r.contract_id === c.id).map((r) => r.balance)) }))
    .sort((a, b) => a.days - b.days);
  const upcoming = rows.filter((r) => (r.status === 'upcoming' || r.status === 'due') && daysBetween(today, r.due_date) <= 45).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const needFollow = tenantStats.filter((t) => t.arrears > 0 && !(t.nextFollow && t.nextFollow >= today) && (!t.lastFollow || daysBetween(t.lastFollow.date, today) > 30));

  // نسبة التحصيل: ما سُدد من الأقساط المستحقة حتى اليوم
  const dueRows = rows.filter((r) => r.due_date <= today && !r.needs_confirmation);
  const settledOf = (r: IRow) => Math.min(r.amount, r.paidTotal + r.adjusted);
  const dueAll = sum(dueRows.map((r) => r.amount)), dueYear = sum(dueRows.filter((r) => r.due_date.startsWith(year)).map((r) => r.amount));
  const collRate = dueAll ? (sum(dueRows.map(settledOf)) / dueAll) * 100 : null;
  const collRateYear = dueYear ? (sum(dueRows.filter((r) => r.due_date.startsWith(year)).map(settledOf)) / dueYear) * 100 : null;
  const monthKey = (k: number) => addMonths(month + '-01', k).slice(0, 7);
  const series = Array.from({ length: 12 }, (_, i) => monthKey(i - 11)).map((m) => ({ m,
    due: sum(rows.filter((r) => r.due_date.startsWith(m)).map((r) => r.amount)),
    collected: sum(payments.filter((p) => p.paid_on.startsWith(m)).map((p) => p.amount)),
    prevCollected: sum(payments.filter((p) => p.paid_on.startsWith(String(Number(m.slice(0, 4)) - 1) + m.slice(4))).map((p) => p.amount)) }));
  const doubtful = sum(overdue.filter((r) => r.daysLate > 365).map((r) => r.balance));
  const forecast = Array.from({ length: 12 }, (_, i) => monthKey(i)).map((m) => {
    const rs = rows.filter((r) => r.due_date.startsWith(m) && r.balance > 0);
    return { m, amount: sum(rs.map((r) => r.balance)), count: rs.length, rows: rs }; });
  const gaps = active.map((c) => ({ c, missing: missingSchedule(c, rows.filter((r) => r.contract_id === c.id)) })).filter((g) => g.missing.length);
  const noFollowArrears = sum(needFollow.map((t) => t.arrears));

  return { today, grace, rows, active, doubtful, collRate, collRateYear, series, forecast, gaps, noFollowArrears, overdue, unconfirmed, totalBook, annualRent, propStats, tenantStats, renewals, upcoming, needFollow, payments,
    arrearsTotal: sum(overdue.map((r) => r.balance)), pendingTotal: sum(unconfirmed.map((r) => r.balance)),
    idleValue: sum(propStats.filter((s) => s.idle).map((s) => s.bv)),
    collectedMonth: sum(payments.filter((p) => p.paid_on.startsWith(month)).map((p) => p.amount)),
    collectedYear: sum(payments.filter((p) => p.paid_on.startsWith(year)).map((p) => p.amount)),
    expensesYear: sum(db.expenses.filter((e) => e.date.startsWith(year)).map((e) => e.amount)),
    openNotes: db.notes.filter((n) => n.status === 'open').length, year, P, U, T, C, bookValue, payProp };
}
export type Analysis = ReturnType<typeof analyze>;

/** نسبة اكتمال بيانات المستأجر الأساسية */
export function tenantCompleteness(t: DB['tenants'][number]) {
  const company = t.tenant_type === 'company';
  const need: (string | null | undefined)[] = company ? [t.phone, t.cr_no, t.cr_expiry, t.contact_person, t.address, t.vat_no] : [t.phone, t.national_id, t.id_expiry, t.nationality, t.address];
  const missing = need.filter((x) => !x).length;
  return { pct: Math.round(((need.length - missing) / need.length) * 100), missing };
}
