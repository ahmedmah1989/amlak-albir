import Link from 'next/link';
import DataTable from '@/components/DataTable';
import { ctx } from '@/lib/ctx';
import { Page, Tag, XL } from '@/components/ui';
import { unmatchBankLine } from '@/lib/actions2';
import { money, date } from '@/lib/fmt';

export default async function Lines({ searchParams }: { searchParams: { s?: string } }) {
  const { db, a, org, asOf, isAdmin } = await ctx();
  const f = searchParams.s ?? 'all'; const ls = db.bankLines.filter((l) => f === 'all' || l.status === f);
  return (
    <Page title="إيداعات البنك" sub={`${ls.length} إيداعاً • ${money(ls.reduce((x, l) => x + l.amount, 0))} ريال`} org={org} asOf={asOf} print actions={<XL r="bank" q={'&s=' + encodeURIComponent(f)} />}>
      <div className="filters">{[['all', 'الكل'], ['open', 'مفتوحة'], ['matched', 'مطابقة'], ['ignored', 'مستبعدة']].map(([k, l]) => <Link key={k} href={`?s=${k}`} className={f === k ? 'on' : ''}>{l}</Link>)}</div>
      <div className="card table-card"><DataTable label="إيداعات البنك" storageKey={`bank-lines:${f}`} summaryColumns={[1]} columns={[
        {label:'التاريخ',kind:'date'},{label:'المبلغ',numeric:true},{label:'الوصف',wide:true},{label:'المرجع',hidden:true},{label:'الحالة'},{label:'المقابل',wide:true},{label:'طابقه',hidden:true},...(isAdmin?[{label:'الإجراء',sortable:false,exportable:false}]:[])
      ]} rows={ls.map(l=>{const p=l.payment_id?db.payments.find(x=>x.id===l.payment_id):undefined,status={open:'مفتوح',matched:'مطابق',ignored:'مستبعد'}[l.status],counterpart=p?`${p.receipt_no} — ${a.T.get(p.tenant_id)?.name||''}`:l.note||'';return {id:l.id,search:[l.description,l.ref,status,counterpart,l.matched_by].join(' '),values:[l.date,l.amount,l.description,l.ref,status,counterpart,l.matched_by,...(isAdmin?[null]:[])],totals:{1:l.amount},cells:[date(l.date),money(l.amount),l.description||'—',l.ref||'—',<Tag tone={l.status==='matched'?'ok':l.status==='open'?'warn':'mute'}>{status}</Tag>,p?<Link href={`/payments/${p.id}`}>{counterpart}</Link>:counterpart||'—',l.matched_by||'—',...(isAdmin?[l.status!=='open'?<form action={unmatchBankLine}><input type="hidden" name="line_id" value={l.id} /><button className="btn sm ghost">إعادة فتح</button></form>:null]:[])]};})} /></div>
    </Page>
  );
}
