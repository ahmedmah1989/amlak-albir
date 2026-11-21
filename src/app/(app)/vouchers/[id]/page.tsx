import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import { Hidden } from '@/components/form';
import { approveVoucher, voidVoucher } from '@/lib/actions6';
import { money, date, hijri, VOUCHER_KINDS, VOUCHER_STATUS } from '@/lib/fmt';
import { tafqit } from '@/lib/tafqit';

export default async function VoucherPage({ params }: { params: { id: string } }) {
  const { db, a, org, asOf, isAdmin, user } = await ctx();
  const v = db.vouchers.find((x) => x.id === params.id); if (!v) notFound();
  const c = v.contract_id ? a.C.get(v.contract_id) : undefined;
  const mc = db.meta.features.maker_checker, self = v.created_by === user.full_name;
  return (
    <Page title={`سند صرف ${v.voucher_no}`} sub={VOUCHER_KINDS[v.kind]} org={org} asOf={asOf} print sig back={['/vouchers', 'سندات الصرف']}>
      {v.status === 'voided' && <p className="note bad">هذا السند ملغى — السبب: {v.void_reason}</p>}
      <div className="card voucher-doc">
        <div className="facts">
          <div><span>رقم السند</span><b>{v.voucher_no}</b></div><div><span>التاريخ</span><b>{date(v.date)} — {hijri(v.date)}</b></div>
          <div><span>النوع</span><b>{VOUCHER_KINDS[v.kind]}</b></div><div><span>الحالة</span><b><Tag tone={VOUCHER_STATUS[v.status][1]}>{VOUCHER_STATUS[v.status][0]}</Tag></b></div>
          <div><span>صُرف إلى</span><b>{v.payee}</b></div><div><span>المبلغ</span><b>{money(v.amount)} ريال</b></div>
          <div><span>طريقة الصرف</span><b>{v.method}{v.bank_ref ? ` — ${v.bank_ref}` : ''}</b></div>
          {c && <div><span>العقد</span><b><Link href={`/contracts/${c.id}`}>{a.P.get(c.property_id)?.short} — {a.U.get(c.unit_id)?.code}</Link></b></div>}
          <div><span>أنشأه</span><b>{v.created_by ?? '—'}</b></div><div><span>اعتمده</span><b>{v.approved_by ?? '—'}</b></div>
        </div>
        <p className="tafqit">{tafqit(v.amount)}</p>
        {v.note && <p>البيان: {v.note}</p>}
        <div className="sig"><div>المستلم: {v.payee}</div><div>المحاسب</div><div>المعتمد</div></div>
      </div>
      {isAdmin && v.status === 'pending' && <div className="card noprint"><h2>الاعتماد</h2>
        {mc && self ? <p className="note warn">الرقابة المزدوجة مفعّلة: أنشأت هذا السند بنفسك، فيلزم اعتماده من مستخدم آخر.</p> :
          <form action={approveVoucher}><Hidden n="id" v={v.id} /><button className="btn" type="submit">اعتماد وصرف السند</button></form>}</div>}
      {isAdmin && v.status !== 'voided' && <details className="box noprint"><summary>إلغاء السند</summary><div className="in">
        <form action={voidVoucher} className="frm"><Hidden n="id" v={v.id} /><label className="fld wide"><span>سبب الإلغاء</span><input name="reason" required /></label><button className="btn danger" type="submit">إلغاء السند</button></form></div></details>}
    </Page>
  );
}
