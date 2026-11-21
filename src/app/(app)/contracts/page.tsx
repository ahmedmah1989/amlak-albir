import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Btn, XL } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { money, date, FREQ, CSTATUS } from '@/lib/fmt';
import { daysBetween } from '@/lib/calc';
import { completeAllSchedules } from '@/lib/actions';

const F: [string, string][] = [['active', 'السارية'], ['e30', 'تنتهي خلال 30 يوماً'], ['e90', 'خلال 90 يوماً'], ['ending', 'خلال سنة'], ['arrears', 'عليها متأخرات'], ['gap', 'جدول ناقص'], ['past', 'المنتهية'], ['all', 'الكل']];
export default async function Contracts({ searchParams }: { searchParams: { f?: string; p?: string; fr?: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const f = searchParams.f ?? 'active', pid = searchParams.p, fr = searchParams.fr;
  let cs = db.contracts.filter((c) => !pid || c.property_id === pid);
  if (f === 'active') cs = cs.filter((c) => c.status === 'active');
  if (f === 'past') cs = cs.filter((c) => c.status !== 'active');
  if (f === 'ending') cs = cs.filter((c) => c.status === 'active' && daysBetween(asOf, c.end_date) <= 365);
  if (f === 'e30' || f === 'e90') cs = cs.filter((c) => c.status === 'active' && daysBetween(asOf, c.end_date) <= (f === 'e30' ? 30 : 90));
  if (f === 'arrears') cs = cs.filter((c) => a.overdue.some((r) => r.contract_id === c.id));
  if (f === 'gap') cs = cs.filter((c) => a.gaps.some((g) => g.c.id === c.id));
  if (fr) cs = cs.filter((c) => c.frequency === fr);
  cs = [...cs].sort((x, y) => (x.status === 'active' ? 0 : 1) - (y.status === 'active' ? 0 : 1) || x.end_date.localeCompare(y.end_date));
  const q = (o: Record<string, string | undefined>) => '?' + new URLSearchParams(Object.entries({ f, p: pid, fr, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const title = 'العقود' + (f !== 'all' ? ' — ' + F.find((x) => x[0] === f)?.[1] : '') + (pid ? ' — ' + a.P.get(pid)?.short : '');
  return <Page title={title} sub={`${cs.length} عقداً • الإيجار السنوي للسارية ${money(cs.filter((c) => c.status === 'active').reduce((x, c) => x + c.annual_rent, 0))} ريال`} org={org} asOf={asOf} print
    actions={<>{canEdit && <Btn href="/contracts/new">＋ عقد جديد</Btn>}<XL r="contracts" q={'&' + q({}).slice(1)} /></>}>
    {a.gaps.length > 0 && <div className="note warn noprint"><b>{a.gaps.length} عقود سارية جدول أقساطها لا يصل لنهاية العقد</b> — ينقص {a.gaps.reduce((x, g) => x + g.missing.length, 0)} قسطاً بقيمة {money(a.gaps.reduce((x, g) => x + g.missing.reduce((s, i) => s + i.amount, 0), 0))} ريال.
      <div className="missing-list">{a.gaps.map((g) => <Link key={g.c.id} className="tag t-warn" href={`/contracts/${g.c.id}#tab=installments`}>{a.U.get(g.c.unit_id)?.code} — {a.T.get(g.c.tenant_id)?.name} ({g.missing.length})</Link>)}</div>
      {isAdmin && <form action={completeAllSchedules} style={{ marginTop: 8 }}><button className="btn sm" type="submit">استكمال جداول كل العقود السارية</button></form>}</div>}
    <div className="filter-stack"><div className="filters">{F.map(([k, l]) => <Link key={k} href={q({ f: k })} className={f === k ? 'on' : ''}>{l}</Link>)}</div>
      <div className="filters"><Link href={q({ p: '' })} className={!pid ? 'on' : ''}>كل العقارات</Link>{db.properties.map((p) => <Link key={p.id} href={q({ p: p.id })} className={pid === p.id ? 'on' : ''}>{p.short}</Link>)}</div>
      <div className="filters"><span className="muted">الدورية:</span><Link href={q({ fr: '' })} className={!fr ? 'on' : ''}>الكل</Link>{Object.entries(FREQ).filter(([k]) => db.contracts.some((c) => c.frequency === k)).map(([k, l]) => <Link key={k} href={q({ fr: k })} className={fr === k ? 'on' : ''}>{l}</Link>)}</div></div>
    <div className="card table-card"><DataTable label="العقود" storageKey={`contracts:${f}:${pid ?? ''}`} summaryColumns={[6, 8]} bulk={[{ label: 'إشعار القسط القادم', href: '/installments/notices?by=contract', primary: true }, { label: 'خطابات مطالبة للمستأجرين', href: '/tenants/letters?type=claim&by=contract' }]} columns={[
      { label: 'العقار' }, { label: 'الوحدة' }, { label: 'المستأجر', wide: true }, { label: 'رقم العقد' },
      { label: 'البداية', numeric: true, hidden: true }, { label: 'النهاية', numeric: true },
      { label: 'الإيجار السنوي', numeric: true }, { label: 'الدفع', hidden: true }, { label: 'متأخر', numeric: true }, { label: 'نسبة السداد', numeric: true }, { label: 'الحالة' },
      { label: 'القسط القادم', kind: 'date' }, { label: 'الاستخدام', hidden: true },
    ]} rows={cs.map((c) => {
      const d = daysBetween(asOf, c.end_date), prop = a.P.get(c.property_id)?.short ?? '', unit = a.U.get(c.unit_id)?.code ?? '', tenant = a.T.get(c.tenant_id)?.name ?? '';
      const cr = a.rows.filter((r) => r.contract_id === c.id), tot = cr.reduce((x, r) => x + r.amount, 0), bal = cr.reduce((x, r) => x + r.balance, 0);
      const late = cr.filter((r) => r.status === 'overdue').reduce((x, r) => x + r.balance, 0), paidP = tot ? Math.round(((tot - bal) / tot) * 100) : 0;
      const status = c.status === 'active' ? d < 0 ? 'انتهت مدته — يلزم تجديد أو إنهاء' : d <= 365 ? `متبقٍ ${d} يوماً` : 'ساري' : CSTATUS[c.status];
      const nx = cr.filter((r) => r.balance > 0 && r.due_date >= asOf).sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
      return { id: c.id, search: [prop, unit, tenant, c.contract_no, c.trade_name, status].join(' '),
        values: [prop, unit, tenant, c.contract_no, c.start_date, c.end_date, c.annual_rent, FREQ[c.frequency ?? ''] ?? '', late, paidP, status, nx?.due_date ?? null, c.usage ?? null],
        totals: { 6: c.annual_rent, 8: late },
        actions: [['فتح العقد', `/contracts/${c.id}`], ['ملف المستأجر', `/tenants/${c.tenant_id}`], ...(c.status === 'active' && canEdit ? [['تسجيل سند قبض', `/payments/new?tenant=${c.tenant_id}&contract=${c.id}`], ['تجديد العقد', `/contracts/${c.id}/renew`]] as [string, string][] : []), ...(nx ? [['إشعار القسط القادم', `/installments/${nx.id}/notice`]] as [string, string][] : []), ['كشف الحساب', `/reports/statement?t=${c.tenant_id}`]],
        peekTitle: `${prop} — ${unit}`, peek: [['المستأجر', tenant], ['الاسم التجاري', c.trade_name ?? ''], ['الجوال', a.T.get(c.tenant_id)?.phone ?? ''], ['المدة', `${date(c.start_date)} – ${date(c.end_date)}`], ['الإيجار السنوي', money(c.annual_rent)], ['الدورية', FREQ[c.frequency ?? ''] ?? ''], ['المتأخر', late ? money(late) : '—'], ['نسبة السداد', `${paidP}%`], ['القسط القادم', nx ? `${date(nx.due_date)} • ${money(nx.balance)}` : '—']] as [string, string][],
        cells: [prop, <Link className="record-link" href={`/contracts/${c.id}`}>{unit}</Link>, <><Link className="record-link" href={`/tenants/${c.tenant_id}`}>{tenant}</Link>{c.trade_name && <div className="cell-sub" title={c.trade_name}>{c.trade_name}</div>}</>,
          <span dir="ltr">{c.contract_no ?? '—'}</span>, date(c.start_date), date(c.end_date), money(c.annual_rent), FREQ[c.frequency ?? ''] ?? '—', late ? <span className="amount-bad">{money(late)}</span> : '—', `${paidP}%`,
          <Tag tone={c.status !== 'active' ? 'mute' : d < 0 ? 'bad' : d <= 365 ? 'warn' : 'ok'}>{status}</Tag>, nx ? <>{date(nx.due_date)}<div className="cell-sub">{money(nx.balance)}</div></> : '—', c.usage ?? '—'],
      };
    })} /></div>
  </Page>;
}
