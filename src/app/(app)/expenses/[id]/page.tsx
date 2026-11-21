import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { Hidden } from '@/components/form';
import { deleteExpense } from '@/lib/actions';
import ExpenseForm from '../ExpenseForm';
export default async function EditExpense({ params }: { params: { id: string } }) {
  const { db, org, asOf, isAdmin } = await ctx('accountant'); const e = db.expenses.find((x) => x.id === params.id); if (!e) notFound();
  return (<Page title="تعديل مصروف" org={org} asOf={asOf} back={['/expenses', 'المصروفات']}>
    <div className="card"><ExpenseForm e={e} props={db.properties} today={asOf} /></div>
    {isAdmin && <form action={deleteExpense}><Hidden n="id" v={e.id} /><button className="btn sm danger" type="submit">حذف المصروف</button></form>}</Page>);
}
