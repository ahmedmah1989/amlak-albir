import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { money, date } from '@/lib/fmt';
import { daysBetween } from '@/lib/calc';
import { followUpQueue } from '@/lib/followup-view';
export default async function FollowUps() {
  const {db,a,org,asOf}=await ctx(),queue=followUpQueue(db,a,asOf);
  return <Page title="المتابعة مع المستأجرين" sub={`${db.followups.length} إجراء مسجل · ${queue.length} مستأجرًا يحتاج متابعة الآن`} org={org} asOf={asOf} print>
    <div className="screen-intro"><h2>من نتيجة الاتصال إلى الخطوة التالية</h2><p>قائمة موحدة لمن يحتاج متابعة، ثم سجل كامل للإجراءات. اختر عروضك واحفظ بحثك وأعمدتك لكل جدول بشكل مستقل.</p><Link className="btn ghost" href="/">فتح مركز العمل اليومي</Link></div>
    <section className="card table-card"><div className="grid-section-title"><h2>يحتاج متابعة الآن</h2><span>{queue.length} مستأجرًا دون تكرار</span></div><DataTable label="قائمة المتابعة" storageKey="followups-due" summaryColumns={[1]} columns={[
      {label:'المستأجر',wide:true},{label:'المتأخرات المؤكدة',numeric:true},{label:'آخر متابعة',kind:'date'},{label:'منذ / يوم',numeric:true,hidden:true},{label:'سبب الظهور',wide:true},{label:'الموعد التالي',kind:'date'}
    ]} rows={queue.map(t=>({id:t.id,search:[t.name,...t.reasons,t.last?.type].join(' '),values:[t.name,t.arrears,t.last?.date||null,t.last?daysBetween(t.last.date,asOf):null,t.reasons.join(' · '),t.last?.next_date||null],totals:{1:t.arrears},cells:[<Link href={`/tenants/${t.id}#tab=followups`}>{t.name}</Link>,money(t.arrears),t.last?date(t.last.date):<Tag tone="bad">لا توجد</Tag>,t.last?daysBetween(t.last.date,asOf):'—',t.reasons.join(' · '),date(t.last?.next_date)]}))}/></section>
    <section className="card table-card"><div className="grid-section-title"><h2>كل الإجراءات المسجلة</h2><span>السجل التاريخي محفوظ بالكامل</span></div><DataTable label="سجل الإجراءات" storageKey="followups-history" columns={[
      {label:'التاريخ',kind:'date'},{label:'المستأجر',wide:true},{label:'نوع الإجراء'},{label:'النتيجة والتفاصيل',wide:true},{label:'المتابعة التالية',kind:'date'},{label:'بواسطة'}
    ]} rows={db.followups.map(f=>({id:f.id,search:[a.T.get(f.tenant_id)?.name,f.type,f.details,f.created_by].join(' '),values:[f.date,a.T.get(f.tenant_id)?.name||'',f.type,f.details,f.next_date,f.created_by],cells:[date(f.date),<Link href={`/tenants/${f.tenant_id}#tab=followups`}>{a.T.get(f.tenant_id)?.name||'—'}</Link>,<Tag tone="info">{f.type}</Tag>,f.details||'—',date(f.next_date),f.created_by||'الملف الأصلي']}))}/></section>
  </Page>;
}
