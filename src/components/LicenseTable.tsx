import Link from 'next/link';
import { Tag } from './ui';
import { date } from '@/lib/fmt';
import { licState } from '@/lib/ops';
import { deleteLicense } from '@/lib/ops-actions';
export default function LicenseTable({ rows, props, back, isAdmin, showProp = true, files }: { rows: Record<string, any>[]; props: Map<string, { short: string }>; back: string; isAdmin: boolean; showProp?: boolean; files: Record<string, number> }) {
  return <div className="tbl"><table><thead><tr>{showProp && <th>العقار</th>}<th>المستند</th><th>الرقم / الجهة</th><th>الإصدار</th><th>الانتهاء</th><th>الحالة</th><th>المرفقات</th><th /></tr></thead><tbody>
    {rows.map((l) => { const [sl, tone] = licState(l.expiry_date ? String(l.expiry_date) : null); return <tr key={l.id}>
      {showProp && <td><Link href={`/properties/${l.property_id}?tab=compliance`}>{props.get(l.property_id)?.short}</Link></td>}<td><b>{l.kind}</b>{l.notes && <div className="cell-sub">{l.notes}</div>}</td>
      <td>{l.number ?? '—'}{l.issuer && <div className="cell-sub">{l.issuer}</div>}</td><td>{date(l.issue_date ? String(l.issue_date) : null)}</td><td>{date(l.expiry_date ? String(l.expiry_date) : null)}</td>
      <td><Tag tone={tone}>{sl}</Tag></td><td>{files[l.id] ? `${files[l.id]} ملف` : '—'}</td>
      <td>{isAdmin && <form action={deleteLicense} className="inline"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="back" value={back} /><button className="btn sm ghost danger" type="submit">حذف</button></form>}</td></tr>; })}
    {!rows.length && <tr><td colSpan={8} className="muted">لا توجد مستندات نظامية مسجلة.</td></tr>}</tbody></table></div>;
}
