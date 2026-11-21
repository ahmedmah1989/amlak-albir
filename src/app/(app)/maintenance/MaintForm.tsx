import { Form, F, Hidden } from '@/components/form';
import { saveMaintenance } from '@/lib/actions2';
import type { Maint, Property, Unit } from '@/lib/types';
export default function MaintForm({ m, props, units, pid, today }: { m?: Maint; props: Property[]; units: Unit[]; pid?: string; today: string }) {
  return (
    <Form action={saveMaintenance} cancel={m ? `/maintenance/${m.id}` : '/maintenance'}>
      {m && <Hidden n="id" v={m.id} />}
      <F label="العقار" name="property_id" req def={m?.property_id ?? pid} opts={props.map((p) => [p.id, p.name])} />
      <F label="الوحدة (اختياري)" name="unit_id" def={m?.unit_id} opts={units.filter((u) => u.kind === 'lease').map((u) => [u.id, `${props.find((p) => p.id === u.property_id)?.short} — ${u.code}`])} />
      <F label="عنوان الطلب" name="title" req def={m?.title} wide />
      <F label="الأولوية" name="priority" req def={m?.priority ?? 'عادية'} opts={[['عاجلة', 'عاجلة'], ['عادية', 'عادية'], ['منخفضة', 'منخفضة']]} />
      <F label="التكلفة على" name="charge_to" req def={m?.charge_to ?? 'الجمعية'} opts={[['الجمعية', 'الجمعية'], ['المستأجر', 'المستأجر']]} />
      <F label="المقاول / المورد" name="vendor" def={m?.vendor} />
      <F label="التكلفة التقديرية" name="est_cost" type="number" def={m?.est_cost} />
      {!m && <F label="تاريخ الطلب" name="opened_on" type="date" def={today} />}
      <F label="التفاصيل" name="details" type="textarea" def={m?.details} wide />
      {!m && <label className="fld wide"><span>📷 صور العطل (اختياري)</span><input type="file" name="files" accept="image/*,application/pdf" multiple /></label>}
    </Form>
  );
}
