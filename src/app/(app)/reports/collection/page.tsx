import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Kpi } from '@/components/ui';
import ReportFrame, { Delta } from '@/components/ReportFrame';
import { money, date } from '@/lib/fmt';
import { parseReport, inRange, type SP } from '@/lib/report-params';

const GROUPS: [string, string][] = [['month', 'الشهر'], ['property', 'العقار'], ['method', 'طريقة السداد'], ['tenant', 'المستأجر']];
export default async function Collection({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'ytd', group: 'month', compare: 'none' });
  const propOk = (pid?: string | null) => !rp.props.length || (!!pid && rp.props.includes(pid));
  const pays = (from: string, to: string) => a.payments.filter((p) => inRange(p.paid_on, from, to) && propOk(a.payProp(p)) && (!rp.method || p.method === rp.method) && (!rp.tenant || p.tenant_id === rp.tenant));
  const dues = (from: string, to: string) => a.rows.filter((r) => inRange(r.due_date, from, to) && propOk(r.contract.property_id) && (!rp.tenant || r.contract.tenant_id === rp.tenant));
  const ps = pays(rp.from, rp.to), ds = dues(rp.from, rp.to);
  const sum = (xs: { amount: number }[]) => xs.reduce((n, x) => n + x.amount, 0);
  const total = sum(ps), dueAmt = sum(ds), dueOpen = ds.reduce((n, r) => n + r.balance, 0), rate = dueAmt ? ((dueAmt - dueOpen) / dueAmt) * 100 : null;
  const cps = rp.cFrom ? pays(rp.cFrom, rp.cTo!) : null, cds = rp.cFrom ? dues(rp.cFrom, rp.cTo!) : null;
  const cTotal = cps ? sum(cps) : null, cDue = cds ? sum(cds) : null, cOpen = cds ? cds.reduce((n, r) => n + r.balance, 0) : null;
  const cRate = cDue ? ((cDue - (cOpen ?? 0)) / cDue) * 100 : null;
  const keyOf = (p: (typeof ps)[number]) => rp.group === 'property' ? a.P.get(a.payProp(p) ?? '')?.name ?? 'غير محدد' : rp.group === 'method' ? p.method : rp.group === 'tenant' ? a.T.get(p.tenant_id)?.name ?? '—' : p.paid_on.slice(0, 7);
  const grouped = new Map<string, number>(); ps.forEach((p) => grouped.set(keyOf(p), (grouped.get(keyOf(p)) ?? 0) + p.amount));
  const cGrouped = new Map<string, number>(); cps?.forEach((p) => { const k = rp.group === 'month' ? p.paid_on.slice(0, 7) : keyOf(p); cGrouped.set(k, (cGrouped.get(k) ?? 0) + p.amount); });
  const entries = [...grouped.entries()].sort((x, y) => rp.group === 'month' ? x[0].localeCompare(y[0]) : y[1] - x[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  const methods = [...new Set(db.payments.map((p) => p.method))];
  const label = GROUPS.find((g) => g[0] === rp.group)?.[1] ?? 'الشهر';
  const shift = (k: string) => rp.compare === 'yoy' && rp.group === 'month' ? `${Number(k.slice(0, 4)) - 1}${k.slice(4)}` : k;
  return (
    <ReportFrame id="collection" title="تقرير التحصيل" sub="المحصّل بسندات القبض مقابل المستحق في الفترة" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id}
      params={['period', 'compare', 'property', 'tenant', 'method', 'group', 'detail', 'chart']} groups={GROUPS} methods={methods}
      xl={{ r: 'payments', q: `&from=${rp.from}&to=${rp.to}${rp.props[0] ? '&p=' + rp.props[0] : ''}` }}>
      <div className="kpis">
        <Kpi l="المحصّل بسندات" v={money(total)} unit="ريال" tone="info" s={`${ps.length} سنداً`} />
        <Kpi l="المستحق في الفترة" v={money(dueAmt)} unit="ريال" s={`${ds.length} قسطاً`} />
        <Kpi l="غير المسدد من مستحق الفترة" v={money(dueOpen)} unit="ريال" tone="bad" />
        <Kpi l="نسبة التحصيل" v={rate == null ? '—' : `${Math.round(rate)}%`} s="(المستحق − غير المسدد) ÷ المستحق" tone="warn" />
      </div>
      {rp.cFrom && <div className="card compare-card"><h2>المقارنة مع {rp.cLabel}</h2><div className="tbl"><table>
        <thead><tr><th>البند</th><th className="n">الفترة الحالية</th><th className="n">فترة المقارنة</th><th className="n">التغير</th></tr></thead>
        <tbody>
          <tr><td>المحصّل بسندات</td><td className="n">{money(total)}</td><td className="n">{money(cTotal)}</td><td className="n"><Delta cur={total} prev={cTotal} money={money} /></td></tr>
          <tr><td>المستحق</td><td className="n">{money(dueAmt)}</td><td className="n">{money(cDue)}</td><td className="n"><Delta cur={dueAmt} prev={cDue} money={money} /></td></tr>
          <tr><td>غير المسدد</td><td className="n">{money(dueOpen)}</td><td className="n">{money(cOpen)}</td><td className="n"><Delta cur={dueOpen} prev={cOpen} money={money} invert /></td></tr>
          <tr><td>نسبة التحصيل</td><td className="n">{rate == null ? '—' : `${rate.toFixed(1)}%`}</td><td className="n">{cRate == null ? '—' : `${cRate.toFixed(1)}%`}</td><td className="n">{rate != null && cRate != null ? `${(rate - cRate) > 0 ? '+' : ''}${(rate - cRate).toFixed(1)} نقطة` : '—'}</td></tr>
        </tbody></table></div></div>}
      {ps.length === 0 ? <p className="note">لا توجد سندات قبض في هذا النطاق. الأقساط المسددة قبل {date(db.meta.opening_date)} مسجلة كرصيد افتتاحي وتظهر في نسبة التحصيل فقط.</p> : <>
        <div className="card"><h2>المحصّل حسب {label}</h2>
          {rp.chart && <div className="rbars" aria-label="رسم المحصّل">{entries.map(([k, v]) => { const pv = cGrouped.get(shift(k)) ?? null; return <div key={k} className="rbar"><span>{k}</span><div className="tr"><div className="fl" style={{ width: `${(v / max) * 100}%` }} />{pv != null && <div className="pv" style={{ insetInlineStart: `${Math.min(100, (pv / max) * 100)}%` }} />}</div><span className="vv">{money(v)}</span></div>; })}
            {rp.cFrom && <small>العلامة الذهبية: نفس البند في فترة المقارنة</small>}</div>}
          <div className="tbl"><table><thead><tr><th>{label}</th><th className="n">المحصّل</th>{rp.cFrom && <><th className="n">فترة المقارنة</th><th className="n">التغير</th></>}<th className="n">النسبة من الإجمالي</th></tr></thead>
            <tbody>{entries.map(([k, v]) => { const pv = rp.cFrom ? cGrouped.get(shift(k)) ?? 0 : null; return <tr key={k}><td>{k}</td><td className="n">{money(v)}</td>{rp.cFrom && <><td className="n">{money(pv)}</td><td className="n"><Delta cur={v} prev={pv} money={money} /></td></>}<td className="n">{total ? ((v / total) * 100).toFixed(1) : 0}%</td></tr>; })}
              <tr className="tot"><td>الإجمالي</td><td className="n">{money(total)}</td>{rp.cFrom && <><td className="n">{money(cTotal)}</td><td className="n"><Delta cur={total} prev={cTotal} money={money} /></td></>}<td className="n">100%</td></tr></tbody></table></div></div>
        {rp.detail === 'detail' && <div className="card"><h2>السندات ({ps.length})</h2><div className="tbl"><table>
          <thead><tr><th>السند</th><th className="n">التاريخ</th><th>المستأجر</th><th>العقار</th><th>الطريقة</th><th>المرجع</th><th className="n">المبلغ</th></tr></thead>
          <tbody>{ps.map((p) => <tr key={p.id}><td><Link href={`/payments/${p.id}`}>{p.receipt_no}</Link></td><td className="n">{date(p.paid_on)}</td><td>{a.T.get(p.tenant_id)?.name}</td>
            <td>{a.P.get(a.payProp(p) ?? '')?.short}</td><td>{p.method}</td><td dir="ltr">{p.bank_ref}</td><td className="n">{money(p.amount)}</td></tr>)}
            <tr className="tot"><td colSpan={6}>الإجمالي</td><td className="n">{money(total)}</td></tr></tbody></table></div></div>}
      </>}
    </ReportFrame>
  );
}
