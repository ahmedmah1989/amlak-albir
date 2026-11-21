import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Empty } from '@/components/ui';
import { F, Hidden } from '@/components/form';
import SubmitButton from '@/components/SubmitButton';
import { InstStat } from '@/components/InstallmentBoard';
import { settleArrears } from '@/lib/actions3';
import { money, date } from '@/lib/fmt';
import { addMonths } from '@/lib/calc';

export default async function Settle({ params }: { params: { id: string } }) {
  const { a, org, asOf } = await ctx('admin');
  const c = a.C.get(params.id); if (!c) notFound();
  const rows = a.rows.filter((r) => r.contract_id === c.id && r.balance > 0 && r.due_date <= asOf).sort((x, y) => x.due_date.localeCompare(y.due_date));
  const total = rows.reduce((x, r) => x + r.balance, 0);
  return (
    <Page title={`اتفاق جدولة متأخرات — ${a.U.get(c.unit_id)?.code}`} sub={`المستأجر: ${a.T.get(c.tenant_id)?.name}`} org={org} asOf={asOf} back={[`/contracts/${c.id}`, 'العقد']}>
      <p className="note">يُرحَّل رصيد الأقساط المختارة بخصم معتمد من نوع «ترحيل لاتفاق جدولة» برقم القرار، ثم تُنشأ دفعات جديدة بنفس الإجمالي. صافي المديونية لا يتغير، وكشف الحساب يبين الحركتين.</p>
      {!rows.length ? <Empty>لا توجد أقساط مستحقة غير مسددة على هذا العقد.</Empty> :
      <form action={settleArrears} className="frm card"><Hidden n="contract_id" v={c.id} />
        <h2>الأقساط المستحقة ({rows.length}) — الإجمالي {money(total)} ريال</h2>
        <div className="tbl"><table><thead><tr><th>شمول</th><th className="n">#</th><th className="n">الاستحقاق</th><th className="n">القيمة</th><th className="n">المتبقي</th><th>الحالة</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td><input type="checkbox" name="inst" value={r.id} defaultChecked style={{ width: 20, height: 20 }} /></td><td className="n">{r.no}</td><td className="n">{date(r.due_date)}</td><td className="n">{money(r.amount)}</td><td className="n">{money(r.balance)}</td><td><InstStat r={r} /></td></tr>)}</tbody></table></div>
        <div className="grid">
          <F label="عدد الدفعات الجديدة" name="count" type="number" req def={3} min="1" max="60" />
          <F label="الفاصل بين الدفعات" name="every" req def="1" opts={[['1', 'شهري'], ['2', 'كل شهرين'], ['3', 'ربع سنوي'], ['6', 'نصف سنوي']]} />
          <F label="تاريخ أول دفعة" name="first_due" type="date" req def={addMonths(asOf, 1)} />
          <F label="رقم قرار / اتفاق الجدولة" name="decision_no" req />
          <F label="ملاحظات الاتفاق" name="note" wide />
        </div>
        <p className="note warn">آخر دفعة تستوعب فرق التقريب. يُسجَّل الاتفاق في سجل المتابعة ويُحدد موعد المتابعة بتاريخ أول دفعة.</p>
        <div className="fa"><SubmitButton label="اعتماد اتفاق الجدولة" /></div>
      </form>}
    </Page>
  );
}
