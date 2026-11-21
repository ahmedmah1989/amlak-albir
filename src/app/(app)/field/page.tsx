import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import { money, date } from '@/lib/fmt';
import { waLink, waTemplates } from '@/lib/messages';
import { daysBetween } from '@/lib/calc';
import { recordVisit } from '@/lib/field-actions';
import LocateButton from '@/components/LocateButton';
export const dynamic = 'force-dynamic';
const RESULTS = ['زيارة ميدانية', 'وعد بالسداد', 'سدّد جزءاً', 'لم يُعثر عليه', 'رفض السداد', 'طلب مهلة', 'اتصال هاتفي'];
/** الوضع الميداني لموظف التحصيل: قائمة زيارات اليوم بأزرار كبيرة للاتصال والواتساب والسند وتسجيل الزيارة */
export default async function Field({ searchParams }: { searchParams: { all?: string; q?: string } }) {
  const { db, a, org, asOf, user, canEdit } = await ctx();
  const mine = db.meta.features.collection_plan && searchParams.all !== '1';
  const base = a.tenantStats.filter((t) => t.arrears > 0 || t.rows.some((r) => r.balance > 0 && r.due_date <= asOf));
  const assigned = base.filter((t) => t.t.collector === user.id);
  const list0 = mine && assigned.length ? assigned : base;
  const qq = (searchParams.q ?? '').trim();
  const list = list0.filter((t) => !qq || t.t.name.includes(qq) || t.activeContracts.some((c) => (a.P.get(c.property_id)?.short ?? '').includes(qq)))
    .map((t) => ({ t, dueFollow: !!t.nextFollow && t.nextFollow <= asOf, noFollow: !t.lastFollow || daysBetween(t.lastFollow.date, asOf) > 30 }))
    .sort((x, y) => Number(y.dueFollow) - Number(x.dueFollow) || y.t.arrears - x.t.arrears);
  const total = list.reduce((n, x) => n + x.t.arrears, 0);
  return (
    <Page title="الوضع الميداني" sub={`${list.length} مستأجر • متأخرات ${money(total)} ريال${mine && assigned.length ? ' • المسندون لك' : ''}`} org={org} asOf={asOf}>
      <div className="fm-bar noprint">
        <form method="get" className="fm-search"><input name="q" defaultValue={qq} placeholder="ابحث باسم المستأجر أو العقار" aria-label="بحث" />{searchParams.all && <input type="hidden" name="all" value="1" />}</form>
        {db.meta.features.collection_plan && <div className="seg"><Link href="/field" className={searchParams.all !== '1' ? 'on' : ''}>المسندون لي</Link><Link href="/field?all=1" className={searchParams.all === '1' ? 'on' : ''}>الكل</Link></div>}
      </div>
      {mine && !assigned.length && <p className="note">لا يوجد مستأجرون مسندون لك في خطة التحصيل؛ تظهر كل الحالات.</p>}
      <div className="fm-list">{list.map(({ t: s, dueFollow, noFollow }) => {
        const nextR = s.rows.filter((r) => r.balance > 0 && r.due_date >= asOf).sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
        const tpl = waTemplates({ org, name: s.t.name, arrears: s.arrears, overdueCount: s.overdueCount, next: nextR ? { amount: nextR.balance, due: nextR.due_date } : null });
        const wa = waLink(s.t.phone, (tpl.find((x) => x.key === 'claim') ?? tpl[0])?.text ?? '');
        const units = s.activeContracts.map((c) => `${a.P.get(c.property_id)?.short} ${a.U.get(c.unit_id)?.code}`).join('، ');
        return <article key={s.t.id} id={`t-${s.t.id}`} className={'fm-card' + (dueFollow ? ' due' : '')}>
          <header><div><h2><Link href={`/tenants/${s.t.id}`}>{s.t.name}</Link></h2><small>{units || 'بلا عقد ساري'}</small></div>
            <div className="fm-amt"><b>{money(s.arrears)}</b><small>{s.overdueCount} أقساط • أقدم تأخير {s.maxLate} يوماً</small></div></header>
          <div className="fm-tags">{dueFollow && <Tag tone="warn">موعد متابعة اليوم</Tag>}{noFollow && <Tag tone="bad">بلا متابعة 30 يوماً</Tag>}{s.lastFollow && <span className="muted">آخر متابعة {date(s.lastFollow.date)}: {s.lastFollow.type}</span>}</div>
          <div className="fm-acts">
            {s.t.phone ? <a className="fm-btn" href={`tel:${s.t.phone}`}>اتصال</a> : <span className="fm-btn off">لا جوال</span>}
            {wa ? <a className="fm-btn wa" href={wa} target="_blank" rel="noopener">واتساب</a> : <span className="fm-btn off">واتساب</span>}
            {canEdit && <Link className="fm-btn pri" href={`/payments/new?tenant=${s.t.id}`}>سند قبض</Link>}
            {canEdit && <Link className="fm-btn" href={`/paylinks/new?tenant=${s.t.id}`}>رابط دفع</Link>}
          </div>
          {canEdit && <details className="fm-visit"><summary>تسجيل زيارة / نتيجة</summary>
            <form action={recordVisit} className="frm"><input type="hidden" name="tenant_id" value={s.t.id} />
              <div className="fm-res">{RESULTS.map((r, i) => <label key={r}><input type="radio" name="result" value={r} defaultChecked={i === 0} /><span>{r}</span></label>)}</div>
              <label className="fld"><span>ملاحظات</span><textarea name="details" rows={2} /></label>
              <div className="grid"><label className="fld"><span>موعد المتابعة القادمة</span><input type="date" name="next_date" /></label>
                <label className="fld"><span>صورة (اختياري)</span><input type="file" name="photo" accept="image/*" capture="environment" /></label></div>
              <LocateButton /><div className="fa"><button className="btn" type="submit">حفظ الزيارة</button></div></form></details>}
        </article>; })}
        {!list.length && <p className="muted empty card">لا توجد حالات تحصيل مفتوحة.</p>}</div>
    </Page>
  );
}
