import Link from 'next/link';
import DataTable from '@/components/DataTable';
import { ctx } from '@/lib/ctx';
import { Page, Btn, XL, Empty } from '@/components/ui';
import { money, date } from '@/lib/fmt';

export default async function Expenses({ searchParams }: { searchParams: { p?: string; y?: string } }) {
  const { db, a, org, asOf, canEdit } = await ctx();
  const pid = searchParams.p, y = searchParams.y ?? a.year;
  const es = db.expenses.filter((e) => (!pid || e.property_id === pid) && (y === 'all' || e.date.startsWith(y)));
  const byCat = new Map<string, number>(); es.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount));
  const years = [...new Set([a.year, ...db.expenses.map((e) => e.date.slice(0, 4))])].sort().reverse();
  const q = (o: Record<string, string>) => '?' + new URLSearchParams({ ...(pid ? { p: pid } : {}), y, ...o }).toString();
  const total = es.reduce((x, e) => x + e.amount, 0);
  return (
    <Page title={'المصروفات والصيانة' + (pid ? ' — ' + a.P.get(pid)?.short : '')} sub={`${es.length} قيداً • ${money(total)} ريال • ${y === 'all' ? 'كل السنوات' : 'سنة ' + y}`} org={org} asOf={asOf} print
      actions={<>{canEdit && <Btn href={`/expenses/new${pid ? '?property=' + pid : ''}`}>＋ مصروف</Btn>}<XL r="expenses" q={'&' + new URLSearchParams({ ...(pid ? { p: pid } : {}), y }).toString()} /></>}>
      <div className="filters">{[...years, 'all'].map((x) => <Link key={x} href={q({ y: x })} className={y === x ? 'on' : ''}>{x === 'all' ? 'كل السنوات' : x}</Link>)}</div>
      <div className="filters"><Link href={'?' + new URLSearchParams({ y }).toString()} className={!pid ? 'on' : ''}>كل العقارات</Link>
        {db.properties.map((p) => <Link key={p.id} href={q({ p: p.id })} className={pid === p.id ? 'on' : ''}>{p.short}</Link>)}</div>
      {byCat.size > 0 && <div className="kpis">{[...byCat.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => <div key={k} className="kpi"><div className="l">{k}</div><div className="v">{money(v)}</div></div>)}</div>}
      <div className="card table-card"><DataTable label="المصروفات" storageKey={`expenses:${pid || ''}:${y}`} summaryColumns={[6]} columns={[
        {label:'التاريخ',kind:'date'}, {label:'العقار'}, {label:'البند'}, {label:'الوصف',wide:true}, {label:'المورد'}, {label:'المرجع'}, {label:'المبلغ',numeric:true}
      ]} rows={es.map(e=>({id:e.id,search:[e.date,a.P.get(e.property_id)?.name,e.category,e.description,e.vendor,e.ref,e.amount].join(' '),values:[e.date,a.P.get(e.property_id)?.name||'',e.category,e.description,e.vendor,e.ref,e.amount],totals:{6:e.amount},cells:[canEdit?<Link href={`/expenses/${e.id}`}>{date(e.date)}</Link>:date(e.date),a.P.get(e.property_id)?.short,e.category,e.description||'—',e.vendor||'—',e.ref||'—',money(e.amount)]}))} /></div>
    </Page>
  );
}
