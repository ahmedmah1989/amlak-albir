import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import MaintForm from '../MaintForm';
export default async function New({ searchParams }: { searchParams: { property?: string } }) {
  const { db, org, asOf } = await ctx('accountant');
  return <Page title="طلب صيانة جديد" org={org} asOf={asOf} back={['/maintenance', 'الصيانة']}><div className="card"><MaintForm props={db.properties} units={db.units} pid={searchParams.property} today={asOf} /></div></Page>;
}
