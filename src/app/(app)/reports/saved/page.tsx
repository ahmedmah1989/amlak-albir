import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Empty, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { REPORTS } from '@/lib/reports-catalog';
import { deleteSavedReport } from '@/lib/report-actions';

export default async function Saved() {
  const { org, asOf, user } = await ctx();
  const rows = await q(`select s.*, u.full_name from saved_reports s left join users u on u.id=s.user_id where s.kind='saved' and (s.user_id=$1 or s.shared) order by s.created_at desc`, [user.id]);
  return (
    <Page title="تقاريري المحفوظة" sub="تقارير حفظتها بمعاييرها (الفترة والعقار والتجميع وخيارات الطباعة). تفتح دائماً ببيانات اليوم." org={org} asOf={asOf} back={['/reports', 'مركز التقارير']}>
      {rows.length === 0 ? <Empty>لا توجد تقارير محفوظة. افتح أي تقرير، اضبط معاييره، ثم اضغط «حفظ كتقرير».</Empty> :
        <div className="card"><div className="tbl"><table><thead><tr><th>الاسم</th><th>التقرير</th><th>المعايير</th><th>أنشأه</th><th>المشاركة</th><th className="noprint"></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td><Link href={r.href}><b>{r.name}</b></Link></td><td>{REPORTS.find((x) => x.id === r.report_id)?.title ?? r.report_id}</td>
            <td className="cell-sub" dir="ltr" style={{ maxWidth: '22rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decodeURIComponent(String(r.href).split('?')[1] ?? '—')}</td>
            <td>{r.user_id === user.id ? 'أنا' : r.full_name}</td><td>{r.shared ? <Tag tone="info">مشترك</Tag> : 'خاص'}</td>
            <td className="noprint">{(r.user_id === user.id || user.role === 'admin') && <form action={deleteSavedReport} className="inline"><input type="hidden" name="id" value={r.id} /><button className="btn sm ghost" type="submit">حذف</button></form>}</td></tr>)}</tbody></table></div></div>}
    </Page>
  );
}
