import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Empty } from '@/components/ui';
import { Ic } from '@/components/icons';
import { Hidden } from '@/components/form';
import { decideAdjustment, decideException } from '@/lib/actions2';
import { RULES } from '@/lib/audit';
import { money, date, VOUCHER_KINDS } from '@/lib/fmt';
import { reviewPayment, reviewPayments, closePeriod } from '@/lib/actions6';
import { addDays } from '@/lib/calc';

export default async function Approvals() {
  const { db, a, org, asOf, isAdmin, user, canEdit } = await ctx();
  const mc = db.meta.features.maker_checker;
  const unrev = mc ? a.payments.filter((p) => !p.reviewed_by) : [];
  const mine = unrev.filter((p) => p.created_by !== user.full_name);
  const vp = db.vouchers.filter((v) => v.status === 'pending');
  const lastMonthEnd = addDays(asOf.slice(0, 7) + '-01', -1);
  const adj = db.adjustments.filter((x) => x.status === 'pending'), exc = db.exceptions.filter((x) => x.status === 'pending');
  const inp = { border: '1px solid var(--line)', borderRadius: 8, padding: '2px 8px', fontFamily: 'inherit', width: '8rem' };
  return (
    <Page title="الاعتمادات" sub="لا يُطبَّق خصم ولا استثناء قبل اعتماده، ولا يعتمد الطلب من طلبه" org={org} asOf={asOf} print>
      <div className="g2">
        <div className="card"><h2><Ic n="shield" />إقفال الفترة المحاسبية</h2>
          <p>الفترة مقفلة حتى: <b>{db.meta.locked_until ? date(db.meta.locked_until) : 'غير مقفلة'}</b>. لا يمكن تسجيل أو تعديل أو إلغاء أي سند أو قسط أو تقييم بتاريخ داخل الفترة المقفلة.</p>
          {isAdmin && <form action={closePeriod} className="rowact noprint"><input type="date" name="until" defaultValue={lastMonthEnd} max={addDays(asOf, -1)} required className="inp" />
            <label className="chk"><input type="checkbox" name="confirm_reopen" value="1" /> أؤكد إعادة فتح جزء مقفل (إن كان التاريخ أقدم)</label>
            <button className="btn sm" type="submit">إقفال حتى هذا التاريخ</button></form>}
          {mc && unrev.some((p) => p.paid_on <= lastMonthEnd) && <p className="note warn">يوجد سندات غير مراجعة قبل {date(lastMonthEnd)}؛ لا يُسمح بالإقفال قبل مراجعتها.</p>}</div>
        <div className="card"><h2><Ic n="coin" />سندات الصرف بانتظار الاعتماد ({vp.length})</h2>{!vp.length ? <Empty>لا توجد.</Empty> :
          <ul className="list">{vp.map((v) => <li key={v.id}><Link href={`/vouchers/${v.id}`}>{v.voucher_no} — {VOUCHER_KINDS[v.kind]} — {v.payee}</Link><b className="n">{money(v.amount)}</b></li>)}</ul>}</div>
      </div>
      {mc && <div className="card"><h2><Ic n="coin" />سندات قبض تحتاج مراجعة من شخص ثانٍ ({unrev.length})</h2>
        {!unrev.length ? <Empty>كل السندات مراجعة.</Empty> : <>
          <div className="tbl"><table><thead><tr><th>السند</th><th className="n">التاريخ</th><th>المستأجر</th><th className="n">المبلغ</th><th>الطريقة</th><th>سجّله</th><th className="noprint"></th></tr></thead>
            <tbody>{unrev.map((p) => <tr key={p.id}><td><Link href={`/payments/${p.id}`}>{p.receipt_no}</Link></td><td className="n">{date(p.paid_on)}</td><td>{a.T.get(p.tenant_id)?.name}</td><td className="n">{money(p.amount)}</td><td>{p.method}</td><td>{p.created_by ?? '—'}</td>
              <td className="noprint">{canEdit && p.created_by !== user.full_name ? <form action={reviewPayment}><Hidden n="id" v={p.id} /><Hidden n="back" v="/approvals" /><button className="btn sm" type="submit">مراجعة</button></form> : <span className="muted">يراجعه مستخدم آخر</span>}</td></tr>)}</tbody></table></div>
          {canEdit && mine.length > 1 && <form action={reviewPayments} className="noprint" style={{ marginTop: 8 }}><Hidden n="ids" v={mine.map((p) => p.id).join(',')} /><button className="btn sm ghost" type="submit">مراجعة كل السندات التي يمكنني مراجعتها ({mine.length})</button></form>}
        </>}</div>}
      <div className="card"><h2><Ic n="coin" />طلبات الخصم والإعفاء ({adj.length})</h2>{!adj.length ? <Empty>لا طلبات.</Empty> : <div className="tbl"><table>
        <thead><tr><th>المستأجر</th><th>القسط</th><th>النوع</th><th className="n">المبلغ</th><th>طلبه</th><th>ملاحظة</th>{isAdmin && <th className="noprint">القرار</th>}</tr></thead>
        <tbody>{adj.map((x) => <tr key={x.id}><td>{x.tenant_id ? a.T.get(x.tenant_id)?.name : '—'}</td><td>{x.installment_id ? <Link href={`/installments/${x.installment_id}`}>قسط {x.installment_no}</Link> : x.installment_no}</td><td>{x.type}</td><td className="n">{money(x.amount)}</td><td>{x.requested_by}<div className="muted">{date(x.date)}</div></td><td className="muted">{x.note}</td>
          {isAdmin && <td className="noprint"><form action={decideAdjustment} className="rowact"><Hidden n="id" v={x.id} /><input name="decision_no" placeholder="رقم القرار" defaultValue={x.decision_no ?? ''} style={inp} /><button className="btn sm" name="decision" value="approve">اعتماد</button><button className="btn sm danger" name="decision" value="reject">رفض</button></form></td>}</tr>)}</tbody></table></div>}</div>
      <div className="card"><h2><Ic n="shield" />طلبات الاستثناء ({exc.length})</h2>{!exc.length ? <Empty>لا طلبات.</Empty> : <div className="tbl"><table>
        <thead><tr><th>القاعدة</th><th>النطاق</th><th>المبرر</th><th>طلبه</th><th className="n">ينتهي</th>{isAdmin && <th className="noprint">القرار</th>}</tr></thead>
        <tbody>{exc.map((x) => <tr key={x.id}><td>{RULES.find((r) => r.id === x.rule)?.title ?? x.rule}</td><td>{x.scope === 'record' ? 'سجل محدد' : x.scope === 'before' ? `قبل ${date(x.before_date)}` : `عقار ${a.P.get(x.property_id ?? '')?.short ?? ''}`}</td><td>{x.reason}</td><td>{x.requested_by}</td><td className="n">{date(x.expires_on)}</td>
          {isAdmin && <td className="noprint"><form action={decideException} className="rowact"><Hidden n="id" v={x.id} /><button className="btn sm" name="decision" value="approve">اعتماد</button><button className="btn sm danger" name="decision" value="reject">رفض</button></form></td>}</tr>)}</tbody></table></div>}</div>
      <div className="card"><h2>آخر القرارات</h2><ul className="list">{db.adjustments.filter((x) => x.status !== 'pending' && x.requested_by).slice(-10).reverse().map((x) => <li key={x.id}>{x.type} — {x.tenant_id ? a.T.get(x.tenant_id)?.name : ''}<Tag tone={x.status === 'approved' ? 'ok' : 'mute'}>{x.status === 'approved' ? 'معتمد' : 'مرفوض'}</Tag><span className="muted">{x.approved_by}</span><b className="n">{money(x.amount)}</b></li>)}</ul></div>
    </Page>
  );
}
