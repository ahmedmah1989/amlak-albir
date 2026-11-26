import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag, Empty } from '@/components/ui';
import { Ic } from '@/components/icons';
import { Form, F, Hidden } from '@/components/form';
import { importEjar, linkEjar, contractFromEjar } from '@/lib/actions2';
import { money, date } from '@/lib/fmt';
import { addDays } from '@/lib/calc';
import { ejarPaidState } from '@/lib/ejar';

export default async function Ejar({ searchParams }: { searchParams: { c?: string } }) {
  const { db, a, org, asOf, canEdit } = await ctx();
  const nos = [...new Set(db.ejar.map((e) => e.contract_no))];
  const sel = searchParams.c && nos.includes(searchParams.c) ? searchParams.c : nos[0];
  const rows = db.ejar.filter((e) => e.contract_no === sel);
  const f = rows[0], c = f?.contract_id ? a.C.get(f.contract_id) : undefined;
  const late = rows.filter((e) => ejarPaidState(e.status) === 'unpaid' && e.due_date && e.due_date < asOf);
  const paid = rows.filter((e) => ejarPaidState(e.status) === 'paid'), sum = (x: typeof rows) => x.reduce((s, e) => s + e.amount, 0);
  const sysOf = (iid: string | null) => (iid ? a.rows.find((r) => r.id === iid) : undefined);
  return (
    <Page title="منصة إيجار" sub="استيراد ملفات أقساط إيجار ومقارنتها بالنظام والبنك" org={org} asOf={asOf} print>
      {canEdit && <form action={importEjar} className="drop noprint" style={{ marginBottom: '1rem' }}>
        <label className="fld"><span><Ic n="up" /> ملف أقساط من منصة إيجار (xlsx أو csv) — يُقبل أكثر من مرة لتحديث الحالات</span><input type="file" name="file" accept=".xlsx,.xls,.csv" required /></label>
        <button className="btn gold">استيراد</button></form>}
      {!nos.length ? <Empty>لم يُستورد أي ملف بعد.</Empty> : <>
        <div className="filters">{nos.map((n) => { const r = db.ejar.filter((e) => e.contract_no === n); const l = r.filter((e) => ejarPaidState(e.status) === 'unpaid' && e.due_date && e.due_date < asOf).length;
          return <Link key={n} href={`?c=${n}`} className={n === sel ? 'on' : ''} dir="ltr">{n}{l ? ` • ${l} متأخر` : ''}</Link>; })}</div>
        <div className="kpis">
          <Kpi tone="hero" l="عقد إيجار" v={sel!} s={`${f.contract_type ?? ''} • ${f.state ?? ''} • عقار ${f.ejar_property_id ?? '—'}`} />
          <Kpi l="المدة" v={date(f.start_date)} s={`حتى ${date(f.end_date)}`} />
          <Kpi l="قيمة العقد" v={money(sum(rows))} unit="ريال" s={`${rows.length} أقساط • مدفوع ${money(sum(paid))}`} />
          <Kpi tone="bad" l="غير مدفوع وانتهت مهلته" v={money(sum(late))} unit="ريال" s={`${late.length} أقساط`} />
        </div>
        <div className="card"><h2><Ic n="link" />الربط بالنظام</h2>
          {c ? <p className="note">مربوط بعقد <Link href={`/contracts/${c.id}`}><b>{a.P.get(c.property_id)?.short} — {a.U.get(c.unit_id)?.code}</b></Link> للمستأجر <b>{a.T.get(c.tenant_id)?.name}</b>{f.broker ? ` • عبر ${f.broker}` : ''}.</p>
            : <><p className="note warn">العقد غير مربوط بأي عقد في النظام{f.broker ? ` • عبر مكتب الوساطة: ${f.broker}` : ''}. اربطه بعقد موجود، أو أنشئ العقد من الملف.</p>
              {canEdit && <div className="g2">
                <Form action={linkEjar} submit="ربط بعقد موجود"><Hidden n="contract_no" v={sel!} /><F label="العقد في النظام" name="contract_id" req opts={db.contracts.filter((x) => x.status === 'active').map((x) => [x.id, `${a.P.get(x.property_id)?.short} — ${a.U.get(x.unit_id)?.code} — ${a.T.get(x.tenant_id)?.name}`])} /></Form>
                <Form action={contractFromEjar} submit="إنشاء العقد من ملف إيجار"><Hidden n="contract_no" v={sel!} />
                  <F label="الوحدة" name="unit_id" req opts={db.units.filter((u) => u.kind === 'lease').map((u) => [u.id, `${a.P.get(u.property_id)?.short} — ${u.code}`])} hint="الوحدة غير الموجودة تُضاف من صفحة العقار" />
                  <F label="المستأجر" name="tenant_id" req opts={db.tenants.map((t) => [t.id, t.name])} hint="المستأجر الجديد يُضاف من «المستأجرون»" /></Form></div>}</>}</div>
        <div className="card"><h2><Ic n="ejar" />الأقساط: إيجار مقابل النظام</h2><div className="tbl"><table>
          <thead><tr><th>رقم القسط</th><th className="n">الإصدار</th><th className="n">آخر موعد</th><th className="n">المبلغ</th><th>حالة إيجار</th><th>حالة النظام</th><th>الحكم</th></tr></thead>
          <tbody>{rows.map((e) => { const r = sysOf(e.installment_id); const es = ejarPaidState(e.status), ep = es === 'paid';
            const v = !r ? ['mute', 'غير مربوط'] : ep && r.balance > 0 ? ['bad', 'مدفوع في إيجار وغير مسدد في النظام'] : !ep && r.balance <= 0 ? (es === 'unpaid' ? ['warn', 'مسدد في النظام وغير مدفوع في إيجار'] : ['mute', 'مسدد في النظام وحالة إيجار غير محددة']) : ep ? (r.allocated > 0 && a.payments.find((p) => db.allocations.some((x) => x.payment_id === p.id && x.installment_id === r.id) && p.bank_line_id) ? ['ok', 'متطابق ومطابق مع البنك'] : ['est', 'متطابق، بانتظار البنك']) : e.due_date && e.due_date < asOf ? ['bad', 'متأخر في الاثنين'] : ['info', 'قادم'];
            return <tr key={e.id}><td className="n" dir="ltr">{e.installment_no}</td><td className="n">{date(e.issue_date)}</td><td className="n">{date(e.due_date ?? (e.issue_date ? addDays(e.issue_date, 10) : null))}</td><td className="n">{money(e.amount)}</td>
              <td><Tag tone={ep ? 'ok' : es === 'unpaid' ? 'warn' : 'mute'}>{e.status ?? '—'}</Tag></td><td>{r ? <Link href={`/installments/${r.id}`}>{r.balance > 0 ? `متبقٍ ${money(r.balance)}` : 'مسدد'}</Link> : '—'}</td><td><Tag tone={v[0]}>{v[1]}</Tag></td></tr>; })}
            <tr className="tot"><td>الإجمالي</td><td></td><td></td><td className="n">{money(sum(rows))}</td><td></td><td></td><td></td></tr></tbody></table></div>
          <p className="muted">ملف إيجار لا يذكر تاريخ الدفع ولا المبلغ المدفوع؛ «تم الدفع» تُطابق مع كشف البنك من شاشة المطابقة.</p></div></>}
    </Page>
  );
}
