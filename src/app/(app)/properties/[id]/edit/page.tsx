import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import PropertyForm from '../../PropertyForm';
export default async function EditProperty({ params }: { params: { id: string } }) {
  const { a, org, asOf } = await ctx('admin'); const p = a.P.get(params.id); if (!p) notFound();
  return <Page title={`تعديل: ${p.name}`} org={org} asOf={asOf} back={[`/properties/${p.id}`, p.name]}><div className="card"><PropertyForm p={p} /></div></Page>;
}
