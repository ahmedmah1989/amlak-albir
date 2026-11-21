import type { DB, Exception } from './types';
import type { Analysis } from './calc';
import { daysBetween } from './calc';

export interface Rule { id: string; title: string; level: 'high' | 'mid' | 'low'; entity: string; fix: string }
export const RULES: Rule[] = [
  { id: 'pay_no_attach', title: 'سند غير نقدي بلا مرفق', level: 'high', entity: 'payment', fix: 'إرفاق إشعار الحوالة أو صورة الشيك' },
  { id: 'pay_unmatched', title: 'سند غير مطابق مع البنك بعد 15 يوماً', level: 'high', entity: 'payment', fix: 'مطابقته من شاشة كشف البنك' },
  { id: 'adj_no_decision', title: 'خصم أو إعفاء بلا رقم قرار', level: 'high', entity: 'adjustment', fix: 'إضافة رقم القرار ومرفقه' },
  { id: 'adj_pending', title: 'خصم ينتظر الاعتماد', level: 'mid', entity: 'adjustment', fix: 'اعتماده أو رفضه من شاشة الاعتمادات' },
  { id: 'contract_expired_active', title: 'عقد ساري انتهت مدته', level: 'high', entity: 'contract', fix: 'تجديده أو إنهاؤه' },
  { id: 'contract_no_ejar', title: 'عقد ساري بلا رقم إيجار', level: 'mid', entity: 'contract', fix: 'إدخال رقم العقد من منصة إيجار' },
  { id: 'contract_no_copy', title: 'عقد ساري بلا نسخة مرفقة', level: 'mid', entity: 'contract', fix: 'إرفاق نسخة العقد الموقعة' },
  { id: 'dup_contract_no', title: 'رقم عقد إيجار مكرر', level: 'high', entity: 'contract', fix: 'مراجعة الرقم في منصة إيجار وتصحيحه' },
  { id: 'schedule_incomplete', title: 'جدول أقساط لا يصل لنهاية العقد', level: 'high', entity: 'contract', fix: 'استكمال الجدول من صفحة العقد' },
  { id: 'id_expired', title: 'هوية أو سجل مستأجر منتهي', level: 'mid', entity: 'tenant', fix: 'تحديث تاريخ الانتهاء وإرفاق الصورة الجديدة' },
  { id: 'tenant_no_phone', title: 'مستأجر حالي بلا جوال', level: 'mid', entity: 'tenant', fix: 'إضافة رقم الجوال' },
  { id: 'tenant_no_id', title: 'مستأجر حالي بلا هوية أو سجل', level: 'low', entity: 'tenant', fix: 'إضافة رقم الهوية أو السجل التجاري' },
  { id: 'late_no_follow', title: 'متأخر بلا متابعة خلال 30 يوماً', level: 'mid', entity: 'tenant', fix: 'تسجيل متابعة' },
  { id: 'unconfirmed', title: 'قسط يحتاج تأكيداً', level: 'mid', entity: 'installment', fix: 'مطابقته مع البنك وتأكيد سداده أو عدمه' },
  { id: 'property_no_deed', title: 'عقار بلا رقم صك', level: 'low', entity: 'property', fix: 'إضافة رقم الصك' },
  { id: 'property_no_value', title: 'عقار بلا قيمة دفترية', level: 'low', entity: 'property', fix: 'إضافة القيمة الدفترية' },
  { id: 'doc_expired', title: 'مستند منتهي الصلاحية', level: 'mid', entity: 'attachment', fix: 'رفع المستند المحدث' },
  { id: 'ejar_unlinked', title: 'عقد إيجار مستورد غير مربوط بعقد في النظام', level: 'mid', entity: 'ejar', fix: 'ربطه بعقد أو إنشاء العقد منه' },
  { id: 'inst_paid_no_date', title: 'قسط مسدد في الملف بلا تاريخ استلام', level: 'high', entity: 'installment', fix: 'إدخال تاريخ الاستلام من كشف البنك أو دفتر السندات' },
  { id: 'paid_no_receipt', title: 'دفعة مسجلة بلا رقم سند قبض', level: 'high', entity: 'installment', fix: 'إضافة رقم سند القبض' },
  { id: 'ejar_paid_open', title: 'مدفوع في إيجار وغير مسدد في النظام', level: 'high', entity: 'installment', fix: 'مطابقة الإيداع البنكي وتسجيل السند' },
];
export interface Finding { rule: string; entity: string; entity_id: string; property_id: string | null; title: string; sub: string; href: string; date: string | null; amount: number | null; excepted: Exception | null }

function excFor(ex: Exception[], f: Omit<Finding, 'excepted'>, today: string) {
  return ex.find((e) => e.status === 'approved' && e.rule === f.rule && (!e.expires_on || e.expires_on >= today) &&
    ((e.scope === 'record' && e.entity_id === f.entity_id) || (e.scope === 'before' && f.date && e.before_date && f.date < e.before_date) ||
     (e.scope === 'property' && e.property_id && e.property_id === f.property_id))) ?? null;
}

export function runAudit(db: DB, a: Analysis) {
  const today = a.today, out: Omit<Finding, 'excepted'>[] = [];
  const att = (entity: string, id: string) => db.attachments.some((x) => x.entity === entity && x.entity_id === id);
  const P = (id: string | null | undefined) => (id ? a.P.get(id)?.short ?? '' : '');
  for (const p of a.payments) {
    const c = p.contract_id ? a.C.get(p.contract_id) : undefined; const t = a.T.get(p.tenant_id)?.name ?? '';
    if (p.method !== 'نقدي' && !att('payment', p.id)) out.push({ rule: 'pay_no_attach', entity: 'payment', entity_id: p.id, property_id: c?.property_id ?? null, title: `${p.receipt_no} — ${t}`, sub: p.method, href: `/payments/${p.id}`, date: p.paid_on, amount: p.amount });
    if (!p.bank_line_id && daysBetween(p.paid_on, today) > 15) out.push({ rule: 'pay_unmatched', entity: 'payment', entity_id: p.id, property_id: c?.property_id ?? null, title: `${p.receipt_no} — ${t}`, sub: `منذ ${daysBetween(p.paid_on, today)} يوماً`, href: `/payments/${p.id}`, date: p.paid_on, amount: p.amount });
  }
  for (const x of db.adjustments) {
    const t = x.tenant_id ? a.T.get(x.tenant_id)?.name ?? '' : '';
    if (x.status === 'approved' && !x.decision_no) out.push({ rule: 'adj_no_decision', entity: 'adjustment', entity_id: x.id, property_id: x.property_id, title: `${x.type} — ${t}`, sub: `قسط ${x.installment_no ?? '—'} • المعتمد: ${x.approved_by ?? 'غير مذكور'}`, href: x.installment_id ? `/installments/${x.installment_id}` : `/tenants/${x.tenant_id}`, date: x.date, amount: x.amount });
    if (x.status === 'pending') out.push({ rule: 'adj_pending', entity: 'adjustment', entity_id: x.id, property_id: x.property_id, title: `${x.type} — ${t}`, sub: `طلبه ${x.requested_by ?? ''}`, href: '/approvals', date: x.date, amount: x.amount });
  }
  const nos = new Map<string, number>(); db.contracts.forEach((c) => c.contract_no && nos.set(c.contract_no, (nos.get(c.contract_no) ?? 0) + 1));
  for (const c of db.contracts) {
    const t = a.T.get(c.tenant_id)?.name ?? '', u = a.U.get(c.unit_id)?.code ?? '', base = { entity: 'contract', entity_id: c.id, property_id: c.property_id, title: `${P(c.property_id)} — ${u}`, sub: t, href: `/contracts/${c.id}`, date: c.start_date, amount: c.annual_rent };
    if (c.contract_no && (nos.get(c.contract_no) ?? 0) > 1) out.push({ ...base, rule: 'dup_contract_no', sub: `${t} • ${c.contract_no}` });
    if (c.status !== 'active') continue;
    if (c.end_date < today) out.push({ ...base, rule: 'contract_expired_active' });
    if (!c.contract_no) out.push({ ...base, rule: 'contract_no_ejar' });
    if (!att('contract', c.id)) out.push({ ...base, rule: 'contract_no_copy' });
    const gap = a.gaps.find((g) => g.c.id === c.id); if (gap) out.push({ ...base, rule: 'schedule_incomplete', sub: `${t} • ينقص ${gap.missing.length} أقساط`, amount: gap.missing.reduce((x, i) => x + i.amount, 0) });
  }
  for (const s of a.tenantStats) {
    if (!s.activeContracts.length) continue;
    const base = { entity: 'tenant', entity_id: s.t.id, property_id: s.activeContracts[0].property_id, title: s.t.name, sub: s.activeContracts.map((c) => a.U.get(c.unit_id)?.code).join('، '), href: `/tenants/${s.t.id}`, date: null, amount: null };
    if (!s.t.phone) out.push({ ...base, rule: 'tenant_no_phone' });
    if (!s.t.national_id && !s.t.cr_no) out.push({ ...base, rule: 'tenant_no_id' });
    for (const [lbl, dt] of [['الهوية', s.t.id_expiry], ['السجل التجاري', s.t.cr_expiry]] as const) if (dt && dt < today) out.push({ ...base, rule: 'id_expired', sub: `${lbl} منتهية منذ ${dt}` });
  }
  for (const s of a.needFollow) out.push({ rule: 'late_no_follow', entity: 'tenant', entity_id: s.t.id, property_id: s.activeContracts[0]?.property_id ?? null, title: s.t.name, sub: `متأخر ${Math.round(s.arrears).toLocaleString('en-US')} • آخر متابعة ${s.lastFollow?.date ?? 'لا توجد'}`, href: `/tenants/${s.t.id}`, date: null, amount: s.arrears });
  for (const r of a.unconfirmed) out.push({ rule: 'unconfirmed', entity: 'installment', entity_id: r.id, property_id: r.contract.property_id, title: `${r.tenantName} — قسط ${r.no}`, sub: `${r.propertyShort} — ${r.unitCode}`, href: `/installments/${r.id}`, date: r.due_date, amount: r.balance });
  for (const p of db.properties) {
    const base = { entity: 'property', entity_id: p.id, property_id: p.id, title: p.name, sub: p.ownership ?? '', href: `/properties/${p.id}`, date: null, amount: null };
    if (!p.deed_no && p.ownership !== 'مستأجر من الغير') out.push({ ...base, rule: 'property_no_deed' });
    if (!a.bookValue(p.id) && p.ownership !== 'مستأجر من الغير') out.push({ ...base, rule: 'property_no_value' });
  }
  for (const x of db.attachments) if (x.expires_on && x.expires_on < today) out.push({ rule: 'doc_expired', entity: 'attachment', entity_id: x.id, property_id: null, title: x.file_name, sub: x.category ?? '', href: `/${x.entity === 'property' ? 'properties' : x.entity + 's'}/${x.entity_id}`, date: x.expires_on, amount: null });
  const ejarNos = new Set(db.ejar.filter((e) => !e.contract_id).map((e) => e.contract_no));
  for (const no of ejarNos) out.push({ rule: 'ejar_unlinked', entity: 'ejar', entity_id: no, property_id: null, title: `عقد إيجار ${no}`, sub: db.ejar.find((e) => e.contract_no === no)?.broker ?? '', href: `/ejar?c=${no}`, date: null, amount: null });
  for (const e of db.ejar) {
    if (e.status !== 'تم الدفع' || !e.installment_id) continue;
    const r = a.rows.find((x) => x.id === e.installment_id);
    if (r && r.balance > 0) out.push({ rule: 'ejar_paid_open', entity: 'installment', entity_id: r.id, property_id: r.contract.property_id, title: `${r.tenantName} — قسط ${r.no}`, sub: `فاتورة إيجار ${e.installment_no}`, href: `/installments/${r.id}`, date: r.due_date, amount: r.balance });
  }
  for (const r of a.rows) {
    const base = { entity: 'installment', entity_id: r.id, property_id: r.contract.property_id, title: `${r.tenantName} — قسط ${r.no}`, sub: `${r.propertyShort} — ${r.unitCode}${r.src_receipt ? ' • سند ' + r.src_receipt : ''}`, href: `/installments/${r.id}`, date: r.due_date };
    if (r.opening_paid > 0 && !r.src_dates) out.push({ ...base, rule: 'inst_paid_no_date', amount: r.opening_paid });
    const hasNum = (x: string | null) => !!x && /\d/.test(x);
    if (r.opening_paid > 0 && !hasNum(r.src_receipt)) out.push({ ...base, rule: 'paid_no_receipt', amount: r.opening_paid });
  }
  for (const p of a.payments) if (p.created_by === 'ملف المتابعة' && !/\d/.test(p.bank_ref ?? '')) out.push({ rule: 'paid_no_receipt', entity: 'payment', entity_id: p.id, property_id: p.contract_id ? a.C.get(p.contract_id)?.property_id ?? null : null, title: `${a.T.get(p.tenant_id)?.name} — ${p.receipt_no}`, sub: `استلام ${p.paid_on.split('-').reverse().join('/')}`, href: `/payments/${p.id}`, date: p.paid_on, amount: p.amount });
  const findings: Finding[] = out.map((f) => ({ ...f, excepted: excFor(db.exceptions, f, today) }));
  const open = findings.filter((f) => !f.excepted);
  const checked = db.payments.length * 2 + db.contracts.length * 3 + db.tenants.length * 2 + db.properties.length * 2 + db.adjustments.length + db.installments.length + db.attachments.length + db.ejar.length;
  const score = checked ? Math.max(0, Math.round((1 - open.length / checked) * 100)) : 100;
  const rawScore = checked ? Math.max(0, Math.round((1 - findings.length / checked) * 100)) : 100;
  return { findings, open, excepted: findings.filter((f) => f.excepted), score, rawScore, checked };
}
