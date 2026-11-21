import { ctx } from '@/lib/ctx';
import { Page, Empty } from '@/components/ui';
import Letter from '../[id]/letter/page';

/** طباعة خطابات لعدة مستأجرين دفعة واحدة — كل خطاب في صفحة */
export default async function BulkLetters({ searchParams }: { searchParams: { ids?: string; type?: string; by?: string } }) {
  const { a, org, asOf } = await ctx();
  const raw = (searchParams.ids ?? '').split(',').filter(Boolean);
  const ids = [...new Set(searchParams.by === 'contract' ? raw.map((cid) => a.C.get(cid)?.tenant_id).filter(Boolean) as string[] : raw)].filter((id) => a.T.get(id)).slice(0, 100);
  const type = ['reminder', 'claim', 'warning'].includes(searchParams.type ?? '') ? searchParams.type! : 'claim';
  const L: Record<string, string> = { reminder: 'تذكير', claim: 'مطالبة', warning: 'إنذار' };
  if (!ids.length) return <Page title="طباعة خطابات" org={org} asOf={asOf} back={['/tenants', 'المستأجرون']}><Empty>حدد المستأجرين من الجدول أولاً.</Empty></Page>;
  return (
    <Page title={`خطابات ${L[type]} — ${ids.length} مستأجر`} sub="كل خطاب في صفحة مستقلة. اطبع من زر الطباعة، ثم سجّل المتابعة من ملف كل مستأجر إن لزم." org={org} asOf={asOf} print back={['/tenants', 'المستأجرون']}>
      <div className="noprint chips-row">{Object.entries(L).map(([k, l]) => <a key={k} className={'btn sm' + (k === type ? '' : ' ghost')} href={`?type=${k}&ids=${ids.join(',')}`}>{l}</a>)}</div>
      {ids.map((id) => <section key={id} className="bulk-doc"><Letter params={{ id }} searchParams={{ type }} /></section>)}
    </Page>
  );
}
