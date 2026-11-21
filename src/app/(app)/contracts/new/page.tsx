import { ctx } from '@/lib/ctx';
import { Page, Btn } from '@/components/ui';
import { Form, F } from '@/components/form';
import { createContract } from '@/lib/actions';
import { FREQ_OPTS } from '@/lib/fmt';
import ContractFields from '@/components/ContractFields';
import FileFields from '@/components/FileFields';
import { ATT_CATS } from '@/lib/fmt';

export default async function NewContract({ searchParams }: { searchParams: { unit?: string; property?: string; tenant?: string } }) {
  const { db, a, org, asOf } = await ctx('accountant');
  const busy = new Set(db.contracts.filter((c) => c.status === 'active').map((c) => c.unit_id));
  const units = db.units.filter((u) => u.kind === 'lease' && (!searchParams.property || u.property_id === searchParams.property));
  const uopts: [string, string][] = units.map((u) => [u.id, `${a.P.get(u.property_id)?.short} — ${u.code}${busy.has(u.id) ? ' (عليها عقد ساري)' : ''}`]);
  return (
    <Page title="عقد إيجار جديد" sub="يُنشأ جدول الأقساط تلقائياً حسب دورية الدفع" org={org} asOf={asOf} back={['/contracts', 'العقود']}
      actions={<><Btn href="/tenants/new" kind="ghost">＋ مستأجر جديد</Btn></>}>
      <div className="card"><Form action={createContract} submit="إنشاء العقد" cancel="/contracts">
        <F label="الوحدة" name="unit_id" req def={searchParams.unit} opts={uopts} hint="الوحدة غير الموجودة تُضاف من صفحة العقار" />
        <F label="المستأجر" name="tenant_id" req def={searchParams.tenant} opts={db.tenants.map((t) => [t.id, t.name + (db.contracts.find((c) => c.tenant_id === t.id && c.trade_name)?.trade_name ? ' — ' + db.contracts.find((c) => c.tenant_id === t.id && c.trade_name)!.trade_name : '')])} />
        <F label="رقم العقد (منصة إيجار)" name="contract_no" dir="ltr" />
        <F label="تاريخ البداية" name="start_date" type="date" req />
        <F label="تاريخ النهاية" name="end_date" type="date" req />
        <F label="الإيجار السنوي (ريال)" name="annual_rent" type="number" req min="0" />
        <F label="دورية الدفع" name="frequency" req def="quarterly" opts={FREQ_OPTS} hint="الجدول الخاص: تُضاف الأقساط يدوياً من صفحة العقد" />
        <ContractFields schedule />
        <F label="ملاحظات" name="notes" type="textarea" wide />
        <FileFields cats={ATT_CATS.contract} label="نسخة العقد الموقعة والملاحق (أكثر من ملف)" />
      </Form></div>
    </Page>
  );
}
