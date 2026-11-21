import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { q } from '@/lib/db';
import { Page, Tag } from '@/components/ui';
import { confirmBankImport } from '@/lib/actions2';
import { bankLines, type BankMap } from '@/lib/sheets';
import { money, date } from '@/lib/fmt';
import SubmitButton from '@/components/SubmitButton';

export default async function Imp({ params }: { params: { id: string } }) {
  const { org, asOf } = await ctx('accountant');
  const [i] = await q('select * from bank_imports where id=$1', [params.id]); if (!i) notFound();
  const rows: string[][] = JSON.parse(i.raw || '[]'), map: BankMap = JSON.parse(i.mapping || '{}');
  const head = rows[map.header] ?? [], lines = bankLines(rows, map);
  const sel = (name: keyof BankMap, label: string) => <label className="fld"><span>{label}</span><select name={name} defaultValue={String(map[name] ?? -1)}><option value="-1">—</option>{head.map((h, k) => <option key={k} value={k}>{h || `عمود ${k + 1}`}</option>)}</select></label>;
  return (
    <Page title={`معاينة كشف: ${i.file_name}`} sub={i.status === 'done' ? 'تم استيراد هذا الكشف' : 'تأكد من ربط الأعمدة ثم اعتمد الاستيراد'} org={org} asOf={asOf} back={['/bank', 'كشوف البنك']}>
      {i.status === 'pending' && <form action={confirmBankImport} className="card frm"><input type="hidden" name="id" value={i.id} /><h2>ربط الأعمدة (تعرّف عليها البرنامج تلقائياً)</h2>
        <div className="grid"><label className="fld"><span>صف العناوين</span><select name="header" defaultValue={String(map.header)}>{rows.slice(0, 25).map((r, k) => <option key={k} value={k}>{k + 1}: {r.filter(Boolean).slice(0, 3).join(' | ').slice(0, 50)}</option>)}</select></label>
          {sel('date', 'التاريخ')}{sel('credit', 'دائن / إيداع')}{sel('debit', 'مدين / سحب')}{sel('amount', 'المبلغ (إن لم يوجد دائن)')}{sel('desc', 'الوصف / البيان')}{sel('ref', 'المرجع')}</div>
        <label style={{ display: 'flex', gap: 8, marginTop: 10 }}><input type="checkbox" name="remember" defaultChecked /> حفظ هذا الربط كقالب لهذا الحساب</label>
        <div className="fa"><button className="btn ghost" name="preview" value="1">تحديث المعاينة</button><SubmitButton label={`اعتماد استيراد ${lines.length} إيداعاً`} /></div></form>}
      <div className="card"><h2>الإيداعات المقروءة ({lines.length}) <small>المجموع {money(lines.reduce((x, l) => x + l.amount, 0))}</small></h2><div className="tbl"><table>
        <thead><tr><th className="n">التاريخ</th><th className="n">المبلغ</th><th>الوصف</th><th>المرجع</th></tr></thead>
        <tbody>{lines.slice(0, 200).map((l, k) => <tr key={k}><td className="n">{date(l.date)}</td><td className="n">{money(l.amount)}</td><td>{l.description}</td><td dir="ltr">{l.ref}</td></tr>)}</tbody></table></div>
        {!lines.length && <p className="note bad">لم تُقرأ أي إيداعات. غيّر ربط الأعمدة ثم «تحديث المعاينة».</p>}</div>
      <div className="card"><h2>أول صفوف الملف كما هي</h2><div className="tbl"><table><tbody>{rows.slice(0, 12).map((r, k) => <tr key={k} className={k === map.header ? 'hl' : ''}><td className="n">{k + 1}</td>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div><Tag tone="gold">الصف المظلل = صف العناوين</Tag></div>
    </Page>
  );
}
