import { ctx } from '@/lib/ctx';
import { Kpi } from '@/components/ui';
import ReportFrame from '@/components/ReportFrame';
import { q } from '@/lib/db';
import { parseReport, type SP } from '@/lib/report-params';

export default async function Activity({ searchParams }: { searchParams: SP }) {
  const { db, org, asOf, user } = await ctx();
  const rp = parseReport(searchParams, asOf, { preset: 'month', detail: 'detail' });
  const who = searchParams.u ?? '', act = searchParams.a ?? '';
  const rows = await q(`select id, at, username, action, entity, entity_id, details from activity_log
    where (at at time zone 'Asia/Riyadh')::date between $1 and $2 and ($3 = '' or username = $3) and ($4 = '' or action = $4) order by at desc limit 2000`, [rp.from, rp.to, who, act]);
  const users = (await q(`select distinct username from activity_log where username is not null order by 1`)).map((r) => r.username as string);
  const actions = (await q(`select distinct action from activity_log order by 1`)).map((r) => r.action as string);
  const byUser = new Map<string, number>(), byAct = new Map<string, number>();
  rows.forEach((r) => { byUser.set(r.username ?? '—', (byUser.get(r.username ?? '—') ?? 0) + 1); byAct.set(r.action, (byAct.get(r.action) ?? 0) + 1); });
  const fmtAt = (v: unknown) => new Date(String(v)).toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const sensitive = ['حذف', 'إلغاء', 'استعادة', 'تعديل الصلاحيات', 'اعتماد'];
  return (
    <ReportFrame id="activity" title="نشاط المستخدمين" sub="كل عملية في البرنامج بتاريخها ووقتها ومن نفّذها — للمراجعة الرقابية" sp={searchParams} rp={rp} db={db} org={org} asOf={asOf} userId={user.id} params={['period', 'detail']}
      extraScope={[who && `المستخدم: ${who}`, act && `العملية: ${act}`].filter(Boolean).join(' • ')}>
      <form method="get" className="filters-inline noprint">{Object.entries(searchParams).filter(([k, v]) => v && !['u', 'a', 'ok', 'err'].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="fld"><span>المستخدم</span><select name="u" defaultValue={who}><option value="">الكل</option>{users.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label className="fld"><span>نوع العملية</span><select name="a" defaultValue={act}><option value="">الكل</option>{actions.map((x) => <option key={x}>{x}</option>)}</select></label>
        <button className="btn sm" type="submit">تصفية</button></form>
      <div className="kpis">
        <Kpi l="عدد العمليات" v={String(rows.length)} s={rows.length >= 2000 ? 'أول 2000 عملية فقط' : undefined} />
        <Kpi l="المستخدمون النشطون" v={String(byUser.size)} />
        <Kpi l="عمليات حساسة" v={String(rows.filter((r) => sensitive.some((w) => String(r.action).includes(w))).length)} tone="warn" s="حذف، إلغاء، استعادة، اعتماد" />
        <Kpi l="أكثر عملية" v={[...byAct.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '—'} />
      </div>
      <div className="g2"><div className="card"><h2>حسب المستخدم</h2><ul className="list">{[...byUser.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => <li key={k}>{k}<b className="n">{v}</b></li>)}</ul></div>
        <div className="card"><h2>حسب العملية</h2><ul className="list">{[...byAct.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15).map(([k, v]) => <li key={k}>{k}<b className="n">{v}</b></li>)}</ul></div></div>
      {rp.detail === 'detail' && <div className="card"><h2>السجل</h2><div className="tbl"><table>
        <thead><tr><th className="n">الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={String(r.id)} className={sensitive.some((w) => String(r.action).includes(w)) ? 'row-flag' : ''}><td className="n">{fmtAt(r.at)}</td><td>{r.username ?? '—'}</td><td>{r.action}</td><td>{r.details ?? ''}</td></tr>)}</tbody></table></div></div>}
    </ReportFrame>
  );
}
