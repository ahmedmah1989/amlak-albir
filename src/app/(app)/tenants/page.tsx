import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Btn, XL } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { money, date, TENANT_TYPE } from '@/lib/fmt';
import { Prog } from '@/components/InstallmentBoard';
import { grade } from '@/lib/score';
import { daysBetween } from '@/lib/calc';

export default async function Tenants({ searchParams }: { searchParams: { f?: string } }) {
  const { a, org, asOf, canEdit } = await ctx();
  const f = searchParams.f ?? 'current';
  let ts = [...a.tenantStats];
  if (f === 'current') ts = ts.filter((t) => t.activeContracts.length || t.arrears || t.pending);
  if (f === 'arrears') ts = ts.filter((t) => t.arrears > 0);
  const soon = (d: string | null) => !!d && daysBetween(asOf, d) <= 60;
  const recentFollow = (t: (typeof ts)[number]) => !!t.lastFollow && daysBetween(t.lastFollow.date, asOf) <= 30;
  if (f === 'nofollow') ts = ts.filter((t) => t.arrears > 0 && !recentFollow(t));
  if (f === 'expiring') ts = ts.filter((t) => t.activeContracts.length && (soon(t.t.id_expiry) || soon(t.t.cr_expiry)));
  if (f === 'incomplete') ts = ts.filter((t) => t.activeContracts.length && t.completeness.missing > 0);
  if (/^[ABCD]$/.test(f)) ts = ts.filter((t) => grade(t.collRate, t.avgDelay, t.maxLate) === f);
  ts.sort((x, y) => y.arrears - x.arrears || y.activeContracts.length - x.activeContracts.length);
  const noPhone = a.tenantStats.filter((t) => t.activeContracts.length && !t.t.phone).length;
  const incomplete = a.tenantStats.filter((t) => t.activeContracts.length && t.completeness.missing > 0).length;
  return <Page title="المستأجرون" sub={`${ts.length} مستأجراً • بيانات الاتصال والعقود والتحصيل`} org={org} asOf={asOf} print
    actions={<>{canEdit && <Btn href="/tenants/new">＋ مستأجر جديد</Btn>}<XL r="tenants" q={`&f=${f}`} /></>}>
    <div className="filter-stack noprint"><div className="filters">{[['current', 'الحاليون'], ['arrears', 'عليهم متأخرات'], ['nofollow', 'متأخرون بلا متابعة 30 يوماً'], ['expiring', 'هوية/سجل ينتهي خلال 60 يوماً'], ['incomplete', 'بيانات ناقصة'], ['all', 'الكل']].map(([k, l]) => <Link key={k} href={`?f=${k}`} className={f === k ? 'on' : ''}>{l}</Link>)}</div>
      <div className="filters"><span className="muted">التصنيف:</span>{['A', 'B', 'C', 'D'].map((g) => <Link key={g} href={`?f=${g}`} className={f === g ? 'on' : ''}>{g} ({a.tenantStats.filter((t) => grade(t.collRate, t.avgDelay, t.maxLate) === g).length})</Link>)}</div></div>
    {(noPhone > 0 || incomplete > 0) && <p className="note warn noprint">{incomplete} مستأجرين حاليين بياناتهم غير مكتملة{noPhone ? `، منهم ${noPhone} بلا رقم جوال` : ''} — رتّب بعمود «اكتمال البيانات» واستكمل من ملف المستأجر.</p>}
    <div className="card table-card"><DataTable label="المستأجرين" storageKey={`tenants:${f}`} summaryColumns={[5, 6, 7]} bulk={[{ label: 'رسائل واتساب', href: '/tenants/whatsapp?k=claim', primary: true }, { label: 'خطابات تذكير', href: '/tenants/letters?type=reminder' }, { label: 'خطابات مطالبة', href: '/tenants/letters?type=claim' }, { label: 'خطابات إنذار', href: '/tenants/letters?type=warning' }]} columns={[
      { label: 'المستأجر', wide: true }, { label: 'النوع', hidden: true }, { label: 'الجوال' }, { label: 'اكتمال البيانات', numeric: true }, { label: 'العقود السارية', wide: true },
      { label: 'الإيجار السنوي', numeric: true }, { label: 'متأخر مؤكد', numeric: true },
      { label: 'يحتاج تأكيداً', numeric: true, hidden: true }, { label: 'أقدم تأخير', numeric: true },
      { label: 'متوسط التأخر', numeric: true, hidden: true }, { label: 'آخر متابعة', hidden: true }, { label: 'آخر سداد', numeric: true },
      { label: 'التصنيف' }, { label: 'انتهاء الهوية/السجل', kind: 'date', hidden: true }, { label: 'موظف التحصيل', hidden: true },
    ]} rows={ts.map((s) => {
      const trade = [...new Set(s.contracts.map((c) => c.trade_name).filter(Boolean))].join(' • ');
      const units = s.activeContracts.map((c) => `${a.P.get(c.property_id)?.short} (${a.U.get(c.unit_id)?.code})`).join('، ');
      const rent = s.activeContracts.reduce((x, c) => x + c.annual_rent, 0);
      return { id: s.t.id, search: [s.t.name, s.t.phone, trade, units, ...s.contracts.map((c) => c.contract_no)].join(' '),
        values: [s.t.name, TENANT_TYPE[s.t.tenant_type ?? 'individual'], s.t.phone, s.completeness.pct, units, rent, s.arrears, s.pending, s.maxLate, s.avgDelay, s.lastFollow?.date ?? null, s.lastPayment?.paid_on ?? null, grade(s.collRate, s.avgDelay, s.maxLate), (s.t.tenant_type === 'company' ? s.t.cr_expiry : s.t.id_expiry) ?? null, s.t.collector ?? null],
        totals: { 5: rent, 6: s.arrears, 7: s.pending },
        actions: [['ملف المستأجر', `/tenants/${s.t.id}`], ['كشف الحساب', `/reports/statement?t=${s.t.id}`], ...(canEdit ? [['تسجيل سند قبض', `/payments/new?tenant=${s.t.id}`], ['تعديل البيانات', `/tenants/${s.t.id}/edit`]] as [string, string][] : []), ['خطاب مطالبة', `/tenants/${s.t.id}/letter?type=claim`], ['رسالة واتساب', `/tenants/whatsapp?ids=${s.t.id}`]],
        peekTitle: s.t.name, peek: [['الجوال', s.t.phone ?? ''], ['الوحدات', units], ['الإيجار السنوي', money(rent)], ['المتأخر المؤكد', money(s.arrears)], ['يحتاج تأكيداً', money(s.pending)], ['أقدم تأخير', s.maxLate ? `${s.maxLate} يوماً` : '—'], ['آخر سداد', s.lastPayment ? date(s.lastPayment.paid_on) : ''], ['آخر متابعة', s.lastFollow ? `${date(s.lastFollow.date)} — ${s.lastFollow.type}` : ''], ['التصنيف', grade(s.collRate, s.avgDelay, s.maxLate)]] as [string, string][],
        cells: [<><Link className="record-link" href={`/tenants/${s.t.id}`}>{s.t.name}</Link>{trade && <div className="cell-sub" title={trade}>{trade}</div>}</>,
          TENANT_TYPE[s.t.tenant_type ?? 'individual'], <span dir="ltr">{s.t.phone ?? '—'}</span>, <span className="complete"><Prog pct={s.completeness.pct} /> {s.completeness.pct}%</span>, units || <Tag tone="mute">لا يوجد</Tag>, money(rent),
          s.arrears ? <span className="amount-bad">{money(s.arrears)}</span> : '—', s.pending ? money(s.pending) : '—',
          s.maxLate ? `${s.maxLate} يوماً` : '—', s.avgDelay == null ? '—' : `${s.avgDelay} يوماً`, s.lastFollow ? `${date(s.lastFollow.date)} — ${s.lastFollow.type}` : '—', s.lastPayment ? date(s.lastPayment.paid_on) : '—',
          (() => { const g = grade(s.collRate, s.avgDelay, s.maxLate); return g === '—' ? '—' : <Tag tone={g === 'A' ? 'ok' : g === 'B' ? 'info' : g === 'C' ? 'warn' : 'bad'}>{g}</Tag>; })(), date(s.t.tenant_type === 'company' ? s.t.cr_expiry : s.t.id_expiry), s.t.collector ?? '—'],
      };
    })} /></div>
  </Page>;
}
