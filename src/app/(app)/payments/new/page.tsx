import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, IStat, Empty } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { recordPayment } from '@/lib/actions';
import PaymentFields from '@/components/PaymentFields';
import { money, date } from '@/lib/fmt';
import { dfState } from '@/lib/df';

export default async function NewPayment({ searchParams }: { searchParams: { tenant?: string; contract?: string; inst?: string; q?: string } }) {
  const { db, a, org, asOf } = await ctx('accountant');
  const tid = searchParams.tenant;
  if (!tid) {
    const query = searchParams.q?.trim() ?? '';
    const ts = a.tenantStats.filter((t) => !query || [t.t.name, ...t.contracts.flatMap((c) => [c.contract_no, a.U.get(c.unit_id)?.code, a.P.get(c.property_id)?.name])].some((v) => v?.includes(query)))
      .sort((x, y) => y.arrears - x.arrears || x.t.name.localeCompare(y.t.name, 'ar'));
    return (<Page title="تسجيل مقبوضات" sub="اختر المستأجر" org={org} asOf={asOf} back={['/payments', 'المقبوضات']}>
      <form method="get" className="frm card"><label className="fld"><span>بحث بالمستأجر أو العقار أو الوحدة أو رقم العقد</span><input type="search" name="q" defaultValue={query} /></label><div className="fa"><button className="btn">بحث</button>{query && <Link href="/payments/new" className="btn ghost">عرض الكل</Link>}</div></form>
      <p className="muted">يمكن تسجيل سداد مبكر للأقساط القادمة حتى لو لم توجد متأخرات.</p>
      <div className="card">{!ts.length ? <Empty>لا يوجد مستأجر يطابق البحث.</Empty> : <ul className="list">{ts.map((t) => <li key={t.t.id}><Link href={`?tenant=${encodeURIComponent(t.t.id)}`}><b>{t.t.name}</b></Link>
        <span className="muted">{t.activeContracts.map((c) => a.U.get(c.unit_id)?.code).join('، ') || 'لا توجد عقود سارية'}</span><span className="n">متأخر: <b>{money(t.arrears)}</b></span></li>)}</ul>}</div></Page>);
  }
  const t = a.T.get(tid); if (!t) notFound();
  const cs = db.contracts.filter((c) => c.tenant_id === tid && (c.status === 'active' || a.rows.some((r) => r.contract_id === c.id && r.balance > 0)));
  const cid = searchParams.contract ?? (cs.length === 1 ? cs[0].id : undefined);
  if (cid && !cs.some((c) => c.id === cid)) notFound();
  const open = cid ? a.rows.filter((r) => r.contract_id === cid && r.balance > 0).sort((x, y) => x.due_date.localeCompare(y.due_date) || x.no - y.no || x.id.localeCompare(y.id)) : [];
  if (searchParams.inst && !open.some((r) => r.id === searchParams.inst)) notFound();
  return (
    <Page title={`تسجيل مقبوضات: ${t.name}`} sub={searchParams.inst ? 'يُسدَّد القسط المختار أولاً ثم الأقدم استحقاقاً' : 'يُوزَّع المبلغ تلقائياً على أقدم الأقساط غير المسددة'} org={org} asOf={asOf} back={[`/tenants/${tid}`, t.name]}>
      {cs.length > 1 && <div className="filters">{cs.map((c) => <Link key={c.id} href={`?tenant=${tid}&contract=${c.id}`} className={cid === c.id ? 'on' : ''}>{a.P.get(c.property_id)?.short} — {a.U.get(c.unit_id)?.code}</Link>)}</div>}
      {cs.length === 0 && <Empty>لا توجد عقود متاحة للتحصيل لهذا المستأجر.</Empty>}
      {!cid && cs.length > 1 && <p className="note">اختر العقد لعرض أقساطه وتسجيل المقبوضات عليه.</p>}
      {cid && !open.length && <Empty>لا توجد أقساط غير مسددة على هذا العقد. لا يمكن إصدار سند دون قسط يُخصَّص له المبلغ.</Empty>}
      {cid && open.length > 0 && <>
        <div className="card"><h2>الأقساط غير المسددة على العقد</h2><div className="tbl"><table>
          <thead><tr><th className="n">#</th><th className="n">الاستحقاق</th><th className="n">القيمة</th><th className="n">المتبقي</th><th>الحالة</th></tr></thead>
          <tbody>{open.map((r) => <tr key={r.id} className={r.id === searchParams.inst ? 'hl' : ''}><td className="n">{r.no}</td><td className="n">{date(r.due_date)}</td><td className="n">{money(r.amount)}</td><td className="n">{money(r.balance)}</td><td><IStat s={r.status} /></td></tr>)}
            <tr className="tot"><td></td><td>الإجمالي</td><td></td><td className="n">{money(open.reduce((x, r) => x + r.balance, 0))}</td><td></td></tr></tbody></table></div></div>
        <div className="card"><h2>بيانات السند</h2>
          <Form action={recordPayment} submit="حفظ وإصدار سند القبض" cancel={`/tenants/${tid}`}>
            <Hidden n="tenant_id" v={tid} /><Hidden n="contract_id" v={cid} />{searchParams.inst && <Hidden n="installment_id" v={searchParams.inst} />}
            <F label="تاريخ الاستلام" name="paid_on" type="date" req def={asOf} max={asOf} />
            <PaymentFields rows={open.map(({ id, no, due_date, balance }) => ({ id, no, due_date, balance }))} first={searchParams.inst} df={dfState().v} />
            <F label="ملاحظات" name="note" wide />
            <label className="fld wide"><span>📎 إرفاق إشعار الحوالة أو صورة الشيك (PDF أو صورة)</span><input type="file" name="files" accept="application/pdf,image/*" multiple /><small>يمكن تصوير الإشعار بكاميرا الجوال مباشرة. المرفق يجعل السند «موثقاً» إلى أن يُطابق مع البنك.</small></label>
          </Form></div>
      </>}
    </Page>
  );
}
