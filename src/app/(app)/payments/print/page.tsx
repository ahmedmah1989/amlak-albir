import { ctx } from '@/lib/ctx';
import { Page, Empty } from '@/components/ui';
import Receipt from '../[id]/page';

export default async function BulkReceipts({ searchParams }: { searchParams: { ids?: string } }) {
  const { db, org, asOf } = await ctx();
  const ids = (searchParams.ids ?? '').split(',').filter((id) => db.payments.some((p) => p.id === id)).slice(0, 100);
  if (!ids.length) return <Page title="طباعة سندات" org={org} asOf={asOf} back={['/payments', 'سندات القبض']}><Empty>حدد السندات من الجدول أولاً.</Empty></Page>;
  return (
    <Page title={`إعادة طباعة ${ids.length} سند قبض`} sub="كل سند في صفحة مستقلة" org={org} asOf={asOf} print back={['/payments', 'سندات القبض']}>
      {ids.map((id) => <section key={id} className="bulk-doc"><Receipt params={{ id }} /></section>)}
    </Page>
  );
}
