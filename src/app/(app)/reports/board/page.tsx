import ReportFrame from '@/components/ReportFrame';
import { parseReport, type SP } from '@/lib/report-params';
import { ctx } from '@/lib/ctx';
import { Page, Kpi } from '@/components/ui';
import { money, date, pct } from '@/lib/fmt';
import { runAudit } from '@/lib/audit';
import { daysBetween } from '@/lib/calc';

const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export default async function Board({ searchParams }: { searchParams: SP }) {
  const { db, a, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { orient: 'p' });
  const au = runAudit(db, a);
  const B: [string, number, number][] = [['حتى 30 يوماً', 1, 30], ['31–90', 31, 90], ['91–180', 91, 180], ['181–365', 181, 365], ['أكثر من سنة', 366, 1e9]];
  const ag = B.map(([l, lo, hi]) => [l, a.overdue.filter((r) => r.daysLate >= lo && r.daysLate <= hi).reduce((x, r) => x + r.balance, 0)] as [string, number]);
  const top = a.tenantStats.filter((t) => t.arrears > 0).sort((x, y) => y.arrears - x.arrears).slice(0, 5);
  const ending = a.renewals.filter((r) => r.days <= 180);
  const fc = a.forecast.slice(0, 3);
  const exp = a.expensesYear, net = a.collectedYear - exp;
  return (
    <ReportFrame id="board" title="الملخص التنفيذي لمجلس الإدارة" sub="محفظة الأملاك والأوقاف — صفحة واحدة" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={[]}>
      <div className="board">
        <div className="kpis">
          <Kpi tone="hero" l="الإيجار السنوي المتعاقد عليه" v={money(a.annualRent)} unit="ريال" s={`${a.active.length} عقود سارية`} />
          <Kpi tone="info" l={`المحصّل في ${a.year}`} v={money(a.collectedYear)} unit="ريال" s={`صافي بعد المصروفات ${money(net)}`} />
          <Kpi l="نسبة التحصيل من المستحق" v={a.collRate == null ? '—' : pct(a.collRate)} s={`لعام ${a.year}: ${a.collRateYear == null ? '—' : pct(a.collRateYear)}`} />
          <Kpi tone="bad" l="المتأخرات المؤكدة" v={money(a.arrearsTotal)} unit="ريال" s={`منها أكثر من سنة ${money(a.doubtful)}`} />
        </div>
        <div className="g2">
          <div className="card"><h2>أعمار المتأخرات</h2><div className="tbl"><table><tbody>{ag.map(([l, v]) => <tr key={l}><td>{l}</td><td className="n">{money(v)}</td><td className="n">{a.arrearsTotal ? pct((v / a.arrearsTotal) * 100) : '—'}</td></tr>)}
            <tr className="tot"><td>الإجمالي</td><td className="n">{money(a.arrearsTotal)}</td><td></td></tr></tbody></table></div></div>
          <div className="card"><h2>أكبر المتأخرين</h2><div className="tbl"><table><tbody>{top.map((t) => <tr key={t.t.id}><td>{t.t.name}</td><td className="n">{money(t.arrears)}</td><td className="n">{t.maxLate} يوماً</td></tr>)}</tbody></table></div></div>
          <div className="card"><h2>عقود تنتهي خلال 6 أشهر ({ending.length})</h2>{!ending.length ? <p className="muted">لا توجد.</p> : <div className="tbl"><table><tbody>{ending.map((r) => <tr key={r.c.id}><td>{r.tenantName} — {r.unitCode}</td><td className="n">{date(r.c.end_date)}</td><td className="n">{money(r.c.annual_rent)}</td></tr>)}</tbody></table></div>}</div>
          <div className="card"><h2>التحصيل المتوقع (3 أشهر)</h2><div className="tbl"><table><tbody>{fc.map((f) => <tr key={f.m}><td>{MON[Number(f.m.slice(5, 7)) - 1]} {f.m.slice(0, 4)}</td><td className="n">{f.count} أقساط</td><td className="n">{money(f.amount)}</td></tr>)}</tbody></table></div>
            {a.gaps.length > 0 && <p className="note warn">{a.gaps.length} عقود جداولها ناقصة؛ التوقع أقل من الفعلي.</p>}</div>
        </div>
        <div className="card"><h2>مؤشرات الحوكمة</h2><div className="facts">
          <div><span>جودة البيانات</span><b>{au.score}%</b></div><div><span>حالات تدقيق مفتوحة</span><b>{au.open.length}</b></div>
          <div><span>متأخرون بلا متابعة</span><b>{a.needFollow.length}</b></div><div><span>المصروفات {a.year}</span><b>{money(exp)}</b></div>
          <div><span>إقفال الفترة حتى</span><b>{db.meta.locked_until ? date(db.meta.locked_until) : 'غير مقفلة'}</b></div>
          <div><span>أقرب نهاية عقد</span><b>{a.renewals[0] ? `${date(a.renewals[0].c.end_date)} (${daysBetween(asOf, a.renewals[0].c.end_date)} يوماً)` : '—'}</b></div>
        </div></div>
      </div>
    </ReportFrame>
  );
}
