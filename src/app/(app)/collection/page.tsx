import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Kpi, Empty } from '@/components/ui';
import { Hidden } from '@/components/form';
import { setCollector, logCall } from '@/lib/actions4';
import { waLink, waTemplates } from '@/lib/messages';
import { money, date } from '@/lib/fmt';
import { addDays, daysBetween } from '@/lib/calc';

const RESULTS = ['تم التواصل', 'وعد بالسداد', 'لم يرد', 'رفض / اعتراض', 'رسالة', 'سدد'];
export default async function Collection({ searchParams }: { searchParams: { who?: string } }) {
  const { db, a, org, asOf, canEdit, user } = await ctx();
  if (!db.meta.features.collection_plan) return <Page title="خطة التحصيل" org={org} asOf={asOf}><Empty>الميزة غير مفعّلة. فعّلها من الإدارة ← الميزات.</Empty></Page>;
  const staff = db.users.filter((u) => u.active && u.role !== 'viewer');
  const who = searchParams.who ?? 'all';
  const debtors = a.tenantStats.filter((s) => s.arrears > 0 || s.rows.some((r) => r.balance > 0 && r.status === 'due'))
    .filter((s) => who === 'all' || (who === 'none' ? !s.t.collector : who === 'me' ? s.t.collector === user.id : s.t.collector === who))
    .map((s) => ({ s, dueNow: s.rows.filter((r) => r.balance > 0 && (r.status === 'overdue' || r.status === 'due')).reduce((x, r) => x + r.balance, 0), next: s.nextFollow }))
    .sort((x, y) => (x.next && x.next <= asOf ? 0 : 1) - (y.next && y.next <= asOf ? 0 : 1) || y.dueNow - x.dueNow);
  const todayList = debtors.filter((d) => !d.next || d.next <= asOf);
  const name = (id: string | null) => staff.find((u) => u.id === id)?.full_name ?? '—';
  const q = (w: string) => `?who=${w}`;
  return (
    <Page title="خطة التحصيل" sub="المتأخرون مرتبون: من حان موعد متابعته أولاً ثم الأكبر مبلغاً" org={org} asOf={asOf} print>
      <div className="filters"><Link href={q('all')} className={who === 'all' ? 'on' : ''}>الكل</Link><Link href={q('me')} className={who === 'me' ? 'on' : ''}>مهامي</Link><Link href={q('none')} className={who === 'none' ? 'on' : ''}>بدون موظف</Link>
        {staff.map((u) => <Link key={u.id} href={q(u.id)} className={who === u.id ? 'on' : ''}>{u.full_name}</Link>)}</div>
      <div className="kpis">
        <Kpi tone="bad" l="المستحق على القائمة" v={money(debtors.reduce((x, d) => x + d.dueNow, 0))} unit="ريال" s={`${debtors.length} مستأجر`} />
        <Kpi tone="warn" l="متابعة اليوم" v={String(todayList.length)} s="لم يُتابَعوا أو حان موعدهم" />
        <Kpi l="بدون موظف تحصيل" v={String(a.tenantStats.filter((s) => s.arrears > 0 && !s.t.collector).length)} />
        <Kpi l="وعود سداد قادمة" v={String(debtors.filter((d) => d.next && d.next > asOf && d.s.lastFollow?.type === 'وعد بالسداد').length)} />
      </div>
      {canEdit && <form action={setCollector} className="card frm noprint"><Hidden n="back" v={`/collection${q(who)}`} />
        <h2>تعيين موظف التحصيل</h2>
        <div className="reqdocs">{a.tenantStats.filter((s) => s.arrears > 0 || s.activeContracts.length).map((s) => <label key={s.t.id} className="tag t-mute" style={{ cursor: 'pointer' }}><input type="checkbox" name="tenant" value={s.t.id} /> {s.t.name} <small>({name(s.t.collector)})</small></label>)}</div>
        <div className="grid"><label className="fld"><span>الموظف</span><select name="collector"><option value="">بدون</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label></div>
        <div className="fa"><button className="btn" type="submit">تعيين للمحددين</button></div></form>}
      {!debtors.length ? <Empty>لا يوجد متأخرون في هذه القائمة.</Empty> : debtors.map(({ s, dueNow, next }) => {
        const nextR = s.rows.filter((r) => r.balance > 0 && r.due_date >= asOf).sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
        const wa = waTemplates({ org, name: s.t.name, trade: s.contracts[0]?.trade_name, arrears: s.arrears, overdueCount: s.overdueCount, next: nextR ? { amount: nextR.balance, due: nextR.due_date } : null });
        const due = !next || next <= asOf;
        return <div key={s.t.id} className="card"><h2><Link href={`/tenants/${s.t.id}`}>{s.t.name}</Link> <small>{money(dueNow)} ريال • {s.overdueCount} أقساط • أقدم {s.maxLate} يوماً • الموظف: {name(s.t.collector)}</small> {due ? <Tag tone="bad">متابعة اليوم</Tag> : <Tag tone="info">المتابعة {date(next)}</Tag>}</h2>
          <p className="muted">آخر متابعة: {s.lastFollow ? `${date(s.lastFollow.date)} — ${s.lastFollow.type}${s.lastFollow.details ? ' — ' + s.lastFollow.details : ''}` : 'لا توجد'}{s.lastPayment ? ` • آخر سداد ${date(s.lastPayment.paid_on)} (${daysBetween(s.lastPayment.paid_on, asOf)} يوماً)` : ''}</p>
          <div className="wa noprint">{s.t.phone ? <a href={`tel:${s.t.phone}`}>📞 {s.t.phone}</a> : <Tag tone="warn">لا يوجد جوال</Tag>}{wa.map((m) => { const h = waLink(s.t.phone, m.text); return h ? <a key={m.key} href={h} target="_blank" rel="noopener noreferrer">واتساب: {m.label}</a> : null; })}</div>
          {canEdit && <form action={logCall} className="frm noprint"><Hidden n="tenant_id" v={s.t.id} /><Hidden n="back" v={`/collection${q(who)}`} /><div className="grid">
            <label className="fld"><span>النتيجة</span><select name="result" required defaultValue=""><option value="" disabled>اختر</option>{RESULTS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="fld"><span>المبلغ الموعود</span><input type="number" name="promise_amount" min="0" /></label>
            <label className="fld"><span>المتابعة التالية</span><input type="date" name="next_date" defaultValue={addDays(asOf, 7)} /></label>
            <label className="fld wide"><span>ملاحظة</span><input name="details" /></label></div>
            <div className="fa"><button className="btn sm" type="submit">تسجيل النتيجة</button></div></form>}
        </div>;
      })}
    </Page>
  );
}
