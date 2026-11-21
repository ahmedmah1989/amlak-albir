import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import ExpenseForm from '../ExpenseForm';
export default async function NewExpense({ searchParams }: { searchParams: { property?: string } }) {
  const { db, org, asOf } = await ctx('accountant');
  return <Page title="تسجيل مصروف" org={org} asOf={asOf} back={['/expenses', 'المصروفات']}><div className="card"><ExpenseForm props={db.properties} pid={searchParams.property} today={asOf} /></div></Page>;
}
