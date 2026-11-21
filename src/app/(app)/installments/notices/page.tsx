import { ctx } from '@/lib/ctx';
import { Page, Empty } from '@/components/ui';
import Notice from '../[id]/notice/page';

export default async function BulkNotices({ searchParams }: { searchParams: { ids?: string; by?: string } }) {
  const { a, org, asOf } = await ctx();
  const raw = (searchParams.ids ?? '').split(',').filter(Boolean);
  // by=contract: أقرب قسط مفتوح لكل عقد محدد (المتأخر أولاً ثم القادم)
  const mapped = searchParams.by === 'contract' ? raw.map((cid) => a.rows.filter((r) => r.contract_id === cid && r.balance > 0).sort((x, y) => x.due_date.localeCompare(y.due_date))[0]?.id).filter(Boolean) as string[] : raw;
  const ids = mapped.filter((id) => a.rows.some((r) => r.id === id)).slice(0, 100);
  if (!ids.length) return <Page title="إشعارات المطالبة" org={org} asOf={asOf} back={['/installments', 'الأقساط']}><Empty>حدد الأقساط من الجدول أولاً.</Empty></Page>;
  return (
    <Page title={`إشعارات مطالبة — ${ids.length} قسط`} sub="كل إشعار في صفحة مستقلة" org={org} asOf={asOf} print back={['/installments', 'الأقساط']}>
      {ids.map((id) => <section key={id} className="bulk-doc"><Notice params={{ id }} /></section>)}
    </Page>
  );
}
