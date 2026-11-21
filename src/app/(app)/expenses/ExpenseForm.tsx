import { Form, F, Hidden } from '@/components/form';
import { saveExpense } from '@/lib/actions';
import { EXPENSE_CATS, opts } from '@/lib/fmt';
import type { Expense, Property } from '@/lib/types';
export default function ExpenseForm({ e, props, pid, today }: { e?: Expense; props: Property[]; pid?: string; today: string }) {
  return (
    <Form action={saveExpense} cancel="/expenses">
      {e && <Hidden n="id" v={e.id} />}
      <F label="العقار" name="property_id" req def={e?.property_id ?? pid} opts={props.map((p) => [p.id, p.name])} />
      <F label="التاريخ" name="date" type="date" req def={e?.date ?? today} />
      <F label="البند" name="category" req def={e?.category} opts={opts(EXPENSE_CATS)} />
      <F label="المبلغ (ريال)" name="amount" type="number" req def={e?.amount} min="0.01" />
      <F label="المورد / المقاول" name="vendor" def={e?.vendor} />
      <F label="رقم الفاتورة / التعميد" name="ref" def={e?.ref} />
      <F label="الوصف" name="description" type="textarea" def={e?.description} wide />
    </Form>
  );
}
