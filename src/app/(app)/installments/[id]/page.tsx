import Link from 'next/link';
import { issueInvoice } from '@/lib/actions7';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, IStat, Btn, Empty } from '@/components/ui';
import { Form, F, Hidden } from '@/components/form';
import { updateInstallment, confirmInstallment, addAdjustment, deleteInstallment } from '@/lib/actions';
import { money, date, ADJ_TYPES, opts } from '@/lib/fmt';
import { Prog, InstStat } from '@/components/InstallmentBoard';
import ChangeLog from '@/components/ChangeLog';
import { issueLateFee } from '@/lib/actions4';
import { parseFeatureCfg } from '@/lib/features';
import { lateFeeFor } from '@/lib/late-fee';

export default async function InstallmentPage({ params }: { params: { id: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const r = a.rows.find((x) => x.id === params.id); if (!r) notFound();
  const allocs = db.allocations.filter((x) => x.installment_id === r.id).map((x) => ({ ...x, p: db.payments.find((p) => p.id === x.payment_id)! }));
  const adj = db.adjustments.filter((x) => x.installment_id === r.id);
  const hist = [
    ...(r.opening_paid > 0 ? [{ k: 'o', date: r.due_date, ref: 'رصيد افتتاحي', href: '', desc: r.src_dates ? `تواريخ الاستلام في الملف: ${r.src_dates}` : 'سداد مسجل قبل بدء البرنامج', amt: r.opening_paid }] : []),
    ...allocs.map((x) => ({ k: x.payment_id, date: x.p.paid_on, ref: x.p.receipt_no, href: `/payments/${x.payment_id}`, desc: `${x.p.method}${x.p.bank_ref ? ' • ' + x.p.bank_ref : ''}`, amt: x.amount })),
    ...adj.filter((x) => x.status === 'approved').map((x) => ({ k: x.id, date: x.date ?? r.due_date, ref: x.type, href: '', desc: x.decision_no ? `قرار ${x.decision_no}` : 'خصم معتمد', amt: x.amount })),
  ].sort((p, q) => p.date.localeCompare(q.date));
  let run = r.amount;
  return (
    <Page title={`القسط ${r.no} — ${r.propertyShort} / ${r.unitCode}`} sub={`المستأجر: ${r.tenantName}`} org={org} asOf={asOf} print back={[`/contracts/${r.contract_id}`, 'العقد']}
      actions={<>{canEdit && r.balance > 0 && <Btn href={`/payments/new?tenant=${r.contract.tenant_id}&contract=${r.contract_id}&inst=${r.id}`}>💵 تحصيل دفعة على القسط</Btn>}<Btn href={`/installments/${r.id}/notice`} kind="ghost">🧾 إشعار مطالبة</Btn></>}>
      {db.meta.features.e_invoice && (() => { const inv = db.invoices.filter((x) => x.installment_id === r.id); const live = inv.find((x) => x.kind === 'invoice' && x.status === 'issued');
        return <div className="note noprint inv-note">{inv.length ? <>الفواتير: {inv.map((x) => <Link key={x.id} href={`/invoices/${x.id}`} className="tag t-info">{x.invoice_no}{x.kind === 'credit' ? ' (دائن)' : ''}</Link>)}</> : 'لم تصدر فاتورة ضريبية لهذا القسط.'}
          {!live && canEdit && <form action={issueInvoice} className="inline"><input type="hidden" name="installment_id" value={r.id} /> <button className="btn sm" type="submit">إصدار فاتورة ضريبية</button></form>}</div>; })()}
      <div className="card"><div className="complete" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}><span><b>{money(r.amount - r.balance)}</b> مسدَّد من <b>{money(r.amount)}</b> — {Math.round(r.paidPct)}%</span><span style={{ flex: 1, minWidth: '8rem' }}><Prog pct={r.paidPct} /></span><InstStat r={r} />{r.balance > 0 && <span className="bad"><b>متبقٍ {money(r.balance)}</b></span>}</div></div>
      <div className="card"><div className="facts">
        <div><span>الفترة</span><b>{r.period_from ? `${date(r.period_from)} – ${date(r.period_to)}` : '—'}</b></div><div><span>الاستحقاق</span><b>{date(r.due_date)}</b></div>
        <div><span>القيمة</span><b>{money(r.amount)}</b></div><div><span>مسدَّد (رصيد افتتاحي)</span><b>{money(r.opening_paid)}</b></div>
        <div><span>مسدَّد بسندات</span><b>{money(r.allocated)}</b></div><div><span>خصومات</span><b>{money(r.adjusted)}</b></div>
        <div><span>المتبقي</span><b>{money(r.balance)}</b></div><div><span>الحالة</span><b><InstStat r={r} /></b></div>
        {r.daysLate > 0 && <div><span>أيام التأخير</span><b>{r.daysLate}</b></div>}
        {r.src_receipt && <div><span>السند في الملف</span><b>{r.src_receipt}</b></div>}{r.src_dates && <div><span>تواريخ الاستلام في الملف</span><b>{r.src_dates}</b></div>}{r.rating && <div><span>تقييم المستأجر</span><b>{r.rating}</b></div>}
      </div>{r.note && <p className="note">{r.note}</p>}</div>
      <div className="card"><h2>سجل تحصيل القسط ({hist.length} {hist.length === 1 ? 'حركة' : 'حركات'})</h2>
        {hist.length === 0 ? <Empty>لم يُحصَّل شيء من هذا القسط بعد.</Empty> : <div className="tbl"><table className="inst-hist"><thead><tr><th className="n">التاريخ</th><th>المرجع</th><th>البيان</th><th className="n">المبلغ</th><th className="n">المتبقي بعدها</th></tr></thead>
          <tbody>{hist.map((h) => { run = Math.round((run - h.amt) * 100) / 100; return <tr key={h.k}><td className="n">{date(h.date)}</td><td>{h.href ? <Link href={h.href}>{h.ref}</Link> : h.ref}</td><td className="muted">{h.desc}</td><td className="n">{money(h.amt)}</td><td className="n run">{money(Math.max(0, run))}</td></tr>; })}</tbody></table></div>}
        {adj.length > 0 && <><h2>الخصومات</h2><ul className="list">{adj.map((x) => <li key={x.id}>{x.type} <span className={`tag t-${x.status === 'approved' ? 'ok' : x.status === 'pending' ? 'warn' : 'mute'}`}>{{ approved: 'معتمد', pending: 'بانتظار الاعتماد', rejected: 'مرفوض' }[x.status]}</span><span className="muted">{x.approved_by} {x.decision_no && `— قرار ${x.decision_no}`}</span><b className="n">{money(x.amount)}</b></li>)}</ul></>}</div>
      {canEdit && <>
        {r.status === 'unconfirmed' && <div className="card"><h2>المطابقة مع البنك</h2>
          <p className="note">بعد مراجعة كشف الحساب البنكي: إن وُجد الإيداع فسجّل بياناته، وإن لم يوجد يتحول القسط إلى المتأخرات.</p>
          <Form action={confirmInstallment} submit="✓ وُجد في البنك — تأكيد السداد"><Hidden n="id" v={r.id} /><Hidden n="kind" v="paid" />
            <F label="تاريخ الإيداع" name="bank_date" type="date" /><F label="مرجع الحوالة" name="bank_ref" /><F label="رقم السند" name="receipt" /></Form>
          <form action={confirmInstallment} style={{ marginTop: 10 }}><Hidden n="id" v={r.id} /><Hidden n="kind" v="unpaid" /><button className="btn danger" type="submit">✗ لم يوجد — تحويله إلى المتأخرات</button></form></div>}
        {r.balance > 0 && <details className="box"><summary>طلب خصم أو إعفاء على القسط (يحتاج اعتماداً)</summary><div className="in">
          <Form action={addAdjustment} submit="إرسال للاعتماد"><Hidden n="installment_id" v={r.id} />
            <F label="النوع" name="type" req opts={opts(ADJ_TYPES)} /><F label="المبلغ" name="amount" type="number" req hint={`الحد الأقصى ${money(r.balance)}`} />
            <F label="الجهة المقترحة للاعتماد" name="approved_by" /><F label="رقم القرار" name="decision_no" /><F label="ملاحظة" name="note" wide /></Form></div></details>}
        <details className="box"><summary>تعديل القسط</summary><div className="in">
          <Form action={updateInstallment}><Hidden n="id" v={r.id} /><F label="تاريخ الاستحقاق" name="due_date" type="date" req def={r.due_date} />
            <F label="القيمة" name="amount" type="number" req def={r.amount} /><F label="ملاحظة" name="note" def={r.note} wide /></Form>
          {isAdmin && <form action={deleteInstallment} style={{ marginTop: 10 }}><Hidden n="id" v={r.id} /><button className="btn sm danger" type="submit">حذف القسط</button></form>}</div></details>
      </>}
      {db.meta.features.late_fees && (() => { const cfg = parseFeatureCfg(db.meta.settings), fee = lateFeeFor(r, cfg);
        const issued = db.installments.filter((x) => x.contract_id === r.contract_id && x.kind === 'penalty' && x.note.includes(`على القسط ${r.no} `));
        return <div className="card"><h2>غرامة التأخير</h2>
          {r.kind && r.kind !== 'rent' ? <p className="muted">لا تُحسب غرامة على هذا النوع من الأقساط.</p> : fee.amount <= 0 ? <p className="muted">لا غرامة مستحقة (تبدأ بعد {cfg.late_fee_after} يوماً من التأخير).</p> :
            <p>المقترح: <b>{money(fee.amount)} ريال</b> ({cfg.late_fee_pct}% × {fee.months} شهر من الرصيد {money(r.balance)}، بحد أقصى {cfg.late_fee_cap_pct}%).</p>}
          {issued.length > 0 && <p className="note warn">صدرت غرامة سابقة على هذا القسط: {issued.map((x) => <Link key={x.id} href={`/installments/${x.id}`}> {money(x.amount)} </Link>)}</p>}
          {isAdmin && fee.amount > 0 && <Form action={issueLateFee} submit="إصدار الغرامة كقسط"><Hidden n="installment_id" v={r.id} />
            <F label="المبلغ" name="amount" type="number" def={fee.amount} req /><F label="رقم القرار" name="decision_no" req /></Form>}</div>; })()}
      <ChangeLog entity="installment" id={r.id} title="سجل تعديلات القسط" />
    </Page>
  );
}
