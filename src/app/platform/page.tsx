import Link from 'next/link';
import { pq, MULTI } from '@/lib/db';
import { requirePlatform, PLANS, ORG_STATUS } from '@/lib/platform';
export const dynamic = 'force-dynamic';
const PL = Object.fromEntries(PLANS);
export default async function PlatformHome() {
  await requirePlatform();
  const orgs = await pq('select * from orgs order by created_at desc');
  const today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const active = orgs.filter((o) => o.status === 'active' && (!o.expires_on || String(o.expires_on) >= today));
  const expiring = orgs.filter((o) => o.status === 'active' && o.expires_on && String(o.expires_on) >= today && String(o.expires_on) <= soon);
  const log = await pq('select * from platform_log order by at desc limit 12');
  const base = process.env.AMLAK_BASE_DOMAIN;
  return <>
    <div className="pf-head"><h1>الجهات المشتركة</h1><Link className="btn" href="/platform/new">＋ جهة جديدة</Link></div>
    <div className="kpis"><div className="kpi"><div className="l">كل الجهات</div><div className="v">{orgs.length}</div></div><div className="kpi info"><div className="l">نشطة</div><div className="v">{active.length}</div></div>
      <div className={'kpi ' + (expiring.length ? 'warn' : '')}><div className="l">تنتهي خلال 30 يوماً</div><div className="v">{expiring.length}</div></div><div className="kpi"><div className="l">موقوفة أو منتهية</div><div className="v">{orgs.length - active.length}</div></div></div>
    <div className="card"><div className="tbl"><table><thead><tr><th>الجهة</th><th>رمز الدخول</th><th>الباقة</th><th className="n">المستخدمون</th><th>انتهاء الاشتراك</th><th>الحالة</th><th>التواصل</th></tr></thead>
      <tbody>{orgs.map((o) => { const exp = o.expires_on && String(o.expires_on) < today; return <tr key={o.slug}>
        <td><Link href={`/platform/org/${o.slug}`}><b>{o.name}</b></Link></td>
        <td dir="ltr">{base ? `${o.slug}.${base}` : o.slug}</td><td>{PL[o.plan] ?? o.plan}</td><td className="n">{o.max_users}</td>
        <td>{o.expires_on ? String(o.expires_on).split('-').reverse().join('/') : 'مفتوح'}</td>
        <td><span className={'tag t-' + (exp ? 'bad' : ORG_STATUS[o.status]?.[1] ?? 'mute')}>{exp ? 'منتهي الاشتراك' : ORG_STATUS[o.status]?.[0] ?? o.status}</span></td>
        <td>{o.contact_name}{o.contact_phone && <div className="muted" dir="ltr">{o.contact_phone}</div>}</td></tr>; })}
        {!orgs.length && <tr><td colSpan={7} className="muted">لا توجد جهات بعد. الجهة الأساسية (جمعيتكم) تعمل برمز «main» ولا تحتاج تسجيلاً.</td></tr>}</tbody></table></div></div>
    <div className="card"><h2>آخر العمليات</h2><ul className="tl">{log.map((l) => <li key={l.id}><b>{new Date(l.at).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' })}</b> — {l.username}: {l.action}{l.org ? ` • ${l.org}` : ''}{l.details ? ` • ${l.details}` : ''}</li>)}</ul></div>
    {!MULTI && <p className="muted">ملاحظة: لاختبار الجهات على جهازك شغّل البرنامج بوضع تعدد الجهات. التفاصيل في دليل الاستضافة المرفق مع التحديث.</p>}
  </>;
}
