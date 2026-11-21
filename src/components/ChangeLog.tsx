import { q } from '@/lib/db';
import { Empty } from './ui';

/** سجل التغييرات (قبل/بعد) لسجل معيّن */
export default async function ChangeLog({ entity, id, title = 'سجل التغييرات' }: { entity: string; id: string; title?: string }) {
  const rows = await q('select * from record_changes where entity=$1 and entity_id=$2 order by at desc, id desc limit 300', [entity, id]);
  const t = (v: unknown) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(String(v))).replace(',', '');
  return <div className="card"><h2>{title} ({rows.length})</h2>
    {!rows.length ? <Empty>لا توجد تعديلات مسجلة على هذا السجل منذ تفعيل السجل.</Empty> : <div className="tbl"><table>
      <thead><tr><th className="n">الوقت</th><th>المستخدم</th><th>الحقل</th><th>القيمة السابقة</th><th>القيمة الجديدة</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td className="n">{t(r.at)}</td><td>{r.username}</td><td>{r.label ?? r.field}</td><td className="muted">{r.old_value ?? '—'}</td><td><b>{r.new_value ?? '—'}</b></td></tr>)}</tbody></table></div>}
  </div>;
}
