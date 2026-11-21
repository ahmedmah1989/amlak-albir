import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { createVoucher } from '@/lib/actions6';
import { money, VOUCHER_KINDS } from '@/lib/fmt';

export default async function NewVoucher({ searchParams }: { searchParams: { contract?: string; kind?: string; amount?: string } }) {
  const { db, a, org, asOf } = await ctx('accountant');
  const c = searchParams.contract ? a.C.get(searchParams.contract) : undefined;
  const refunded = c ? db.vouchers.filter((v) => v.contract_id === c.id && v.kind === 'deposit_refund' && v.status !== 'voided').reduce((n, v) => n + v.amount, 0) : 0;
  const remain = c ? Math.max(0, (c.deposit ?? 0) - refunded - (c.deposit_deduction ?? 0)) : 0;
  const withDep = db.contracts.filter((x) => (x.deposit ?? 0) > 0);
  return (
    <Page title="سند صرف جديد" sub="يُنشأ السند بحالة «بانتظار الاعتماد»، ويعتمده المدير" org={org} asOf={asOf} back={['/vouchers', 'سندات الصرف']}>
      <div className="card">
        {c && <p className="note">العقد: {a.P.get(c.property_id)?.short} — {a.U.get(c.unit_id)?.code} • المستأجر: {a.T.get(c.tenant_id)?.name} • التأمين {money(c.deposit)} • المستقطع {money(c.deposit_deduction ?? 0)} • سُدد سابقاً {money(refunded)} • <b>المتبقي للرد {money(remain)}</b></p>}
        <Form action={createVoucher} submit="إنشاء السند" cancel="/vouchers">
          <F label="نوع السند" name="kind" req def={searchParams.kind ?? (c ? 'deposit_refund' : 'other')} opts={Object.entries(VOUCHER_KINDS)} />
          <F label="التاريخ" name="date" type="date" req def={asOf} max={asOf} />
          {c ? <Hidden n="contract_id" v={c.id} /> : <F label="العقد (اختياري)" name="contract_id" opts={withDep.map((x) => [x.id, `${a.P.get(x.property_id)?.short} — ${a.U.get(x.unit_id)?.code} — ${a.T.get(x.tenant_id)?.name} (تأمين ${money(x.deposit)})`])} hint="مطلوب لرد التأمين" />}
          <F label="المستفيد" name="payee" def={c ? a.T.get(c.tenant_id)?.name : undefined} hint="يُؤخذ من العقد إن تُرك فارغاً" />
          <F label="المبلغ" name="amount" type="number" req def={searchParams.amount ?? (c && remain ? remain : undefined)} />
          <F label="طريقة الصرف" name="method" req def="تحويل بنكي" opts={['تحويل بنكي', 'شيك', 'نقدي'].map((x) => [x, x])} />
          <F label="رقم الحوالة / الشيك" name="bank_ref" />
          <F label="البيان" name="note" type="textarea" wide />
        </Form>
      </div>
    </Page>
  );
}
