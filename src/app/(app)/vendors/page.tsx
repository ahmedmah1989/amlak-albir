import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { money } from '@/lib/fmt';
import { TRADES } from '@/lib/ops';
import { saveVendor } from '@/lib/ops-actions';
import { daysBetween } from '@/lib/calc';
export const dynamic = 'force-dynamic';
function VendorForm({ v }: { v?: Record<string, any> }) {
  return <form action={saveVendor} className="frm">{v && <input type="hidden" name="id" value={v.id} />}<div className="grid">
    <label className="fld"><span>الاسم</span><input name="name" required defaultValue={v?.name} /></label>
    <label className="fld"><span>التخصص</span><select name="trade" defaultValue={v?.trade ?? ''}><option value="">—</option>{TRADES.map((t) => <option key={t}>{t}</option>)}</select></label>
    <label className="fld"><span>الجوال</span><input name="phone" dir="ltr" defaultValue={v?.phone} /></label><label className="fld"><span>البريد</span><input name="email" dir="ltr" defaultValue={v?.email} /></label>
    <label className="fld"><span>السجل التجاري</span><input name="cr" dir="ltr" defaultValue={v?.cr} /></label><label className="fld"><span>الرقم الضريبي</span><input name="vat" dir="ltr" defaultValue={v?.vat} /></label>
    <label className="fld"><span>الآيبان</span><input name="iban" dir="ltr" defaultValue={v?.iban} /></label><label className="fld"><span>مسؤول التواصل</span><input name="contact" defaultValue={v?.contact} /></label>
    <label className="fld"><span>التقييم (1–5)</span><input name="rating" type="number" min={1} max={5} defaultValue={v?.rating ?? ''} /></label>
    <label className="fld"><span>الحالة</span><select name="active" defaultValue={v?.active === false ? '0' : '1'}><option value="1">نشط</option><option value="0">موقوف</option></select></label>
    <label className="fld wide"><span>ملاحظات</span><input name="notes" defaultValue={v?.notes} /></label></div><div className="fa"><button className="btn" type="submit">حفظ</button></div></form>;
}
/** سجل الموردين والمقاولين مع أدائهم: عدد الأعمال، التكلفة، متوسط مدة الإنجاز */
export default async function Vendors() {
  const { db, org, asOf, canEdit } = await ctx();
  const vs = await q('select * from vendors order by active desc, name');
  const st = vs.map((v) => { const jobs = db.maintenance.filter((m: any) => m.vendor_id === v.id || (!m.vendor_id && m.vendor === v.name)); const done = jobs.filter((m) => m.status === 'done');
    return { v, jobs: jobs.length, open: jobs.filter((m) => m.status === 'open' || m.status === 'progress').length, cost: done.reduce((n, m) => n + (m.cost ?? 0), 0), avg: done.length ? Math.round(done.reduce((n, m) => n + daysBetween(m.opened_on, m.closed_on ?? asOf), 0) / done.length) : null }; });
  return (
    <Page title="الموردون والمقاولون" sub="سجل موحد للموردين، يُختار منه في طلبات الصيانة وأوامر العمل والصيانة الدورية." org={org} asOf={asOf} print>
      <div className="kpis"><Kpi l="موردون نشطون" v={String(vs.filter((v) => v.active).length)} /><Kpi tone="info" l="أعمال مفتوحة" v={String(st.reduce((n, x) => n + x.open, 0))} href="/maintenance" /><Kpi l="إجمالي التكلفة المنفذة" v={money(st.reduce((n, x) => n + x.cost, 0))} unit="ريال" /></div>
      <div className="card"><div className="tbl"><table><thead><tr><th>المورد</th><th>التخصص</th><th>التواصل</th><th className="n">الأعمال</th><th className="n">مفتوحة</th><th className="n">التكلفة</th><th className="n">متوسط الإنجاز</th><th>التقييم</th><th /></tr></thead><tbody>
        {st.map(({ v, jobs, open, cost, avg }) => <tr key={v.id}><td><b>{v.name}</b>{!v.active && <Tag tone="mute">موقوف</Tag>}{v.vat && <div className="cell-sub" dir="ltr">VAT {v.vat}</div>}</td><td>{v.trade ?? '—'}</td>
          <td>{v.phone && <a href={`tel:${v.phone}`} dir="ltr">{v.phone}</a>}{v.contact && <div className="cell-sub">{v.contact}</div>}</td><td className="n">{jobs}</td><td className="n">{open || '—'}</td><td className="n">{money(cost)}</td><td className="n">{avg == null ? '—' : `${avg} يوماً`}</td>
          <td>{v.rating ? '★'.repeat(v.rating) : '—'}</td><td>{canEdit && <details className="row-edit"><summary className="btn sm ghost">تعديل</summary><div className="row-edit-in"><VendorForm v={v} /></div></details>}</td></tr>)}
        {!vs.length && <tr><td colSpan={9} className="muted">لا يوجد موردون بعد.</td></tr>}</tbody></table></div></div>
      {canEdit && <details className="box noprint" open={!vs.length}><summary>إضافة مورد</summary><div className="in"><VendorForm /></div></details>}
      <p className="muted"><Link href="/maintenance/plans">الصيانة الدورية ←</Link></p>
    </Page>
  );
}
