import 'server-only';
import type { Q } from './db';
import type { User } from './auth';

const norm = (v: unknown) => (v == null || v === '' ? null : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'boolean' ? (v ? 'نعم' : 'لا') : String(v));
const same = (a: string | null, b: string | null) => a === b || (a != null && b != null && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b));
/** يسجل الحقول التي تغيرت قيمتها (قبل/بعد) في record_changes */
export async function trackChanges(t: Q, u: User, entity: string, id: string, before: Record<string, unknown> | undefined, after: Record<string, unknown>, labels: Record<string, string> = {}) {
  if (!before) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(after)) {
    const o = norm(before[k]), nv = norm(v);
    if (same(o, nv)) continue;
    await t('insert into record_changes (username,entity,entity_id,field,label,old_value,new_value) values ($1,$2,$3,$4,$5,$6,$7)', [u.full_name, entity, id, k, labels[k] ?? k, o, nv]);
    n++;
  }
  return n;
}
export const LABELS: Record<string, string> = {
  name: 'الاسم', tenant_type: 'نوع المستأجر', phone: 'الجوال', phone2: 'جوال إضافي', email: 'البريد', national_id: 'الهوية', nationality: 'الجنسية', id_expiry: 'انتهاء الهوية',
  cr_no: 'السجل التجاري', cr_expiry: 'انتهاء السجل', vat_no: 'الرقم الضريبي', contact_person: 'مسؤول التواصل', address: 'العنوان الوطني', guarantor_name: 'الكفيل',
  guarantor_phone: 'جوال الكفيل', guarantor_id: 'هوية الكفيل', notes: 'ملاحظات', contract_no: 'رقم العقد', renewed_from: 'مجدد من', trade_name: 'الاسم التجاري', usage: 'الاستخدام',
  signed_on: 'تاريخ التوقيع', ejar_property_id: 'رقم العقار في إيجار', broker: 'الوسيط', deposit: 'التأمين', deposit_status: 'حالة التأمين', vat_rate: 'الضريبة %',
  escalation_pct: 'الزيادة السنوية %', ejar_fees: 'رسوم إيجار', brokerage: 'السعي', utilities: 'الكهرباء والمياه', notice_days: 'مدة الإشعار', auto_renew: 'تجديد تلقائي',
  end_date: 'تاريخ النهاية', annual_rent: 'الإيجار السنوي', frequency: 'دورية الدفع', status: 'الحالة', due_date: 'تاريخ الاستحقاق', amount: 'المبلغ', note: 'ملاحظة',
  short: 'الاسم المختصر', type: 'النوع', location: 'الموقع', ownership: 'الملكية', land_value: 'قيمة الأرض', building_value: 'قيمة المبنى', value_status: 'حالة القيمة', deed_no: 'رقم الصك',
  ground_lease_end: 'نهاية عقد الأرض', code: 'الوحدة', kind: 'النوع', unit_type: 'نوع الوحدة', floor: 'الدور', rooms: 'الغرف', occupant: 'الشاغل', monthly_rent: 'الإيجار الشهري',
  voided: 'ملغى', void_reason: 'سبب الإلغاء', date: 'التاريخ', category: 'البند', vendor: 'المورد', ref: 'المرجع', description: 'الوصف', property_id: 'العقار',
  vacated_on: 'تاريخ الإخلاء', area: 'المساحة م²', elec_meter: 'عداد الكهرباء', water_meter: 'عداد المياه', features: 'المواصفات', deposit_refund: 'المسترد من التأمين', deposit_deduction: 'المستقطع من التأمين', handover_notes: 'محضر التسليم',
  land_basis: 'وضع الأرض', land_area: 'مساحة الأرض م²', building_area: 'مساحة المبنى م²', data_status: 'حالة البيانات',
};
