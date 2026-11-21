import 'server-only';
/** تشغيل العقارات: الامتثال، الموردون، الصيانة الدورية، محاضر الفحص، مستحقات المؤجرين */
import { q, uid } from './db';
import { todayRiyadh } from './data';

export const LICENSE_KINDS = ['رخصة البلدية (التشغيل)', 'شهادة الدفاع المدني', 'وثيقة التأمين', 'الصك / حجة الاستحكام', 'عقد الأرض مع المؤجر', 'شهادة فحص المصاعد', 'شهادة إتمام البناء', 'رخصة البناء', 'عقد الصيانة والتشغيل', 'عقد الحراسة', 'أخرى'];
export const TRADES = ['كهرباء', 'سباكة', 'تكييف', 'مصاعد', 'نظافة', 'مكافحة حشرات', 'دهانات', 'نجارة وألمنيوم', 'خزانات وعزل', 'إطفاء وسلامة', 'مقاولات عامة', 'أخرى'];
export const CONDITIONS: [string, string][] = [['good', 'سليم'], ['fair', 'استهلاك عادي'], ['damaged', 'تالف'], ['missing', 'مفقود']];
export const INSPECTION_TEMPLATE: [string, string[]][] = [
  ['المدخل والصالة', ['الباب الرئيسي والأقفال', 'الأرضيات', 'الجدران والدهان', 'الإنارة والمفاتيح']],
  ['الغرف', ['الأبواب', 'النوافذ والستائر', 'الأرضيات', 'الجدران والدهان', 'الإنارة والأفياش']],
  ['المطبخ', ['الخزائن', 'المغسلة والخلاط', 'السخان', 'الإنارة والأفياش']],
  ['دورات المياه', ['المغاسل والخلاطات', 'المراحيض', 'السخان', 'الشفاطات', 'التسربات']],
  ['التكييف', ['المكيفات وعملها', 'التصريف']],
  ['العدادات', ['قراءة الكهرباء', 'قراءة المياه']],
  ['المفاتيح', ['عدد المفاتيح المسلّمة']],
];
export type InspItem = { area: string; item: string; cond: string; note: string; cost: number };
export const licState = (exp: string | null) => { if (!exp) return ['بلا تاريخ انتهاء', 'mute'] as const; const d = (Date.parse(exp) - Date.parse(todayRiyadh())) / 864e5; return d < 0 ? ['منتهية', 'bad'] as const : d <= 60 ? [`تنتهي خلال ${Math.ceil(d)} يوماً`, 'warn'] as const : ['سارية', 'ok'] as const; };
const addM = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
/** ينشئ طلبات الصيانة الدورية المستحقة (قبل موعدها بأسبوع) مرة واحدة لكل موعد */
export async function createDuePM(by = 'الصيانة الدورية') {
  const lim = new Date(Date.parse(todayRiyadh()) + 7 * 864e5).toISOString().slice(0, 10);
  const plans = await q(`select p.*, v.name as vendor_name from pm_plans p left join vendors v on v.id=p.vendor_id where p.active and p.next_due <= $1`, [lim]);
  let n = 0;
  for (const p of plans) {
    const [ex] = await q(`select 1 from maintenance where pm_plan_id=$1 and scheduled_on=$2`, [p.id, p.next_due]);
    if (!ex) { await q(`insert into maintenance (id,property_id,unit_id,title,details,priority,vendor,vendor_id,est_cost,charge_to,opened_on,scheduled_on,pm_plan_id,created_by) values ($1,$2,$3,$4,$5,'عادية',$6,$7,$8,'الجمعية',$9,$10,$11,$12)`,
      [uid('m'), p.property_id, p.unit_id, `صيانة دورية: ${p.title}`, `خطة دورية كل ${p.every_months} أشهر${p.trade ? ` • ${p.trade}` : ''}`, p.vendor_name, p.vendor_id, p.est_cost, todayRiyadh(), p.next_due, p.id, by]); n++; }
    await q('update pm_plans set next_due=$2 where id=$1', [p.id, addM(String(p.next_due), Number(p.every_months))]);
  }
  return n;
}
/** جدول مدفوعات التزام لمؤجر حسب الدورية */
export function obligationSchedule(start: string, end: string, annual: number, freq: string) {
  const m = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[freq] ?? 12; const out: { due: string; amount: number }[] = [];
  for (let d = start; d <= end && out.length < 600; d = addM(d, m)) out.push({ due: d, amount: Math.round((annual * m / 12) * 100) / 100 });
  return out;
}
