import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Kpi } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { money, date } from '@/lib/fmt';
import { daysBetween } from '@/lib/calc';
import UnitMap from '@/components/UnitMap';
import { unitStates } from '@/lib/unit-map';

const F: [string, string][] = [['all', 'كل الوحدات'], ['leased', 'المؤجرة'], ['vacant', 'الشاغرة'], ['ending', 'تنتهي خلال 90 يوماً'], ['arrears', 'عليها متأخرات']];
export default async function Units({ searchParams }: { searchParams: { f?: string; p?: string; t?: string; view?: string } }) {
  const { db, a, org, asOf, canEdit } = await ctx();
  const f = searchParams.f ?? 'all', pid = searchParams.p ?? '', ty = searchParams.t ?? '';
  const base = db.units.filter((u) => u.kind === 'lease' && (!pid || u.property_id === pid));
  const rows0 = base.map((u) => {
    const cs = db.contracts.filter((c) => c.unit_id === u.id).sort((x, y) => y.end_date.localeCompare(x.end_date));
    const cur = cs.find((c) => c.status === 'active') ?? null, last = cs[0] ?? null;
    const arrears = cur ? a.rows.filter((r) => r.contract_id === cur.id && r.status === 'overdue').reduce((n, r) => n + r.balance, 0) : 0;
    const left = cur ? daysBetween(asOf, cur.end_date) : null;
    const vacantDays = !cur && last ? Math.max(0, daysBetween(last.end_date, asOf)) : null;
    const subs = db.units.filter((x) => x.parent_id === u.id);
    return { u, cur, last, arrears, left, vacantDays, subs, p: a.P.get(u.property_id)!, tenant: cur ? a.T.get(cur.tenant_id) : undefined };
  });
  const types = [...new Set(base.map((u) => u.unit_type).filter(Boolean))] as string[];
  const counts = { all: rows0.length, leased: rows0.filter((r) => r.cur).length, vacant: rows0.filter((r) => !r.cur).length, ending: rows0.filter((r) => r.left != null && r.left <= 90).length, arrears: rows0.filter((r) => r.arrears > 0).length };
  const list = rows0.filter((r) => (!ty || r.u.unit_type === ty) && (f === 'all' || (f === 'leased' ? !!r.cur : f === 'vacant' ? !r.cur : f === 'ending' ? r.left != null && r.left <= 90 : r.arrears > 0)));
  const view = searchParams.view === 'map' ? 'map' : 'table';
  const q = (o: Record<string, string>) => '?' + new URLSearchParams(Object.entries({ f, p: pid, t: ty, view, ...o }).filter(([, v]) => v && v !== 'all' && v !== 'table')).toString();
  const occ = counts.all ? Math.round((counts.leased / counts.all) * 100) : 0;
  const rentAll = rows0.reduce((n, r) => n + (r.cur?.annual_rent ?? 0), 0);
  return (
    <Page title="الوحدات" sub={`${counts.all} وحدة تأجير • الإشغال ${occ}% • الإيجار السنوي للمؤجرة ${money(rentAll)} ريال`} org={org} asOf={asOf} print
      filters={[pid && a.P.get(pid)?.name, F.find((x) => x[0] === f)?.[1], ty].filter(Boolean).join(' • ')}>
      <div className="kpis">
        <Kpi l="الوحدات المؤجرة" v={String(counts.leased)} s={`نسبة الإشغال ${occ}%`} href={q({ f: 'leased' })} tone={f === 'leased' ? 'info' : ''} />
        <Kpi l="الوحدات الشاغرة" v={String(counts.vacant)} s="بدون عقد ساري" href={q({ f: 'vacant' })} tone={counts.vacant ? 'warn' : ''} />
        <Kpi l="تنتهي خلال 90 يوماً" v={String(counts.ending)} s="تحتاج تجديد أو إخلاء" href={q({ f: 'ending' })} tone={counts.ending ? 'warn' : ''} />
        <Kpi l="عليها متأخرات مؤكدة" v={String(counts.arrears)} href={q({ f: 'arrears' })} tone={counts.arrears ? 'bad' : ''} />
      </div>
      <div className="filter-stack noprint">
        <div className="filters">{F.map(([k, l]) => <Link key={k} href={q({ f: k })} className={f === k ? 'on' : ''}>{l} ({counts[k as keyof typeof counts]})</Link>)}</div>
        <div className="filters"><Link href={q({ p: '' })} className={!pid ? 'on' : ''}>كل العقارات</Link>{db.properties.map((p) => <Link key={p.id} href={q({ p: p.id })} className={pid === p.id ? 'on' : ''}>{p.short}</Link>)}</div>
        {types.length > 1 && <div className="filters"><Link href={q({ t: '' })} className={!ty ? 'on' : ''}>كل الأنواع</Link>{types.map((t) => <Link key={t} href={q({ t })} className={ty === t ? 'on' : ''}>{t}</Link>)}</div>}
      </div>
      <div className="seg noprint" role="tablist" aria-label="طريقة العرض"><Link href={q({ view: 'map' })} className={view === 'map' ? 'on' : ''}>خريطة الإشغال</Link><Link href={q({ view: 'table' })} className={view === 'table' ? 'on' : ''}>جدول</Link></div>
      {view === 'map' ? <div className="card"><UnitMap units={unitStates(db, a).filter((x) => list.some((r) => r.u.id === x.u.id))} /></div> :
      <div className="card table-card"><DataTable label="الوحدات" storageKey={`units:${f}:${pid}`} summaryColumns={[8, 10]} columns={[
        { label: 'العقار' }, { label: 'الوحدة' }, { label: 'النوع' }, { label: 'الدور' }, { label: 'المساحة م²', numeric: true, hidden: true }, { label: 'الحالة' },
        { label: 'المستأجر الحالي', wide: true }, { label: 'نهاية العقد', kind: 'date' }, { label: 'الإيجار السنوي', numeric: true }, { label: 'أيام الشغور', numeric: true, hidden: true }, { label: 'متأخر', numeric: true },
      ]} rows={list.map((r) => {
        const status = r.cur ? (r.left! < 0 ? 'انتهت مدته' : r.left! <= 90 ? `ينتهي خلال ${r.left} يوماً` : 'مؤجرة') : 'شاغرة';
        const actions: [string, string][] = [['فتح الوحدة', `/units/${r.u.id}`]];
        if (r.cur) actions.push(['فتح العقد', `/contracts/${r.cur.id}`], ['ملف المستأجر', `/tenants/${r.cur.tenant_id}`], ['تسجيل سند قبض', `/payments/new?tenant=${r.cur.tenant_id}`]);
        else if (canEdit) actions.push(['تأجير الوحدة (عقد جديد)', `/contracts/new?property=${r.u.property_id}&unit=${r.u.id}`]);
        if (r.cur && r.left! <= 120) actions.push(['تجديد العقد', `/contracts/${r.cur.id}/renew`]);
        return { id: r.u.id, search: [r.p.name, r.u.code, r.u.unit_type, r.u.floor, r.tenant?.name, r.cur?.trade_name, status].join(' '),
          values: [r.p.short, r.u.code, r.u.unit_type, r.u.floor, r.u.area, status, r.tenant?.name ?? null, r.cur?.end_date ?? null, r.cur?.annual_rent ?? null, r.vacantDays, r.arrears || null],
          totals: { 8: r.cur?.annual_rent ?? 0, 10: r.arrears },
          cells: [r.p.short, <Link className="record-link" href={`/units/${r.u.id}`}>{r.u.code}</Link>, r.u.unit_type ?? '—', r.u.floor ?? '—', r.u.area ? money(r.u.area) : '—',
            <Tag tone={!r.cur ? 'warn' : r.left! < 0 ? 'bad' : r.left! <= 90 ? 'warn' : 'ok'}>{status}</Tag>,
            r.tenant ? <><Link className="record-link" href={`/tenants/${r.tenant.id}`}>{r.tenant.name}</Link>{r.cur?.trade_name && <div className="cell-sub">{r.cur.trade_name}</div>}</> : <span className="muted">{r.last ? `آخر مستأجر: ${a.T.get(r.last.tenant_id)?.name ?? '—'}` : 'لم تؤجر من قبل'}</span>,
            date(r.cur?.end_date), money(r.cur?.annual_rent), r.vacantDays == null ? '—' : `${r.vacantDays} يوماً`, r.arrears ? <span className="amount-bad">{money(r.arrears)}</span> : '—'],
          actions, peekTitle: `${r.p.short} — ${r.u.code}`,
          peek: [['النوع', r.u.unit_type ?? ''], ['الدور', r.u.floor ?? ''], ['المساحة', r.u.area ? `${money(r.u.area)} م²` : ''], ['الحالة', status], ['المستأجر', r.tenant?.name ?? ''], ['الجوال', r.tenant?.phone ?? ''],
            ['مدة العقد', r.cur ? `${date(r.cur.start_date)} – ${date(r.cur.end_date)}` : ''], ['الإيجار السنوي', r.cur ? money(r.cur.annual_rent) : ''], ['المتأخر', r.arrears ? money(r.arrears) : '—'], ['وحدات فرعية', r.subs.length ? String(r.subs.length) : '']] as [string, string][],
        };
      })} /></div>}
    </Page>
  );
}
