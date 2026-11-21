import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { renewContract } from '@/lib/actions';
import { addDays, addMonths } from '@/lib/calc';
import { money, FREQ_OPTS } from '@/lib/fmt';
import ContractFields from '@/components/ContractFields';
import FileFields from '@/components/FileFields';
import { ATT_CATS } from '@/lib/fmt';

export default async function Renew({ params }: { params: { id: string } }) {
  const { a, org, asOf } = await ctx('accountant'); const c = a.C.get(params.id); if (!c || c.status !== 'active') notFound();
  const start = addDays(c.end_date, 1), end = addDays(addMonths(start, 12), -1);
  const arrears = a.rows.filter((r) => r.contract_id === c.id && (r.status === 'overdue' || r.status === 'unconfirmed')).reduce((x, r) => x + r.balance, 0);
  return (
    <Page title={`تجديد عقد ${a.P.get(c.property_id)?.short} — ${a.U.get(c.unit_id)?.code}`} sub={`المستأجر: ${a.T.get(c.tenant_id)?.name}`} org={org} asOf={asOf} back={[`/contracts/${c.id}`, 'العقد']}>
      {arrears > 0 && <p className="note warn">⚠ على العقد الحالي أرصدة مفتوحة بقيمة <b>{money(arrears)} ريال</b>. يُنصح بربط التجديد بسدادها أو جدولتها باتفاق موقّع.</p>}
      <div className="card"><Form action={renewContract} submit="تجديد العقد" cancel={`/contracts/${c.id}`}>
        <Hidden n="id" v={c.id} />
        <F label="بداية العقد الجديد" name="start_date" type="date" req def={start} />
        <F label="نهاية العقد الجديد" name="end_date" type="date" req def={end} />
        <F label="الإيجار السنوي الجديد" name="annual_rent" type="number" req def={c.escalation_pct ? Math.round(c.annual_rent * (1 + c.escalation_pct / 100)) : c.annual_rent} hint={`الحالي: ${money(c.annual_rent)}${c.escalation_pct ? ` • مقترح بزيادة ${c.escalation_pct}%` : ''}`} />
        <F label="دورية الدفع" name="frequency" req def={c.frequency ?? 'quarterly'} opts={FREQ_OPTS} />
        <F label="رقم العقد الجديد (منصة إيجار)" name="contract_no" />
        <ContractFields c={{ ...c, signed_on: null, deposit_status: c.deposit_status }} schedule />
        <F label="ملاحظات" name="notes" type="textarea" wide />
        <FileFields cats={ATT_CATS.contract} label="نسخة العقد المجدد (أكثر من ملف)" />
      </Form></div>
    </Page>
  );
}
