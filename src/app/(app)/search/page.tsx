import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Empty, Tag } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { searchRecords, SEARCH_TYPES } from '@/lib/search';

export default async function SearchPage({ searchParams }: { searchParams: { q?: string; type?: string } }) {
  const { db, a, org, asOf } = await ctx();
  const query = searchParams.q?.trim() ?? '', type = searchParams.type && SEARCH_TYPES[searchParams.type] ? searchParams.type : 'all';
  const hits = searchRecords(db, a, query, type);
  return <Page title="البحث الشامل" sub="ابحث عن المستأجر أو رقم العقد أو العقار أو الوحدة أو رقم السند والمرجع البنكي." org={org} asOf={asOf}>
    <form action="/search" method="get" className="filter-panel">
      <label className="table-search"><span>كلمة البحث</span><input type="search" name="q" defaultValue={query} placeholder="اكتب الاسم أو الرقم…" required autoFocus /></label>
      <label className="fld"><span>نوع السجل</span><select name="type" defaultValue={type}><option value="all">كل الأنواع</option>{Object.entries(SEARCH_TYPES).map(([k, label]) => <option value={k} key={k}>{label}</option>)}</select></label>
      <button type="submit" className="btn">بحث</button>
    </form>
    {!query ? <div className="card"><Empty>ابدأ بكتابة اسم أو رقم، ثم افتح النتيجة المطلوبة مباشرة.</Empty></div> : <div className="card table-card"><DataTable label="نتائج البحث" storageKey={`search:${query}:${type}`} columns={[
      { label: 'النوع' }, { label: 'السجل', wide: true }, { label: 'التفاصيل', wide: true },
    ]} rows={hits.map((hit) => ({ id: hit.id, search: hit.search, values: [SEARCH_TYPES[hit.kind], hit.label, hit.description], cells: [<Tag tone="info">{SEARCH_TYPES[hit.kind]}</Tag>, <Link className="record-link" href={hit.href}>{hit.label}</Link>, hit.description] }))} /></div>}
  </Page>;
}
