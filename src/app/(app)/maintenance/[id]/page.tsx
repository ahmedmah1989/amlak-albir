import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import Attachments from '@/components/Attachments';
import { setMaintStatus } from '@/lib/actions2';
import { money, date, ATT_CATS } from '@/lib/fmt';
import { daysBetween } from '@/lib/calc';
import MaintForm from '../MaintForm';
import Link from 'next/link';
import { q } from '@/lib/db';
import { issueWorkOrder } from '@/lib/ops-actions';
const ST: Record<string, [string, string]> = { open: ['warn', 'مفتوح'], progress: ['info', 'قيد التنفيذ'], done: ['ok', 'مغلق'], cancelled: ['mute', 'ملغى'] };
export default async function M({ params }: { params: { id: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const m = db.maintenance.find((x) => x.id === params.id); if (!m) notFound();
  const openSt = m.status === 'open' || m.status === 'progress';
  const vs = await q('select id, name, trade from vendors where active order by name'); const [wo] = await q('select wo_no, vendor_id from maintenance where id=$1', [m.id]);
  return (
    <Page title={m.title} sub={`${a.P.get(m.property_id)?.name}${m.unit_id ? ' — ' + a.U.get(m.unit_id)?.code : ''}`} org={org} asOf={asOf} print back={['/maintenance', 'الصيانة']}>
      <div className="card"><div className="facts">
        <div><span>الحالة</span><b><Tag tone={ST[m.status][0]}>{ST[m.status][1]}</Tag></b></div><div><span>الأولوية</span><b>{m.priority}</b></div>
        <div><span>تاريخ الطلب</span><b>{date(m.opened_on)}</b></div><div><span>العمر</span><b>{daysBetween(m.opened_on, m.closed_on ?? asOf)} يوماً</b></div>
        <div><span>المقاول</span><b>{m.vendor ?? '—'}</b></div><div><span>التكلفة على</span><b>{m.charge_to}</b></div>
        <div><span>التقديرية</span><b>{money(m.est_cost)}</b></div><div><span>الفعلية</span><b>{money(m.cost)}</b></div>{m.closed_on && <div><span>أُغلق</span><b>{date(m.closed_on)}</b></div>}
      </div>{m.details && <p className="note">{m.details}</p>}{m.expense_id && <p className="note">سُجّلت التكلفة في المصروفات تلقائياً.</p>}</div>
      <div className="card noprint"><h2>أمر العمل {wo?.wo_no && <small><Link href={`/maintenance/${m.id}/order`}>طباعة {wo.wo_no} ←</Link></small>}</h2>
        {canEdit && openSt ? <form action={issueWorkOrder} className="inl"><input type="hidden" name="id" value={m.id} />
          <select name="vendor_id" className="inp" defaultValue={wo?.vendor_id ?? ''} required><option value="" disabled>اختر المورد</option>{vs.map((v) => <option key={v.id} value={v.id}>{v.name}{v.trade ? ` — ${v.trade}` : ''}</option>)}</select>
          <input name="est_cost" className="inp" placeholder="التكلفة المعتمدة" dir="ltr" defaultValue={m.est_cost ?? ''} /><button className="btn" type="submit">{wo?.wo_no ? 'تحديث أمر العمل' : 'إصدار أمر عمل'}</button>
          {!vs.length && <Link href="/vendors">أضف الموردين أولاً</Link>}</form> : <p className="muted">{wo?.wo_no ? `صدر ${wo.wo_no}` : 'لا يوجد أمر عمل'}</p>}</div>
      <Attachments entity="maintenance" id={m.id} items={db.attachments} back={`/maintenance/${m.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.maintenance} title="الصور والفواتير" />
      {canEdit && openSt && <div className="g2">
        <div className="card"><h2>تحديث الحالة</h2><div className="rowact">
          {m.status === 'open' && <form action={setMaintStatus}><Hidden n="id" v={m.id} /><Hidden n="status" v="progress" /><button className="btn ghost">بدء التنفيذ</button></form>}
          <form action={setMaintStatus}><Hidden n="id" v={m.id} /><Hidden n="status" v="cancelled" /><button className="btn ghost">إلغاء الطلب</button></form></div></div>
        <div className="card"><h2>إغلاق الطلب</h2><Form action={setMaintStatus} submit="إغلاق وتسجيل التكلفة"><Hidden n="id" v={m.id} /><Hidden n="status" v="done" />
          <F label="التكلفة الفعلية" name="cost" type="number" req def={m.est_cost ?? 0} /><F label="تاريخ الإغلاق" name="closed_on" type="date" def={asOf} />
          <label className="fld wide"><span>الفاتورة وصور بعد التنفيذ</span><input type="file" name="files" multiple accept="application/pdf,image/*" /></label></Form></div></div>}
      {canEdit && openSt && <details className="box"><summary>تعديل بيانات الطلب</summary><div className="in"><MaintForm m={m} props={db.properties} units={db.units} today={asOf} /></div></details>}
    </Page>
  );
}
