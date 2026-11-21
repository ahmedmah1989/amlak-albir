import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, IStat, XL } from '@/components/ui';
import { money, date } from '@/lib/fmt';
import DataTable from '@/components/DataTable';
import { ISTATUS } from '@/lib/calc';
import InstallmentBoard, { Prog, InstStat } from '@/components/InstallmentBoard';

const ORDER = ['open', 'overdue', 'partial', 'unconfirmed', 'due', 'upcoming', 'paid', 'all'];
const LBL: Record<string, string> = { open: 'المفتوحة', partial: 'مسددة جزئياً', all: 'الكل', ...Object.fromEntries(Object.entries(ISTATUS).map(([k, v]) => [k, v.label])) };
const KINDS: Record<string, string> = { rent: 'إيجار', service: 'خدمات', fee: 'غرامة', plan: 'جدولة' };
const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export default async function Installments({ searchParams }: { searchParams: { f?: string; from?: string; to?: string; v?: string; k?: string; p?: string } }) {
  const { db, a, org, asOf, canEdit } = await ctx();
  const view = searchParams.v === 'cards' ? 'cards' : 'table';
  const f = searchParams.f ?? 'open', from = searchParams.from, to = searchParams.to, kk = searchParams.k, pid = searchParams.p;
  const rows = a.rows.filter((r) => (f === 'all' || (f === 'open' ? ['overdue', 'unconfirmed', 'due'].includes(r.status) : f === 'partial' ? r.partial : r.status === f))
    && (!from || r.due_date >= from) && (!to || r.due_date <= to) && (!kk || (r.kind ?? 'rent') === kk) && (!pid || r.contract.property_id === pid)).sort((x, y) => x.due_date.localeCompare(y.due_date));
  const qs = (k: string, v = view, extra: Record<string, string | undefined> = {}) => '?' + new URLSearchParams(Object.entries({ f: k, from, to, v: v === 'cards' ? 'cards' : undefined, k: kk, p: pid, ...extra }).filter(([, x]) => x) as [string, string][]).toString();
  return (
    <Page title={`الأقساط — ${LBL[f]}`} sub={`${rows.length} قسطاً • المتبقي ${money(rows.reduce((x, r) => x + r.balance, 0))} ريال • مهلة السداد ${a.grace} أيام`} org={org} asOf={asOf} print
      actions={<XL r="installments" q={`&f=${f}${from ? '&from=' + from : ''}${to ? '&to=' + to : ''}`} />}>
      <div className="filter-stack noprint"><div className="filters">{ORDER.map((k) => <Link key={k} href={qs(k)} className={f === k ? 'on' : ''}>{LBL[k]}</Link>)}</div>
        <div className="filters"><Link href={qs(f, view, { p: '' })} className={!pid ? 'on' : ''}>كل العقارات</Link>{db.properties.map((p) => <Link key={p.id} href={qs(f, view, { p: p.id })} className={pid === p.id ? 'on' : ''}>{p.short}</Link>)}</div>
        <div className="filters"><span className="muted">نوع القسط:</span><Link href={qs(f, view, { k: '' })} className={!kk ? 'on' : ''}>الكل</Link>{Object.entries(KINDS).filter(([k]) => a.rows.some((r) => (r.kind ?? 'rent') === k)).map(([k, l]) => <Link key={k} href={qs(f, view, { k })} className={kk === k ? 'on' : ''}>{l}</Link>)}</div></div>
      <div className="view-switch noprint"><Link href={qs(f, 'table')} className={view === 'table' ? 'on' : ''}>جدول</Link><Link href={qs(f, 'cards')} className={view === 'cards' ? 'on' : ''}>بطاقات</Link></div>
      <form className="filter-panel noprint" method="get"><input type="hidden" name="f" value={f} />{view === 'cards' && <input type="hidden" name="v" value="cards" />}
        <label className="fld"><span>استحقاق من</span><input type="date" name="from" defaultValue={from} /></label>
        <label className="fld"><span>إلى</span><input type="date" name="to" defaultValue={to} /></label>
        <button className="btn sm" type="submit" style={{ alignSelf: 'flex-end' }}>تطبيق</button></form>
      {view === 'cards' ? (rows.length ? <InstallmentBoard rows={rows} canEdit={canEdit} showContract /> : <p className="muted empty">لا توجد أقساط.</p>) : <div className="card table-card"><DataTable label="الأقساط" storageKey={`installments:${f}:${from ?? ''}:${to ?? ''}`} summaryColumns={[4, 5, 6]} bulk={[{ label: 'طباعة إشعارات المطالبة', href: '/installments/notices', primary: true }, ...(db.meta.features.e_invoice ? [{ label: 'إصدار فواتير ضريبية', href: '/invoices/issue' }] : [])]} columns={[
        { label: 'الاستحقاق', numeric: true }, { label: 'العقار / الوحدة', wide: true }, { label: 'المستأجر', wide: true },
        { label: '#', numeric: true }, { label: 'القيمة', numeric: true }, { label: 'المسدَّد', numeric: true, hidden: true },
        { label: 'المتبقي', numeric: true }, { label: 'التقدم', numeric: true }, { label: 'الحالة' }, { label: 'أيام التأخير', numeric: true },
        { label: 'شهر الاستحقاق', hidden: true }, { label: 'النوع', hidden: true }, { label: 'العقار', hidden: true },
      ]} rows={rows.map((r) => ({
        id: r.id, search: [r.propertyShort, r.unitCode, r.tenantName, r.contract.contract_no, r.no, r.due_date, ISTATUS[r.status].label].join(' '),
        values: [r.due_date, r.propertyShort + ' ' + r.unitCode, r.tenantName, r.no, r.amount, r.paidTotal, r.balance, r.paidPct, ISTATUS[r.status].label, r.daysLate, `${r.due_date.slice(0, 7)} ${MON[Number(r.due_date.slice(5, 7)) - 1]}`, KINDS[r.kind ?? 'rent'] ?? r.kind ?? 'إيجار', r.propertyShort],
        actions: [['فتح القسط', `/installments/${r.id}`], ['فتح العقد', `/contracts/${r.contract_id}`], ...(canEdit && r.balance > 0 ? [['تحصيل', `/payments/new?tenant=${r.contract.tenant_id}&contract=${r.contract_id}&inst=${r.id}`]] as [string, string][] : []), ...(r.balance > 0 ? [['إشعار مطالبة', `/installments/${r.id}/notice`]] as [string, string][] : [])],
        totals: { 4: r.amount, 5: r.paidTotal, 6: r.balance },
        cells: [<Link className="record-link" href={`/installments/${r.id}`}>{date(r.due_date)}</Link>,
          <Link href={`/contracts/${r.contract_id}`}>{r.propertyShort} — {r.unitCode}</Link>,
          <Link className="record-link" href={`/tenants/${r.contract.tenant_id}`}>{r.tenantName}</Link>, r.no, money(r.amount),
          r.paidTotal ? money(r.paidTotal) : '—', r.balance ? money(r.balance) : '—', <span className="complete"><Prog pct={r.paidPct} /> {Math.round(r.paidPct)}%</span>, <InstStat r={r} />, r.daysLate || '—', `${MON[Number(r.due_date.slice(5, 7)) - 1]} ${r.due_date.slice(0, 4)}`, KINDS[r.kind ?? 'rent'] ?? 'إيجار', r.propertyShort],
      }))} /></div>}
    </Page>
  );
}
