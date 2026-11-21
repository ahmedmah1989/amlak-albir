import { F } from './form';
import type { Contract } from '@/lib/types';
import { USAGE, UTILITIES, DEPOSIT_STATUS, opts } from '@/lib/fmt';

/** الحقول التفصيلية للعقد — مشتركة بين الإنشاء والتجديد والتعديل */
export default function ContractFields({ c, schedule = false }: { c?: Partial<Contract>; schedule?: boolean }) {
  return <>
    <h3 className="sec-title">النشاط والتوثيق</h3>
    <F label="الاسم التجاري / النشاط" name="trade_name" def={c?.trade_name} hint="يظهر بجانب اسم المستأجر في كل الشاشات" />
    <F label="نوع الاستخدام" name="usage" def={c?.usage} opts={opts(USAGE)} />
    <F label="تاريخ التوقيع" name="signed_on" type="date" def={c?.signed_on} />
    <F label="رقم العقار في منصة إيجار" name="ejar_property_id" def={c?.ejar_property_id} dir="ltr" />
    <F label="مكتب الوساطة" name="broker" def={c?.broker} />
    <h3 className="sec-title">الشروط المالية</h3>
    <F label="ضريبة القيمة المضافة %" name="vat_rate" type="number" def={c?.vat_rate} min="0" max="30" hint={schedule ? 'تُضاف لقيمة الأقساط المولّدة (التجاري 15%)' : 'تُطبَّق على الأقساط المولّدة لاحقاً'} />
    <F label="الزيادة السنوية %" name="escalation_pct" type="number" def={c?.escalation_pct} min="0" max="50" hint="تُطبق على كل سنة تعاقدية بعد الأولى" />
    <F label="مبلغ التأمين" name="deposit" type="number" def={c?.deposit} min="0" />
    <F label="حالة التأمين" name="deposit_status" def={c?.deposit_status} opts={opts(DEPOSIT_STATUS)} />
    <F label="رسوم منصة إيجار" name="ejar_fees" type="number" def={c?.ejar_fees} min="0" />
    <F label="السعي / العمولة" name="brokerage" type="number" def={c?.brokerage} min="0" />
    <F label="الكهرباء والمياه" name="utilities" def={c?.utilities} opts={opts(UTILITIES)} />
    <F label="مدة الإشعار بعدم التجديد (يوم)" name="notice_days" type="number" def={c?.notice_days} min="0" />
    <label className="fld"><span>التجديد التلقائي</span><span><input type="checkbox" name="auto_renew" defaultChecked={!!c?.auto_renew} /> يتجدد تلقائياً ما لم يُشعر أحد الطرفين</span></label>
  </>;
}
