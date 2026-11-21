import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import TenantForm from '../../TenantForm';
export default async function EditTenant({ params }: { params: { id: string } }) {
  const { a, org, asOf } = await ctx('accountant'); const t = a.T.get(params.id); if (!t) notFound();
  return <Page title={`تعديل: ${t.name}`} org={org} asOf={asOf} back={[`/tenants/${t.id}`, t.name]}><div className="card"><TenantForm t={t} /></div></Page>;
}
