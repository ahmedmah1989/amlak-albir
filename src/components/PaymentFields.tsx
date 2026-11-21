'use client';
import { useState } from 'react';
import { F } from './form';
import { dateAs, METHODS } from '@/lib/fmt';
import { planPayment, type PaymentBalance } from '@/lib/payment-plan';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function PaymentFields({ rows, first, df }: { rows: PaymentBalance[]; first?: string; df: string }) {
  const [amount, setAmount] = useState(first ? String(rows.find((r) => r.id === first)?.balance ?? '') : '');
  const [method, setMethod] = useState('تحويل بنكي');
  const value = Number(amount), plan = planPayment(rows, value, first);
  const sel = first ? rows.find((r) => r.id === first) : undefined;
  const r2 = (x: number) => String(Math.round(x * 100) / 100);
  const quick: [string, number][] = [
    ...(sel ? [['رصيد القسط المختار', sel.balance] as [string, number]] : []),
    ...(rows[0] && !sel ? [['أقدم قسط', rows[0].balance] as [string, number]] : []),
    ['كامل المستحق على العقد', plan.total],
  ];
  return <>
    <label className="fld"><span>المبلغ (ريال)<b className="rq"> *</b></span>
      <input name="amount" type="number" required min="0.01" max={plan.total} step="0.01" value={amount}
        onChange={(e) => setAmount(e.target.value)} aria-describedby="payment-plan" />
      <small>أدخل المبلغ المستلم فعلاً — يُقبل جزء من القسط ويبقى الباقي مفتوحاً لدفعة لاحقة.</small>
      <span className="quick-amt">{quick.map(([l, v]) => <button key={l} type="button" className="btn sm ghost" onClick={() => setAmount(r2(v))}>{l}: {money(v)}</button>)}</span>
    </label>
    <label className="fld"><span>طريقة السداد<b className="rq"> *</b></span>
      <select name="method" required value={method} onChange={(e) => setMethod(e.target.value)}>
        {METHODS.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <F label="رقم الحوالة / المرجع البنكي" name="bank_ref" dir="ltr" req={method !== 'نقدي'} hint={method === 'نقدي' ? 'اختياري للسداد النقدي' : 'إلزامي لغير النقدي'} />
    <section id="payment-plan" className="wide" aria-live="polite" aria-atomic="true">
      <h3>معاينة توزيع المبلغ</h3>
      <p className="muted">{first ? 'يُسدَّد القسط المختار أولاً ثم الأقدم استحقاقاً.' : 'يُوزَّع المبلغ على أقدم الأقساط غير المسددة، بما فيها الأقساط القادمة.'} تتم مراجعة الأرصدة مجدداً عند الحفظ.</p>
      {value > 0 && Number.isFinite(value) ? <>
        <div className="tbl"><table><thead><tr><th>القسط</th><th>الاستحقاق</th><th className="n">المخصص من السند</th><th className="n">المتبقي على القسط</th><th>النتيجة</th></tr></thead>
          <tbody>{plan.allocations.map((r) => <tr key={r.id}><td>{r.no}</td><td>{dateAs(r.due_date, df)}</td><td className="n">{money(r.amount)}</td><td className="n">{money(r.remaining)}</td><td>{r.remaining > 0 ? <span className="tag t-warn">سداد جزئي</span> : <span className="tag t-ok">يُقفل القسط</span>}</td></tr>)}</tbody></table></div>
        {plan.excess > 0 && <p className="note warn" role="alert">المبلغ يتجاوز رصيد العقد بمقدار {money(plan.excess)} ريال. الحد الأقصى {money(plan.total)} ريال؛ عدّل المبلغ قبل الحفظ.</p>}
      </> : <p className="muted">أدخل المبلغ لعرض توزيعه قبل إصدار السند.</p>}
    </section>
  </>;
}
