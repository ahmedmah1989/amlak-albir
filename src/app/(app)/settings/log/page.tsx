import { ctx } from '@/lib/ctx';
import { q } from '@/lib/db';
import { Page } from '@/components/ui';
export default async function Log() {
  const { org, asOf } = await ctx('admin');
  const rows = await q(`select to_char(at at time zone 'Asia/Riyadh','DD/MM/YYYY HH24:MI') t, username, action, details from activity_log order by id desc limit 300`);
  return (
    <Page title="سجل العمليات" sub="آخر 300 عملية — من سجّل ماذا ومتى" org={org} asOf={asOf} print>
      <div className="card"><div className="tbl"><table><thead><tr><th className="n">الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td className="n">{r.t}</td><td>{r.username}</td><td>{r.action}</td><td className="muted">{r.details}</td></tr>)}</tbody></table></div></div>
    </Page>
  );
}
