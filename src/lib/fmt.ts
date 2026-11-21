const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const money = (n: number | null | undefined) => (n == null ? '—' : nf.format(Math.round(n)));
export const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
const MON = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
export const DATE_FORMATS: [string, string][] = [['dd/MM/yyyy','27/10/2026'],['dd-MM-yyyy','27-10-2026'],['yyyy/MM/dd','2026/10/27'],['d MMMM yyyy','27 أكتوبر 2026'],['dddd d MMMM yyyy','الثلاثاء 27 أكتوبر 2026'],['hijri','هجري 16/05/1448هـ']];
let fmtGetter: () => string = () => 'dd/MM/yyyy';
export function setFormatGetter(fn: () => string) { fmtGetter = fn; }
export function dateAs(iso: string | null | undefined, f: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const p = (n: number) => String(n).padStart(2, '0');
  if (f === 'hijri') return hijri(iso);
  if (f === 'dd-MM-yyyy') return `${p(d)}-${p(m)}-${y}`;
  if (f === 'yyyy/MM/dd') return `${y}/${p(m)}/${p(d)}`;
  if (f === 'd MMMM yyyy') return `${d} ${MON[m - 1]} ${y}`;
  if (f === 'dddd d MMMM yyyy') return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]} ${y}`;
  return `${p(d)}/${p(m)}/${y}`;
}
export function date(iso: string | null | undefined) { let f = 'dd/MM/yyyy'; try { f = fmtGetter(); } catch {} return dateAs(iso, f); }
const hf = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function hijri(iso: string | null | undefined) {
  if (!iso) return '—';
  try { return hf.format(new Date(iso + 'T00:00:00Z')).replace(/[^\d/]/g, '') + 'هـ'; } catch { return '—'; }
}
export const FREQ: Record<string, string> = {
  monthly: 'شهري', quarterly: 'ربع سنوي', semiannual: 'نصف سنوي', annual: 'سنوي', special: 'جدول خاص',
};
export const CSTATUS: Record<string, string> = {
  active: 'ساري', renewed: 'منتهٍ – جُدِّد', expired: 'منتهٍ', terminated: 'منهى مبكراً',
};
export const METHODS = ['تحويل بنكي', 'نقدي', 'شيك', 'نقاط بيع (شبكة)', 'سداد عبر منصة إيجار', 'دفع إلكتروني (رابط دفع)'];
export const EXPENSE_CATS = ['صيانة وإصلاحات', 'كهرباء', 'مياه', 'نظافة', 'رسوم حكومية وبلدية', 'إيجار أرض (للغير)', 'تأمين', 'عمولات وتسويق', 'أتعاب قانونية', 'أخرى'];
export const FOLLOW_TYPES = ['اتصال هاتفي', 'رسالة نصية', 'زيارة', 'إشعار بالسداد', 'إنذار رسمي', 'وعد بالسداد', 'اتفاق جدولة', 'إحالة قانونية', 'ملاحظة'];
export const ADJ_TYPES = ['خصم', 'إعفاء', 'خصم صيانة', 'صلح', 'تسوية'];
export const opts = (a: string[]): [string, string][] => a.map((x) => [x, x]);
export const FREQ_OPTS: [string, string][] = [['quarterly', 'ربع سنوي'], ['semiannual', 'نصف سنوي'], ['annual', 'سنوي'], ['monthly', 'شهري'], ['special', 'جدول خاص (أقساط يدوية)']];
export const ATT_CATS: Record<string, string[]> = {
  property: ['صك الملكية', 'رخصة البناء', 'المخططات', 'شهادة الدفاع المدني', 'صور العقار', 'تقييم العقار', 'أخرى'],
  tenant: ['الهوية', 'السجل التجاري', 'العنوان الوطني', 'تفويض', 'أخرى'],
  contract: ['نسخة العقد الموقعة', 'ملحق العقد', 'ضمان / شيك تأمين', 'محضر استلام', 'محضر تسليم', 'أخرى'],
  payment: ['إشعار الحوالة', 'صورة الشيك', 'إيصال سداد', 'أخرى'],
  maintenance: ['صور قبل', 'صور بعد', 'الفاتورة', 'عرض السعر', 'أخرى'],
  unit: ['صور الوحدة', 'محضر استلام', 'محضر تسليم', 'أخرى'],
};
export const USAGE = ['تجاري', 'سكني', 'سكني تجاري', 'مكتبي', 'مستودع', 'أخرى'];
export const UTILITIES = ['على المستأجر', 'على الجمعية', 'مشتركة', 'مشمولة في الإيجار'];
export const DEPOSIT_STATUS = ['محصّل', 'غير محصّل', 'مسترد', 'مستقطع جزئياً', 'لا يوجد'];
export const NATIONALITIES = ['سعودي', 'يمني', 'مصري', 'سوداني', 'باكستاني', 'هندي', 'بنغلاديشي', 'أخرى'];
export const TENANT_TYPE: Record<string, string> = { individual: 'فرد', company: 'منشأة / شركة' };

export const LAND_BASIS: [string, string][] = [['owned', 'أرض ومبنى ضمن الأصل (مملوكة أو وقف)'], ['leased', 'مبنى على أرض مستأجرة من الغير — الأرض لا تُقيَّم'], ['land_only', 'أرض فضاء بدون مبنى']];
export const LAND_BASIS_LABEL: Record<string, string> = { owned: 'أرض ومبنى', leased: 'مبنى على أرض مستأجرة', land_only: 'أرض فضاء' };
export const VOUCHER_KINDS: Record<string, string> = { deposit_refund: 'رد تأمين', overpayment: 'رد مبلغ زائد', other: 'صرف آخر' };
export const VOUCHER_STATUS: Record<string, [string, string]> = { pending: ['بانتظار الاعتماد', 'warn'], approved: ['معتمد ومصروف', 'ok'], voided: ['ملغى', 'bad'] };
export const IMPORT_STATUS: Record<string, [string, string]> = { preview: ['معاينة — لم تُعتمد', 'warn'], committed: ['معتمدة', 'ok'], reverted: ['تم التراجع عنها', 'mute'], discarded: ['متجاهلة', 'mute'] };
