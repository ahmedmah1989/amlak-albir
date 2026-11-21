import Link from 'next/link';
import { pq } from '@/lib/db';
import { requirePlatform } from '@/lib/platform';
import { revenue, INV_STATUS, today } from '@/lib/billing';
import { savePlans } from '@/lib/platform-actions';
export const dynamic = 'force-dynamic';
const m = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
export default async function Billing({ searchParams }: { searchParams: { st?: string } }) {
  await requirePlatform();
  const r = await revenue(); const plans = await pq('select * from plans order by monthly'); const S = Object.fromEntries((await pq('select key,value from settings')).map((x) => [x.key, x.value]));
  const st = searchParams.st ?? '';
  const inv = await pq(`select i.*, o.name from sub_invoices i join orgs o on o.slug=i.org ${st === 'overdue' ? `where i.status='unpaid' and i.due_on < '${today()}'` : st ? 'where i.status=$1' : ''} order by i.created_at desc limit 300`, st && st !== 'overdue' ? [st] : []);
  const mx = Math.max(1, ...r.months.map((x) => x.v));
  return <>
    <div className="pf-head"><h1>الفوترة والإيرادات</h1></div>
    <div className="kpis"><div className="kpi hero"><div className="l">الإيراد الشهري المتكرر (MRR)</div><div className="v">{m(r.mrr)} <small>ريال</small></div><div className="s">سنوياً {m(r.arr)} ريال</div></div>
      <div className="kpi info"><div className="l">محصّل هذا العام</div><div className="v">{m(r.ytd)}</div></div>
      <Link className="kpi warn" href="/platform/billing?st=unpaid"><div className="l">فواتير غير مدفوعة</div><div className="v">{m(r.unpaid)}</div></Link>
      <Link className="kpi bad" href="/platform/billing?st=overdue"><div className="l">منها متأخرة عن الاستحقاق</div><div className="v">{m(r.overdue)}</div></Link></div>
    {r.months.length > 0 && <div className="card"><h2>المحصّل شهرياً</h2>{r.months.map((x) => <div className="fc-row" key={x.m}><span>{x.m}</span><div className="bar"><i style={{ width: `${(x.v / mx) * 100}%` }} /></div><b>{m(x.v)}</b></div>)}</div>}
    <div className="card"><h2>فواتير الاشتراكات</h2>
      <div className="chips">{[['', 'الكل'], ['unpaid', 'غير مدفوعة'], ['overdue', 'متأخرة'], ['paid', 'مدفوعة'], ['void', 'ملغاة']].map(([k, l]) => <Link key={k} className={'chip' + (st === k ? ' on' : '')} href={`/platform/billing${k ? '?st=' + k : ''}`}>{l}</Link>)}</div>
      <div className="tbl"><table><thead><tr><th>الرقم</th><th>الجهة</th><th>الفترة</th><th className="n">الإجمالي</th><th>الاستحقاق</th><th>الحالة</th></tr></thead><tbody>
        {inv.map((i) => <tr key={i.id}><td><Link href={`/platform/billing/${i.id}`}>{i.no}</Link></td><td><Link href={`/platform/org/${i.org}`}>{i.name}</Link></td><td className="nowrap">{String(i.period_from)} — {String(i.period_to)}</td><td className="n">{m(Number(i.total))}</td><td>{String(i.due_on)}</td>
          <td><span className={'tag t-' + (i.status === 'unpaid' && String(i.due_on) < today() ? 'bad' : INV_STATUS[i.status]?.[1])}>{i.status === 'unpaid' && String(i.due_on) < today() ? 'متأخرة' : INV_STATUS[i.status]?.[0]}</span></td></tr>)}
        {!inv.length && <tr><td colSpan={6} className="muted">لا توجد فواتير. فواتير التجديد تصدر تلقائياً قبل انتهاء الاشتراك بـ 14 يوماً، أو يدوياً من صفحة الجهة.</td></tr>}</tbody></table></div></div>
    <form action={savePlans} className="card frm"><h2>الباقات والأسعار (قبل الضريبة)</h2>
      <div className="tbl"><table><thead><tr><th>الباقة</th><th>الاسم</th><th>شهري</th><th>سنوي</th><th>المستخدمون</th></tr></thead><tbody>{plans.map((p) => <tr key={p.key}><td dir="ltr">{p.key}<input type="hidden" name="key" value={p.key} /></td>
        <td><input className="inp" name={`name_${p.key}`} defaultValue={p.name} /></td><td><input className="inp" name={`monthly_${p.key}`} defaultValue={Number(p.monthly)} dir="ltr" /></td><td><input className="inp" name={`annual_${p.key}`} defaultValue={Number(p.annual)} dir="ltr" /></td><td><input className="inp" name={`users_${p.key}`} defaultValue={p.max_users} dir="ltr" /></td></tr>)}</tbody></table></div>
      <h3>بيانات المصدر في الفاتورة</h3><div className="grid">
        <label className="fld"><span>اسم المنشأة</span><input name="biz_name" defaultValue={S.biz_name ?? ''} /></label><label className="fld"><span>الرقم الضريبي</span><input name="biz_vat" defaultValue={S.biz_vat ?? ''} dir="ltr" /></label>
        <label className="fld"><span>العنوان</span><input name="biz_address" defaultValue={S.biz_address ?? ''} /></label><label className="fld"><span>نسبة الضريبة %</span><input name="vat_rate" defaultValue={S.vat_rate ?? '15'} dir="ltr" /></label>
        <label className="fld wide"><span>بيانات التحويل البنكي (تظهر في الفاتورة)</span><input name="bank_info" defaultValue={S.bank_info ?? ''} placeholder="اسم البنك — الآيبان" /></label></div>
      <div className="fa"><button className="btn" type="submit">حفظ</button></div></form>
  </>;
}
