import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { money, date } from '@/lib/fmt';
import { saveObligation, payObligation } from '@/lib/ops-actions';
import { daysBetween } from '@/lib/calc';
export const dynamic = 'force-dynamic';
const FREQ: [string, string][] = [['annual', 'سنوي'], ['semiannual', 'نصف سنوي'], ['quarterly', 'ربع سنوي'], ['monthly', 'شهري']];
/** مستحقات المؤجرين: للعقارات التي تستأجر الجمعية أرضها أو مبناها — جدول الدفعات وسدادها كمصروف على العقار */
export default async function Payables({ searchParams }: { searchParams: { f?: string } }) {
  const { db, a, org, asOf, canEdit } = await ctx();
  const obs = await q('select * from lease_obligations order by start_date');
  const pays = await q('select p.*, o.property_id, o.landlord from obligation_payments p join lease_obligations o on o.id=p.obligation_id order by p.due_date');
  const f = searchParams.f ?? 'open';
  const list = pays.filter((p) => f === 'all' || (f === 'paid' ? p.status === 'paid' : p.status !== 'paid' && daysBetween(asOf, String(p.due_date)) <= 120));
  const over = pays.filter((p) => p.status !== 'paid' && String(p.due_date) < asOf), soon = pays.filter((p) => p.status !== 'paid' && String(p.due_date) >= asOf && daysBetween(asOf, String(p.due_date)) <= 60);
  const leased = db.properties.filter((p) => (p as any).land_basis === 'leased' && !obs.some((o) => o.property_id === p.id));
  return (
    <Page title="مستحقات المؤجرين" sub="الدفعات المستحقة على الجمعية لملاك الأراضي أو المباني المستأجرة. السداد يُسجَّل مصروفاً على العقار ويدخل في صافي العائد." org={org} asOf={asOf} print>
      <div className="kpis"><Kpi tone="bad" l="متأخرة السداد" v={money(over.reduce((n, p) => n + Number(p.amount), 0))} unit="ريال" s={`${over.length} دفعة`} href="?f=open" />
        <Kpi tone="warn" l="تستحق خلال 60 يوماً" v={money(soon.reduce((n, p) => n + Number(p.amount), 0))} unit="ريال" s={`${soon.length} دفعة`} />
        <Kpi l="الالتزام السنوي" v={money(obs.filter((o) => String(o.end_date) >= asOf).reduce((n, o) => n + Number(o.annual_amount), 0))} unit="ريال" s={`${obs.length} عقد`} /></div>
      {leased.length > 0 && <p className="note warn">عقارات أرضها مستأجرة بلا التزام مسجل: {leased.map((p) => p.short).join('، ')}. سجّل عقد الأرض ليظهر في العائد الصافي.</p>}
      <div className="chips noprint">{[['open', 'المستحقة والقادمة'], ['paid', 'المسددة'], ['all', 'الكل']].map(([k, l]) => <Link key={k} href={`?f=${k}`} className={'chip' + (f === k ? ' on' : '')}>{l}</Link>)}</div>
      <div className="card"><div className="tbl"><table><thead><tr><th>الاستحقاق</th><th>العقار</th><th>المؤجر</th><th className="n">المبلغ</th><th>الحالة</th><th /></tr></thead><tbody>
        {list.map((p) => { const late = p.status !== 'paid' && String(p.due_date) < asOf; return <tr key={p.id}><td>{date(String(p.due_date))}</td><td><Link href={`/properties/${p.property_id}`}>{a.P.get(p.property_id)?.short}</Link></td><td>{p.landlord}</td><td className="n">{money(Number(p.amount))}</td>
          <td>{p.status === 'paid' ? <><Tag tone="ok">مسددة</Tag> <span className="muted">{date(String(p.paid_on))}{p.ref ? ` • ${p.ref}` : ''}</span></> : <Tag tone={late ? 'bad' : 'warn'}>{late ? `متأخرة ${daysBetween(String(p.due_date), asOf)} يوماً` : 'قادمة'}</Tag>}</td>
          <td>{canEdit && p.status !== 'paid' && <details className="row-edit"><summary className="btn sm">تسجيل السداد</summary><div className="row-edit-in"><form action={payObligation} className="frm"><input type="hidden" name="id" value={p.id} /><div className="grid">
            <label className="fld"><span>تاريخ السداد</span><input type="date" name="paid_on" defaultValue={asOf} /></label><label className="fld"><span>المبلغ</span><input name="amount" dir="ltr" defaultValue={Number(p.amount)} /></label><label className="fld"><span>المرجع</span><input name="ref" /></label></div>
            <div className="fa"><button className="btn" type="submit">تسجيل</button></div></form></div></details>}</td></tr>; })}
        {!list.length && <tr><td colSpan={6} className="muted">لا توجد دفعات في هذا الاختيار.</td></tr>}</tbody></table></div></div>
      {canEdit && <details className="box noprint" open={!obs.length}><summary>إضافة عقد مع مؤجر (أرض أو مبنى)</summary><div className="in"><form action={saveObligation} className="frm"><div className="grid">
        <label className="fld"><span>العقار</span><select name="property_id" required defaultValue={leased[0]?.id ?? ''}><option value="" disabled>اختر</option>{db.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="fld"><span>المؤجر</span><input name="landlord" required /></label><label className="fld"><span>رقم العقد</span><input name="contract_no" dir="ltr" /></label>
        <label className="fld"><span>من</span><input type="date" name="start_date" required /></label><label className="fld"><span>إلى</span><input type="date" name="end_date" required defaultValue={leased[0] && (leased[0] as any).ground_lease_end ? String((leased[0] as any).ground_lease_end) : ''} /></label>
        <label className="fld"><span>الإيجار السنوي</span><input name="annual_amount" required dir="ltr" /></label><label className="fld"><span>الدورية</span><select name="frequency">{FREQ.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="fld"><span>آيبان المؤجر</span><input name="iban" dir="ltr" /></label><label className="fld wide"><span>ملاحظات</span><input name="notes" /></label></div>
        <div className="fa"><button className="btn" type="submit">حفظ وإنشاء جدول الدفعات</button></div></form></div></details>}
    </Page>
  );
}
