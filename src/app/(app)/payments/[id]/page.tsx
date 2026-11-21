import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { voidPayment } from '@/lib/actions';
import { money, date, hijri } from '@/lib/fmt';
import { reviewPayment } from '@/lib/actions6';
import { tafqit } from '@/lib/tafqit';
import Attachments from '@/components/Attachments';
import { ATT_CATS } from '@/lib/fmt';
import { Tag } from '@/components/ui';

export default async function Receipt({ params }: { params: { id: string } }) {
  const { db, a, org, asOf, isAdmin, canEdit, user } = await ctx();
  const p = db.payments.find((x) => x.id === params.id); if (!p) notFound();
  const t = a.T.get(p.tenant_id)!, c = p.contract_id ? a.C.get(p.contract_id) : undefined;
  const al = db.allocations.filter((x) => x.payment_id === p.id).map((x) => ({ ...x, r: a.rows.find((r) => r.id === x.installment_id) }));
  const allAl = p.voided ? [] : al;
  return (
    <Page title={`سند قبض ${p.receipt_no}`} org={org} asOf={asOf} print back={['/payments', 'المقبوضات']}>
      <div className="receipt">
        <div className="rh"><img src="/api/logo" alt={org} /><div><h2>سند قبض</h2><div className="muted">{org}</div></div><div style={{ textAlign: 'left' }}><div className="no">{p.receipt_no}</div><div>{date(p.paid_on)}<br />{hijri(p.paid_on)}</div></div></div>
        {p.voided && <p><span className="void">ملغى</span> <span className="muted">السبب: {p.void_reason}</span></p>}
        <p>استلمنا من: <b>{t.name}</b></p>
        <p>مبلغاً وقدره: <span className="amt">{money(p.amount)} ريال</span></p>
        <p className="muted">{tafqit(p.amount)}</p>
        <p>وذلك عن: إيجار {c ? <b>{a.P.get(c.property_id)?.name} — {a.U.get(c.unit_id)?.code}</b> : '—'}{allAl.length > 0 && <> عن الأقساط: {allAl.map((x) => `رقم ${x.r?.no} (${date(x.r?.due_date)})`).join('، ')}</>}</p>
        <p>طريقة السداد: <b>{p.method}</b>{p.bank_ref && <> — المرجع: <b dir="ltr">{p.bank_ref}</b></>}</p>
        {p.note && <p>ملاحظات: {p.note}</p>}
        {allAl.length > 0 && <div className="tbl"><table><thead><tr><th className="n">القسط</th><th>الفترة</th><th className="n">المخصص</th><th className="n">المتبقي على القسط</th></tr></thead>
          <tbody>{allAl.map((x) => <tr key={x.installment_id}><td className="n">{x.r?.no}</td><td className="n">{x.r?.period_from ? `${date(x.r.period_from)} – ${date(x.r.period_to)}` : date(x.r?.due_date)}</td><td className="n">{money(x.amount)}</td><td className="n">{money(x.r?.balance ?? 0)}</td></tr>)}</tbody></table></div>}
        <div className="sig" style={{ display: 'grid' }}><div>المستلم: {p.created_by}</div><div>المحاسب</div><div>الختم</div></div>
      </div>
      {(() => { const bl = p.bank_line_id ? db.bankLines.find((l) => l.id === p.bank_line_id) : undefined; const hasAtt = db.attachments.some((x) => x.entity === 'payment' && x.entity_id === p.id);
        return <p className="noprint" style={{ textAlign: 'center' }}>حالة التوثيق: {bl ? <Tag tone="ok">مطابق مع البنك — إيداع {date(bl.date)}</Tag> : hasAtt || p.method === 'نقدي' ? <Tag tone="est">موثق، بانتظار المطابقة مع البنك</Tag> : <Tag tone="warn">بلا مرفق ولا مطابقة</Tag>}</p>; })()}
      <Attachments entity="payment" id={p.id} items={db.attachments} back={`/payments/${p.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={ATT_CATS.payment} title="إثبات السداد" />
      <p className="noprint muted" style={{ textAlign: 'center' }}><Link href={`/tenants/${t.id}`}>كشف حساب المستأجر</Link>{c && <> • <Link href={`/contracts/${c.id}`}>العقد</Link></>}</p>
      {db.meta.features.maker_checker && !p.voided && <div className="card noprint"><h2>المراجعة من شخص ثانٍ</h2>
        {p.reviewed_by ? <p>روجع بواسطة <b>{p.reviewed_by}</b>{p.reviewed_at ? ` في ${new Date(String(p.reviewed_at)).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh' })}` : ''}</p>
          : p.created_by === user.full_name ? <p className="note warn">سجّلت هذا السند بنفسك؛ يراجعه مستخدم آخر.</p>
          : canEdit ? <form action={reviewPayment}><input type="hidden" name="id" value={p.id} /><button className="btn" type="submit">تأكيد مراجعة السند ومطابقته للمستند</button></form> : <p className="muted">لم يُراجع بعد.</p>}</div>}
      {isAdmin && !p.voided && <details className="box"><summary>إلغاء السند</summary><div className="in">
        <p className="note warn">الإلغاء لا يحذف السند؛ يبقى برقمه مع علامة «ملغى» وتعود الأقساط المخصصة إلى رصيدها.</p>
        <Form action={voidPayment} submit="إلغاء السند" danger><Hidden n="id" v={p.id} /><F label="سبب الإلغاء" name="reason" req wide /></Form></div></details>}
    </Page>
  );
}
