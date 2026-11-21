import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { money, date } from '@/lib/fmt';
import { TRADES } from '@/lib/ops';
import { savePmPlan, runPmNow } from '@/lib/ops-actions';
import { daysBetween } from '@/lib/calc';
export const dynamic = 'force-dynamic';
/** الصيانة الدورية: خطط تتكرر كل عدد أشهر، وتُنشئ طلب صيانة تلقائياً قبل موعدها بأسبوع */
export default async function Plans() {
  const { db, a, org, asOf, canEdit } = await ctx();
  const plans = await q('select * from pm_plans order by active desc, next_due'); const vs = await q('select id, name from vendors where active order by name');
  const V = new Map(vs.map((v) => [v.id, v.name]));
  const Form = ({ p }: { p?: Record<string, any> }) => <form action={savePmPlan} className="frm">{p && <input type="hidden" name="id" value={p.id} />}<div className="grid">
    <label className="fld"><span>العقار</span><select name="property_id" required defaultValue={p?.property_id ?? ''}><option value="" disabled>اختر</option>{db.properties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className="fld"><span>الوحدة (اختياري)</span><select name="unit_id" defaultValue={p?.unit_id ?? ''}><option value="">كل العقار</option>{db.units.filter((u) => u.kind === 'lease').map((u) => <option key={u.id} value={u.id}>{a.P.get(u.property_id)?.short} — {u.code}</option>)}</select></label>
    <label className="fld"><span>العمل</span><input name="title" required defaultValue={p?.title} placeholder="مثل: صيانة المصاعد، تنظيف الخزانات" /></label>
    <label className="fld"><span>التخصص</span><select name="trade" defaultValue={p?.trade ?? ''}><option value="">—</option>{TRADES.map((t) => <option key={t}>{t}</option>)}</select></label>
    <label className="fld"><span>المورد</span><select name="vendor_id" defaultValue={p?.vendor_id ?? ''}><option value="">—</option>{vs.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
    <label className="fld"><span>كل (شهر)</span><input name="every_months" type="number" min={1} max={60} defaultValue={p?.every_months ?? 3} /></label>
    <label className="fld"><span>الموعد القادم</span><input name="next_due" type="date" required defaultValue={p?.next_due ? String(p.next_due) : asOf} /></label>
    <label className="fld"><span>التكلفة التقديرية</span><input name="est_cost" dir="ltr" defaultValue={p?.est_cost ?? ''} /></label>
    {p && <label className="fld"><span>الحالة</span><select name="active" defaultValue={p.active ? '1' : '0'}><option value="1">مفعّلة</option><option value="0">موقوفة</option></select></label>}</div>
    <div className="fa"><button className="btn" type="submit">حفظ</button></div></form>;
  return (
    <Page title="الصيانة الدورية" sub="خطط متكررة (مصاعد، خزانات، مكافحة حشرات، تكييف…) تُنشئ طلب صيانة تلقائياً قبل موعدها بأسبوع." org={org} asOf={asOf} back={['/maintenance', 'الصيانة']}
      actions={canEdit ? <form action={runPmNow} className="inline"><button className="btn ghost" type="submit">إنشاء الطلبات المستحقة الآن</button></form> : undefined}>
      <div className="card"><div className="tbl"><table><thead><tr><th>العمل</th><th>العقار</th><th>المورد</th><th>التكرار</th><th>الموعد القادم</th><th className="n">التقديرية</th><th /></tr></thead><tbody>
        {plans.map((p) => { const d = daysBetween(asOf, String(p.next_due)); return <tr key={p.id}><td><b>{p.title}</b>{p.trade && <div className="cell-sub">{p.trade}</div>}{!p.active && <Tag tone="mute">موقوفة</Tag>}</td>
          <td>{a.P.get(p.property_id)?.short}{p.unit_id && ` — ${a.U.get(p.unit_id)?.code}`}</td><td>{V.get(p.vendor_id) ?? '—'}</td><td>كل {p.every_months} أشهر</td>
          <td>{date(String(p.next_due))} <Tag tone={d < 0 ? 'bad' : d <= 7 ? 'warn' : 'mute'}>{d < 0 ? 'متأخر' : `بعد ${d} يوماً`}</Tag></td><td className="n">{money(p.est_cost)}</td>
          <td>{canEdit && <details className="row-edit"><summary className="btn sm ghost">تعديل</summary><div className="row-edit-in"><Form p={p} /></div></details>}</td></tr>; })}
        {!plans.length && <tr><td colSpan={7} className="muted">لا توجد خطط. أضف خطة لكل عمل متكرر.</td></tr>}</tbody></table></div></div>
      {canEdit && <details className="box noprint" open={!plans.length}><summary>خطة صيانة دورية جديدة</summary><div className="in"><Form /></div></details>}
      <p className="muted"><Link href="/vendors">الموردون ←</Link></p>
    </Page>
  );
}
