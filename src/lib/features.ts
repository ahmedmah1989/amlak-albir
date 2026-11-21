// الميزات الاختيارية — كلها مقفولة افتراضياً؛ القفل يخفي الشاشات والإجراءات ولا يحذف بيانات
export const FEATURES: { key: string; label: string; desc: string }[] = [
  { key: 'units_split', label: 'تفصيل الوحدات الفرعية (الشقق)', desc: 'وحدات فرعية تحت الوحدة المؤجرة بعقد إجمالي، مع شاغل وإيجار وحالة لكل شقة، ومؤشر إشغال فعلي.' },
  { key: 'meters', label: 'قراءات العدادات', desc: 'تسجيل قراءات الكهرباء والمياه شهرياً وحساب الاستهلاك، مع خيار تحميله على المستأجر كقسط خدمات.' },
  { key: 'doc_alerts', label: 'تنبيهات انتهاء المستندات', desc: 'تنبيه في مركز العمل قبل 60 و30 يوماً من انتهاء الهوية والسجل وأي مستند له تاريخ انتهاء.' },
  { key: 'doc_required', label: 'المستندات المطلوبة ومركز المستندات', desc: 'قائمة نواقص لكل عقد (هوية/سجل، عقد موقع…) وشاشة بحث موحدة لكل المستندات.' },
  { key: 'collection_plan', label: 'خطة التحصيل', desc: 'تعيين موظف تحصيل لكل مستأجر وقائمة عمل أسبوعية بالمتأخرين مع تسجيل نتيجة كل اتصال.' },
  { key: 'late_fees', label: 'غرامات التأخير', desc: 'حساب غرامة على الأقساط المتأخرة حسب النسبة المحددة، وإصدارها كقسط غرامة باعتماد المدير.' },
  { key: 'accounting', label: 'التقارير المحاسبية', desc: 'قيود يومية للتصدير، إقرار ضريبة القيمة المضافة الربعي، ومقارنة الموازنة بالفعلي لكل عقار.' },
  { key: 'maker_checker', label: 'المراجعة من شخص ثانٍ (الرقابة المزدوجة)', desc: 'كل سند قبض أو صرف يراجعه مستخدم غير الذي سجّله، ولا يلغي السند من أنشأه. السندات غير المراجعة تظهر في الاعتمادات وتُميَّز في التقارير.' },
  { key: 'e_invoice', label: 'الفاتورة الضريبية الإلكترونية', desc: 'إصدار فاتورة ضريبية للقسط أو السند بحقول هيئة الزكاة والضريبة والجمارك ورمز QR (المرحلة الأولى)، مع إشعار دائن وسجل فواتير، وتجهيز البيانات للربط مع منصة فاتورة.' },
  { key: 'portal', label: 'بوابة المستأجر', desc: 'رابط خاص لكل مستأجر يعرض كشف حسابه ويرفع منه إشعار التحويل، يمكن إيقافه أو تجديده في أي وقت.' },
];
export type Feats = Record<string, boolean>;
export function parseFeatures(raw: string | null | undefined): Feats {
  try { const o = JSON.parse(raw || '{}'); return Object.fromEntries(FEATURES.map((f) => [f.key, o?.[f.key] === true])); } catch { return Object.fromEntries(FEATURES.map((f) => [f.key, false])); }
}
export interface FeatureCfg { late_fee_pct: number; late_fee_after: number; late_fee_cap_pct: number; required_docs: string[] }
export function parseFeatureCfg(s: Record<string, string>): FeatureCfg {
  const num = (k: string, d: number) => { const v = Number(s[k]); return Number.isFinite(v) && s[k] !== '' && s[k] != null ? v : d; };
  let req: string[] = ['tenant:الهوية|السجل التجاري', 'contract:نسخة العقد الموقعة'];
  try { if (s.required_docs) req = JSON.parse(s.required_docs); } catch {}
  return { late_fee_pct: num('late_fee_pct', 2), late_fee_after: num('late_fee_after', 30), late_fee_cap_pct: num('late_fee_cap_pct', 10), required_docs: req };
}
