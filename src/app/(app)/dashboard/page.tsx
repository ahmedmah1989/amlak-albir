import Link from 'next/link';
import DashboardPanels from '@/components/DashboardPanels';
import { ctx } from '@/lib/ctx';
import { Page, Kpi, Tag } from '@/components/ui';
import { Ic } from '@/components/icons';
import { money, date, pct } from '@/lib/fmt';
import { daysBetween } from '@/lib/calc';
import { runAudit } from '@/lib/audit';

export default async function Dashboard() {
  const { db, a, org, asOf } = await ctx();
  const B: [string, number, number][] = [['1-30', 1, 30], ['31-90', 31, 90], ['91-180', 91, 180], ['181-365', 181, 365], ['+365', 366, 1e9]];
  const ag = B.map(([l, lo, hi]) => [l, a.overdue.filter((r) => r.daysLate >= lo && r.daysLate <= hi).reduce((x, r) => x + r.balance, 0)] as [string, number]);
  const mx = Math.max(1, ...ag.map((x) => x[1])), cols = ['#d9a441', '#c2620c', '#b3261e', '#8f1d17', '#5e130f'];
  const over90 = ag.slice(2).reduce((x, y) => x + y[1], 0);
  const top = a.tenantStats.filter((t) => t.arrears > 0).sort((x, y) => y.arrears - x.arrears).slice(0, 6);
  const top4 = top.slice(0, 4).reduce((x, t) => x + t.arrears, 0);
  const mr = Math.max(1, ...a.propStats.map((s) => s.rent));
  const leaseUnits = db.units.filter((u) => u.kind === 'lease'), occ = leaseUnits.filter((u) => a.active.some((c) => c.unit_id === u.id)).length;
  const subU = db.meta.features.units_split ? db.units.filter((u) => u.parent_id) : [], subOcc = subU.filter((u) => (u.status ?? 'occupied') === 'occupied').length;
  const audit = runAudit(db, a);
  const unm = db.bankLines.filter((l) => l.status === 'open');
  const evts = [
    ...a.rows.filter((r) => r.status === 'upcoming' && daysBetween(asOf, r.due_date) <= 90).map((r) => ({ d: r.due_date, t: `قسط ${r.tenantName} — ${money(r.amount)}`, k: 'cal' })),
    ...a.renewals.filter((r) => r.negotiate >= asOf && daysBetween(asOf, r.negotiate) <= 90).map((r) => ({ d: r.negotiate, t: `بدء التفاوض: ${r.prop.short} — ${r.unitCode}`, k: 'renew' })),
    ...db.properties.filter((p) => p.ground_lease_end && daysBetween(asOf, p.ground_lease_end) <= 400).map((p) => ({ d: p.ground_lease_end!, t: `نهاية عقد ${p.short} مع المؤجر`, k: 'bld' })),
  ].sort((x, y) => x.d.localeCompare(y.d)).slice(0, 9);
  const MON = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];
  const ml = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
  const smx = Math.max(1, ...a.series.flatMap((x) => [x.due, x.collected]));
  const fc = a.forecast.slice(0, 6), fmx = Math.max(1, ...fc.map((x) => x.amount));
  const coll12 = a.series.reduce((x, m) => x + m.collected, 0), due12 = a.series.reduce((x, m) => x + m.due, 0);
  return (
    <Page title="اللوحة التنفيذية" sub={`صورة المحفظة حتى ${date(asOf)}. كل رقم يفتح تفاصيله.`} org={org} asOf={asOf} print>
      <DashboardPanels metrics={[
{id:'rent',label:'الإيجار السنوي',content:(<Kpi tone="hero" l="الإيجار السنوي المتعاقد عليه" v={money(a.annualRent)} unit="ريال" s={`${a.active.length} عقود سارية${a.totalBook ? ` • عائد ${pct((a.annualRent / a.totalBook) * 100)}` : ' • أدخل القيمة الدفترية لحساب العائد'}`} href="/contracts" />)},
{id:'arrears',label:'المتأخرات المؤكدة',content:(<Kpi tone="bad" l="المتأخرات المؤكدة" v={money(a.arrearsTotal)} unit="ريال" s={`${a.overdue.length} قسطاً • ${pct((a.arrearsTotal / Math.max(1, a.annualRent)) * 100)} من الإيجار السنوي`} href="/reports/arrears" />)},
{id:'collrate',label:'نسبة التحصيل',content:(<Kpi tone={a.collRate != null && a.collRate < 80 ? 'bad' : 'info'} l="نسبة التحصيل من المستحق" v={a.collRate == null ? '—' : pct(a.collRate)} s={`لعام ${a.year}: ${a.collRateYear == null ? '—' : pct(a.collRateYear)} • المحصل ÷ المستحق حتى اليوم`} href="/reports/cashflow" />)},
{id:'doubtful',label:'ديون مشكوك فيها',content:(<Kpi tone={a.doubtful ? 'bad' : ''} l="متأخرات تجاوزت سنة (مشكوك في تحصيلها)" v={money(a.doubtful)} unit="ريال" s={a.arrearsTotal ? `${pct((a.doubtful / a.arrearsTotal) * 100)} من المتأخرات` : 'لا متأخرات'} href="/reports/aging" />)},
{id:'nofollow',label:'متأخرون بلا متابعة',content:(<Kpi tone={a.needFollow.length ? 'warn' : ''} l="متأخرون بلا متابعة خلال 30 يوماً" v={String(a.needFollow.length)} unit="مستأجر" s={`متأخراتهم ${money(a.noFollowArrears)} ريال`} href="/followups" />)},
{id:'occupancy',label:'إشغال مجموعات التأجير',content:(<Kpi l="مجموعات التأجير المشغولة" v={`${occ}`} unit={`من ${leaseUnits.length} مجموعة`} s="قد تضم المجموعة عدة شقق أو محلات" href="/properties" />)},
...(subU.length ? [{id:'occupancy_sub',label:'إشغال الوحدات الفرعية',content:(<Kpi tone="info" l="إشغال الوحدات الفرعية (الشقق)" v={pct((subOcc / subU.length) * 100)} s={`${subOcc} مشغولة من ${subU.length}`} href="/properties" />)}] : []),
{id:'quality',label:'جودة البيانات',content:(<Kpi tone="warn" l="جودة البيانات بعد الاستثناء" v={`${audit.score}%`} s={`قبل الاستثناء ${audit.rawScore}% • ${audit.open.length} حالة مفتوحة`} href="/audit" />)},
{id:'collected',label:'المحصل بسندات',content:(<Kpi tone="info" l={`المحصّل بسندات في ${a.year}`} v={money(a.collectedYear)} unit="ريال" s={`هذا الشهر ${money(a.collectedMonth)}`} href="/reports/collection" />)},
{id:'pending',label:'أقساط تحتاج تأكيدًا',content:(<Kpi l="أقساط تحتاج تأكيداً" v={money(a.pendingTotal)} unit="ريال" s={`${a.unconfirmed.length} قسطاً`} href="/reports/unconfirmed" />)},
{id:'bank',label:'إيداعات غير مطابقة',content:(<Kpi l="إيداعات غير مطابقة" v={String(unm.length)} s={`${money(unm.reduce((x, l) => x + l.amount, 0))} ريال`} href="/bank/match" />)},
{id:'expenses',label:'المصروفات',content:(<Kpi l={`المصروفات في ${a.year}`} v={money(a.expensesYear)} unit="ريال" s={`${db.maintenance.filter((x) => x.status !== 'done' && x.status !== 'cancelled').length} طلبات صيانة مفتوحة`} href="/expenses" />)}
]} panels={[
{id:'trend',label:'المستحق والمحصل شهرياً',content:(<div className="card"><h2><Ic n="coin" />المستحق مقابل المحصّل <small>آخر 12 شهراً</small></h2>
          <div className="trend">{a.series.map((x) => <div className="m" key={x.m} title={`${ml(x.m)}: مستحق ${money(x.due)} • محصّل ${money(x.collected)}`}><div className="bars2"><i className="d" style={{ height: `${(x.due / smx) * 100}%` }} /><i className="c" style={{ height: `${(x.collected / smx) * 100}%` }} /></div><span>{ml(x.m)}</span></div>)}</div>
          <div className="legend2"><span><i style={{ background: '#c9cfc2' }} />المستحق بالجدول</span><span><i style={{ background: 'var(--g)' }} />المحصّل بسندات</span></div>
          <p className="muted">خلال 12 شهراً: استحق {money(due12)} وحُصّل {money(coll12)} ريال.</p></div>)},
{id:'forecast',label:'التحصيل المتوقع',content:(<div className="card"><h2><Ic n="cal" />التحصيل المتوقع <small>الأشهر الستة القادمة</small></h2>
          {a.gaps.length > 0 && <p className="note warn">{a.gaps.length} عقود جداولها ناقصة — <Link href="/contracts">استكملها</Link> ليظهر التوقع كاملاً.</p>}
          {fc.map((x) => <div className="fc-row" key={x.m}><span>{ml(x.m)} <small className="muted">({x.count})</small></span><div className="bar"><i style={{ width: `${(x.amount / fmx) * 100}%` }} /></div><b>{money(x.amount)}</b></div>)}
          <p className="muted"><Link href="/reports/cashflow">التقرير التفصيلي ←</Link></p></div>)},
{id:'panel-0',label:'أعمار المتأخرات',content:(<div className="card"><h2><Ic n="clock" />أعمار المتأخرات <small>بالأيام بعد المهلة</small></h2>
          <div className="bars">{ag.map(([l, v], i) => <div key={l} style={{ height: `${Math.max(3, (v / mx) * 100)}%`, background: cols[i] }} title={money(v)}><i>{v ? `${Math.round(v / 1000)} ألف` : '—'}</i><span>{l}</span></div>)}</div>
          <p className="muted">{a.arrearsTotal ? `${Math.round((over90 / a.arrearsTotal) * 100)}% من المتأخرات تجاوز عمرها 90 يوماً.` : 'لا توجد متأخرات.'}</p></div>)},
{id:'panel-1',label:'أكبر المتأخرين',content:(<div className="card"><h2><Ic n="users" />أكبر المتأخرين {a.arrearsTotal > 0 && <small>أكبر 4 = {Math.round((top4 / a.arrearsTotal) * 100)}% من المتأخرات</small>}</h2>
          <table><tbody>{top.map((t) => <tr key={t.t.id}><td><Link href={`/tenants/${t.t.id}`}>{t.t.name}</Link><div className="muted">{t.activeContracts.map((c) => `${a.P.get(c.property_id)?.short} — ${a.U.get(c.unit_id)?.code}`).join('، ')}</div></td>
            <td className="n"><Tag tone={t.arrears >= 40000 ? 'bad' : 'warn'}>{money(t.arrears)}</Tag><div className="muted">{t.overdueCount} أقساط</div></td></tr>)}</tbody></table></div>)},
{id:'panel-2',label:'الإيجار والمتأخرات لكل عقار',content:(<div className="card"><h2><Ic n="bld" />الإيجار والمتأخرات لكل عقار</h2>
          {a.propStats.map((s) => s.idle ? <div className="hb" key={s.p.id}><Link href={`/properties/${s.p.id}`}>{s.p.short}</Link><div className="t"><i style={{ width: '100%', background: 'repeating-linear-gradient(45deg,#e6e9e2 0 8px,#f4f5f1 8px 16px)' }} /></div><b><Tag tone="bad">بلا دخل</Tag></b></div>
            : <div className="hb" key={s.p.id}><Link href={`/properties/${s.p.id}`}>{s.p.short}</Link><div className="t"><i style={{ width: `${(Math.max(0, s.rent - s.arrears) / mr) * 100}%`, background: 'var(--g)' }} /><i style={{ width: `${(Math.min(s.arrears, s.rent) / mr) * 100}%`, background: 'var(--bad)' }} /></div><b>{money(s.rent)}</b></div>)}
          <div className="legend"><span><i style={{ background: 'var(--g)' }} />منتظم</span><span><i style={{ background: 'var(--bad)' }} />متأخر</span></div></div>)},
{id:'panel-3',label:'الأحداث القادمة',content:(<div className="card"><h2><Ic n="cal" />قادم خلال 90 يوماً</h2>
          {evts.length ? <ul className="tl">{evts.map((e, i) => <li key={i}><b>{date(e.d)}</b> — {e.t}</li>)}</ul> : <p className="muted">لا أحداث قريبة.</p>}</div>)}
]} />
    </Page>
  );
}
