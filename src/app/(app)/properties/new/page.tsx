import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import PropertyForm from '../PropertyForm';
export default async function NewProperty() {
  const { org, asOf } = await ctx('admin');
  return <Page title="إضافة عقار" org={org} asOf={asOf} back={['/properties', 'العقارات']}><div className="card"><PropertyForm /></div></Page>;
}
