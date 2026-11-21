import Link from 'next/link';
import DataTable from '@/components/DataTable';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Kpi, Empty } from '@/components/ui';
import { Ic } from '@/components/icons';
import { money, date } from '@/lib/fmt';
import { daysBetween } from '@/lib/calc';
const ST: Record<string, [string, string]> = { open: ['warn', 'مفتوح'], progress: ['info', 'قيد التنفيذ'], done: ['ok', 'مغلق'], cancelled: ['mute', 'ملغى'] };
export default async function Maint({ searchParams }: { searchParams: { s?: string } }) {
  const { db, a, org, asOf, canEdit } = await ctx(); const f = searchParams.s ?? 'active';
  const ms = db.maintenance.filter((m) => f === 'all' || (f === 'active' ? m.status === 'open' || m.status === 'progress' : m.status === f));
  const act = db.maintenance.filter((m) => m.status === 'open' || m.status === 'progress');
  return (
    <Page title="الصيانة" sub="طلبات الصيانة وأوامر العمل؛ تكلفة المغلق منها تُسجَّل تلقائياً في المصروفات" org={org} asOf={asOf} print actions={canEdit && <Link className="btn" href="/maintenance/new"><Ic n="tool" />طلب صيانة</Link>}>
      <div className="kpis"><Kpi tone="warn" l="طلبات مفتوحة" v={String(act.length)} s={`${act.filter((m) => m.priority === 'عاجلة').length} عاجلة`} />
        <Kpi l="متوسط عمر المفتوح" v={act.length ? `${Math.round(act.reduce((x, m) => x + daysBetween(m.opened_on, asOf), 0) / act.length)}` : '—'} unit="يوماً" />
        <Kpi tone="info" l={`تكلفة الصيانة ${a.year}`} v={money(db.maintenance.filter((m) => m.closed_on?.startsWith(a.year)).reduce((x, m) => x + (m.cost ?? 0), 0))} unit="ريال" />
        <Kpi l="أُغلقت هذا العام" v={String(db.maintenance.filter((m) => m.closed_on?.startsWith(a.year)).length)} /></div>
      <div className="filters">{[['active', 'المفتوحة'], ['progress', 'قيد التنفيذ'], ['done', 'المغلقة'], ['cancelled', 'الملغاة'], ['all', 'الكل']].map(([k, l]) => <Link key={k} href={`?s=${k}`} className={f === k ? 'on' : ''}>{l}</Link>)}</div>
      <div className="card table-card"><DataTable label="طلبات الصيانة" storageKey={`maintenance:${f}`} summaryColumns={[7]} columns={[
        {label:'التاريخ',kind:'date'},{label:'العقار / الوحدة',wide:true},{label:'الطلب',wide:true},{label:'الأولوية'},{label:'المقاول'},{label:'العمر بالأيام',numeric:true},{label:'التكلفة التقديرية',numeric:true,hidden:true},{label:'التكلفة الفعلية',numeric:true},{label:'الحالة'}
      ]} rows={ms.map(m=>{const place=[a.P.get(m.property_id)?.short,m.unit_id?a.U.get(m.unit_id)?.code:''].filter(Boolean).join(' — '),age=daysBetween(m.opened_on,m.closed_on||asOf);return {id:m.id,search:[place,m.title,m.details,m.priority,m.vendor,ST[m.status][1]].join(' '),values:[m.opened_on,place,m.title,m.priority,m.vendor,age,m.est_cost,m.cost,ST[m.status][1]],totals:{7:m.cost||0},cells:[date(m.opened_on),place,<Link href={`/maintenance/${m.id}`}>{m.title}</Link>,<Tag tone={m.priority==='عاجلة'?'bad':'mute'}>{m.priority}</Tag>,m.vendor||'—',age,m.est_cost!=null?money(m.est_cost):'—',m.cost!=null?money(m.cost):'لم تُسجل',<Tag tone={ST[m.status][0]}>{ST[m.status][1]}</Tag>]};})} /></div>
      <p className="table-hint">التكلفة الفعلية منفصلة عن التقديرية؛ إجمالي الجدول من التكاليف الفعلية المسجلة فقط. مؤشرات أعلى الصفحة تخص المحفظة، والجدول يتبع الفلاتر.</p>
    </Page>
  );
}
