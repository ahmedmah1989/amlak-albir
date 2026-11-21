import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { REPORTS, REPORT_GROUPS } from '@/lib/reports-catalog';
import { normalizeSearch } from '@/lib/table-view';
import { toggleFavorite } from '@/lib/report-actions';

export default async function Reports({ searchParams }: { searchParams: { q?: string } }) {
  const { db, org, asOf, user } = await ctx();
  const F = db.meta.features as Record<string, boolean>;
  const term = normalizeSearch(searchParams.q ?? '');
  const list = REPORTS.filter((r) => !r.feature || F[r.feature]).filter((r) => !term || normalizeSearch(r.title + ' ' + r.desc + ' ' + r.group).includes(term));
  const mine = await q(`select * from saved_reports where (user_id=$1) or (kind='saved' and shared) order by created_at desc`, [user.id]);
  const favs = new Set(mine.filter((x) => x.kind === 'fav' && x.user_id === user.id).map((x) => x.report_id as string));
  const saved = mine.filter((x) => x.kind === 'saved');
  const card = (r: (typeof REPORTS)[number]) => <div key={r.id} className="rep-card">
    <Link href={r.href}><b>{r.title}</b><span>{r.desc}</span></Link>
    <div className="rep-tags">{r.isNew && <Tag tone="info">جديد</Tag>}
      <form action={toggleFavorite} className="inline noprint"><input type="hidden" name="report_id" value={r.id} /><input type="hidden" name="back" value="/reports" />
        <button className={'star-btn' + (favs.has(r.id) ? ' on' : '')} title={favs.has(r.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'} aria-label="المفضلة">{favs.has(r.id) ? '★' : '☆'}</button></form></div></div>;
  return (
    <Page title="مركز التقارير" sub={`${list.length} تقريراً • كل تقرير بلوحة معايير موحدة: الفترة والمقارنة والنطاق والعرض والطباعة`} org={org} asOf={asOf}
      actions={<><Link className="btn ghost" href="/reports/saved">تقاريري المحفوظة ({saved.length})</Link><Link className="btn" href="/reports/pack">حزمة تقارير المجلس</Link></>}>
      <form className="rep-search noprint" method="get"><input name="q" type="search" defaultValue={searchParams.q} placeholder="ابحث عن تقرير: تحصيل، إشغال، تأمين، ضريبة…" /><button className="btn sm" type="submit">بحث</button>{term && <Link href="/reports">مسح</Link>}</form>
      {!term && favs.size > 0 && <><h2 className="gh">المفضلة</h2><div className="rep">{REPORTS.filter((r) => favs.has(r.id)).map(card)}</div></>}
      {!term && saved.length > 0 && <><h2 className="gh">آخر التقارير المحفوظة</h2><div className="rep">{saved.slice(0, 4).map((s) => <div key={s.id} className="rep-card"><Link href={s.href}><b>{s.name}</b><span>{REPORTS.find((r) => r.id === s.report_id)?.title}{s.shared ? ' • مشترك' : ''}</span></Link></div>)}</div></>}
      {REPORT_GROUPS.map((g) => { const rs = list.filter((r) => r.group === g); return rs.length ? <div key={g}><h2 className="gh">{g}</h2><div className="rep">{rs.map(card)}</div></div> : null; })}
      {list.length === 0 && <p className="muted">لا يوجد تقرير مطابق.</p>}
    </Page>
  );
}
