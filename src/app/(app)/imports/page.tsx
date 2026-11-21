import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Empty } from '@/components/ui';
import { q } from '@/lib/db';
import { uploadImport } from '@/lib/actions8';
import { IMPORT_STATUS as ST } from '@/lib/fmt';

export default async function Imports() {
  const { org, asOf } = await ctx('admin');
  const bs = await q('select id,batch_no,file_name,source_kind,status,summary,created_by,created_at,committed_at from import_batches order by created_at desc');
  return (
    <Page title="استيراد البيانات" sub="ارفع ملف إكسل، راجع المعاينة (جديد / تعديل / خطأ) ومقارنة قبل وبعد لكل حقل، ثم اعتمد. كل دفعة يمكن التراجع عنها ما لم تُسجَّل عليها سندات." org={org} asOf={asOf}>
      <div className="g2">
        <div className="card"><h2>رفع ملف جديد</h2>
          <form action={uploadImport} className="frm"><div className="grid">
            <label className="fld wide"><span>ملف إكسل (.xlsx)</span><input type="file" name="file" accept=".xlsx,.xls" required /></label>
            <label className="fld"><span>نوع الملف</span><select name="kind" defaultValue="auto"><option value="auto">تعرّف تلقائي</option><option value="template">النموذج الموحد</option><option value="legacy">ملف متابعة الإيجارات الحالي</option></select></label>
          </div><div className="fa"><button className="btn" type="submit">قراءة الملف ومعاينته</button></div></form>
          <p className="muted">لا يُحفظ أي شيء قبل الاعتماد. الملف الأصلي يُحفظ مرفقاً بالدفعة.</p></div>
        <div className="card"><h2>النموذج الموحد</h2>
          <p>خمس أوراق: العقارات، الوحدات، المستأجرون، العقود، الأقساط. كل حقل في عمود مستقل وبدون دمج خلايا، والربط بين الأوراق بالاسم.</p>
          <a className="btn ghost" href="/api/import-template">⬇ تنزيل النموذج</a>
          <p className="muted">ملف «متابعة الإيجارات» الحالي يُقرأ مباشرة أيضاً: أوراق العقد الكامل مع كشف الدفعات، وجداول الوحدات والشقق.</p></div>
      </div>
      <div className="card"><h2>دفعات الاستيراد ({bs.length})</h2>{!bs.length ? <Empty>لا توجد دفعات بعد.</Empty> : <div className="tbl"><table>
        <thead><tr><th>الدفعة</th><th>الملف</th><th>النوع</th><th className="n">جديد</th><th className="n">تعديل</th><th className="n">أخطاء</th><th>الحالة</th><th>رفعه</th><th className="n">التاريخ</th></tr></thead>
        <tbody>{bs.map((b) => { const sm = JSON.parse(b.summary || '{}'); return <tr key={b.id}><td><Link href={`/imports/${b.id}`}><b>{b.batch_no}</b></Link></td><td>{b.file_name}</td><td>{b.source_kind === 'template' ? 'النموذج الموحد' : 'ملف المتابعة'}</td>
          <td className="n">{sm.new ?? 0}</td><td className="n">{sm.update ?? 0}</td><td className="n">{sm.error ? <span className="amount-bad">{sm.error}</span> : 0}</td><td><Tag tone={ST[b.status]?.[1] ?? 'mute'}>{ST[b.status]?.[0] ?? b.status}</Tag></td><td>{b.created_by}</td>
          <td className="n">{new Date(String(b.created_at)).toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' })}</td></tr>; })}</tbody></table></div>}</div>
    </Page>
  );
}
