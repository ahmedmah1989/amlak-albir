import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { q } from '@/lib/db';
import { Page, Tag, Empty } from '@/components/ui';
import { Ic } from '@/components/icons';
import { Form, F } from '@/components/form';
import { saveBankAccount, uploadBank } from '@/lib/actions2';
import { money, date } from '@/lib/fmt';

export default async function Bank() {
  const { db, org, asOf, canEdit, isAdmin } = await ctx();
  const accs = await q('select * from bank_accounts order by name');
  const imps = await q('select i.*, a.name acc from bank_imports i left join bank_accounts a on a.id=i.account_id order by i.created_at desc limit 30');
  return (
    <Page title="كشوف البنك" sub="الحسابات البنكية واستيراد الكشوف" org={org} asOf={asOf} actions={<><Link className="btn" href="/bank/match"><Ic n="link" />المطابقة</Link><Link className="btn ghost" href="/bank/lines">كل الإيداعات</Link></>}>
      <div className="g2">
        <div className="card"><h2><Ic n="bank" />الحسابات ({accs.length})</h2>
          {accs.length ? <ul className="list">{accs.map((x) => <li key={x.id}><b>{x.name}</b><span className="muted">{x.bank}</span><span className="n muted" dir="ltr">{x.iban}</span>{x.mapping && <Tag tone="ok">قالب محفوظ</Tag>}</li>)}</ul> : <Empty>أضف حساب الجمعية أولاً.</Empty>}
          {isAdmin && <details className="box" style={{ marginTop: '.6rem' }}><summary>إضافة حساب</summary><div className="in"><Form action={saveBankAccount} submit="إضافة"><F label="اسم الحساب" name="name" req /><F label="البنك" name="bank" /><F label="الآيبان" name="iban" dir="ltr" placeholder="SA..." /></Form></div></details>}</div>
        <div className="card"><h2><Ic n="up" />استيراد كشف</h2>
          {canEdit && accs.length ? <form action={uploadBank} className="frm"><div className="grid">
            <label className="fld"><span>الحساب</span><select name="account_id" required>{accs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label className="fld wide"><span>ملف الكشف (xlsx أو xls أو csv)</span><input type="file" name="file" accept=".xlsx,.xls,.csv" required /></label></div>
            <div className="fa"><button className="btn gold">رفع ومعاينة</button></div><p className="muted">تُستورد الإيداعات (الدائن) فقط، وتُتجاهل المكررة تلقائياً.</p></form> : <Empty>أضف حساباً بنكياً أولاً.</Empty>}</div>
      </div>
      <div className="card"><h2>سجل الاستيراد</h2>{imps.length ? <div className="tbl"><table><thead><tr><th className="n">التاريخ</th><th>الحساب</th><th>الملف</th><th className="n">الفترة</th><th className="n">الإيداعات</th><th>الحالة</th></tr></thead>
        <tbody>{imps.map((i) => <tr key={i.id}><td className="n">{date(new Date(i.created_at).toISOString().slice(0, 10))}</td><td>{i.acc}</td><td><Link href={`/bank/import/${i.id}`}>{i.file_name}</Link></td><td className="n">{i.date_from ? `${date(i.date_from)} – ${date(i.date_to)}` : '—'}</td><td className="n">{i.rows ?? '—'}</td>
          <td><Tag tone={i.status === 'done' ? 'ok' : 'warn'}>{i.status === 'done' ? 'تم' : 'بانتظار التأكيد'}</Tag></td></tr>)}</tbody></table></div> : <Empty>لا يوجد.</Empty>}
        <p className="muted">إجمالي الإيداعات المستوردة: {db.bankLines.length} • مطابق {db.bankLines.filter((l) => l.status === 'matched').length} • مفتوح {db.bankLines.filter((l) => l.status === 'open').length} ({money(db.bankLines.filter((l) => l.status === 'open').reduce((x, l) => x + l.amount, 0))} ريال)</p></div>
    </Page>
  );
}
