import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { q } from '@/lib/db';
import { money, date } from '@/lib/fmt';
import { tafqit } from '@/lib/tafqit';
/** أمر عمل مطبوع للمورد */
export default async function WorkOrder({ params }: { params: { id: string } }) {
  const { db, a, org, asOf } = await ctx();
  const m: any = db.maintenance.find((x) => x.id === params.id); if (!m) notFound();
  const [v] = m.vendor_id ? await q('select * from vendors where id=$1', [m.vendor_id]) : [];
  const [x] = await q('select wo_no, wo_issued_on from maintenance where id=$1', [m.id]);
  const p = a.P.get(m.property_id)!, u = m.unit_id ? a.U.get(m.unit_id) : null;
  return (
    <Page title={`أمر عمل ${x?.wo_no ?? ''}`} sub={`${p.name}${u ? ' — ' + u.code : ''}`} org={org} asOf={asOf} print sig back={[`/maintenance/${m.id}`, m.title]}>
      {!x?.wo_no ? <p className="note warn">لم يصدر أمر عمل لهذا الطلب بعد. أصدره من صفحة الطلب.</p> : <div className="card wo">
        <div className="facts"><div><span>رقم الأمر</span><b dir="ltr">{x.wo_no}</b></div><div><span>تاريخ الإصدار</span><b>{date(x.wo_issued_on ? String(x.wo_issued_on) : null)}</b></div><div><span>الأولوية</span><b>{m.priority}</b></div><div><span>رقم الطلب</span><b dir="ltr">{m.id}</b></div></div>
        <div className="g2"><div className="inv-party"><h3>إلى المورد</h3><p><b>{v?.name ?? m.vendor ?? '—'}</b></p>{v?.phone && <p dir="ltr">{v.phone}</p>}{v?.cr && <p>سجل تجاري: {v.cr}</p>}</div>
          <div className="inv-party"><h3>موقع العمل</h3><p><b>{p.name}</b></p><p>{u ? `الوحدة ${u.code}` : 'العقار كاملاً'}</p>{p.location && <p>{p.location}</p>}</div></div>
        <h3>المطلوب</h3><p><b>{m.title}</b></p>{m.details && <p>{m.details}</p>}
        <div className="facts"><div><span>التكلفة المعتمدة (تقديرية)</span><b>{money(m.est_cost)} ريال</b></div><div><span>التكلفة على</span><b>{m.charge_to}</b></div></div>
        {m.est_cost ? <p className="tafqit">{tafqit(m.est_cost)}</p> : null}
        <p className="muted">يُرفق مع الفاتورة صور قبل وبعد التنفيذ، ولا يُصرف إلا بعد استلام العمل من الجمعية. أي أعمال إضافية تحتاج موافقة كتابية مسبقة.</p>
        <div className="sig"><div>توقيع المورد بالاستلام</div><div>استلام العمل</div><div>اعتماد الصرف</div></div></div>}
    </Page>
  );
}
