import { Form, F, Hidden } from '@/components/form';
import { saveProperty } from '@/lib/actions';
import type { Property } from '@/lib/types';
import { money, LAND_BASIS } from '@/lib/fmt';
export default function PropertyForm({ p }: { p?: Property }) {
  return (
    <Form action={saveProperty} cancel={p ? `/properties/${p.id}` : '/properties'}>
      {p && <Hidden n="id" v={p.id} />}
      <F label="اسم العقار" name="name" def={p?.name} req />
      <F label="الاسم المختصر" name="short" def={p?.short} hint="يظهر في الجداول والتقارير" />
      <F label="نوع العقار" name="type" def={p?.type} opts={['عمارة سكني تجاري', 'عمارة سكنية', 'عمارة تجارية', 'فندق', 'أرض', 'محلات', 'فيلا', 'عمارة'].map((x) => [x, x])} />
      <F label="الملكية" name="ownership" def={p?.ownership} opts={['ملك الجمعية', 'وقف تستفيد منه الجمعية', 'مستأجر من الغير'].map((x) => [x, x])} />
      <F label="الموقع" name="location" def={p?.location} wide />
      <F label="وضع الأرض" name="land_basis" def={p?.land_basis ?? 'owned'} opts={LAND_BASIS} req hint="يحدد هل للأرض قيمة مستقلة وهل يوجد مبنى" />
      <F label="مساحة الأرض م²" name="land_area" type="number" def={p?.land_area} />
      <F label="مساحة المبنى م²" name="building_area" type="number" def={p?.building_area} />
      {p ? <div className="fld wide"><span>القيمة الحالية</span>
        <p className="note">الأرض {money(p.land_value)} • المبنى {money(p.building_value)} — تُعدَّل القيمة من تبويب «القيمة والتقييمات» كإعادة تقييم بتاريخها، ليبقى لكل تغيير سجل.</p></div> : <>
        <F label="قيمة الأرض" name="land_value" type="number" hint="اتركها فارغة إن كانت الأرض مستأجرة" />
        <F label="قيمة المبنى" name="building_value" type="number" hint="اتركها فارغة إن كانت أرضاً فضاء" />
        <F label="تاريخ القيمة" name="val_date" type="date" hint="تاريخ الشراء أو التقييم الأول (اختياري)" />
        <F label="أساس القيمة" name="value_status" opts={['مسجلة', 'دفترية', 'الأرض تقديرية', 'تقديرية', 'غير مدرجة في السجل'].map((x) => [x, x])} />
      </>}
      <F label="رقم الصك" name="deed_no" def={p?.deed_no} />
      <F label="نهاية عقد الأرض/المبنى (إن كان مستأجراً)" name="ground_lease_end" type="date" def={p?.ground_lease_end} />
      <F label="ملاحظات" name="notes" type="textarea" def={p?.notes} wide />
    </Form>
  );
}
