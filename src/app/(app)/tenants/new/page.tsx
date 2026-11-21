import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import TenantForm from '../TenantForm';
export default async function NewTenant() {
  const { org, asOf } = await ctx('accountant');
  return <Page title="إضافة مستأجر" org={org} asOf={asOf} back={['/tenants', 'المستأجرون']}><div className="card"><TenantForm /></div></Page>;
}
