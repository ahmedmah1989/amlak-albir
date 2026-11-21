import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Btn, Kpi } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { money, date, VOUCHER_KINDS, VOUCHER_STATUS } from '@/lib/fmt';

export default async function Vouchers({ searchParams }: { searchParams: { s?: string } }) {
  const { db, a, org, asOf, canEdit } = await ctx();
  const st = searchParams.s ?? 'all';
  const vs = db.vouchers.filter((v) => st === 'all' || v.status === st);
  const sum = (k: string) => db.vouchers.filter((v) => v.status === k).reduce((n, v) => n + v.amount, 0);
  return (
    <Page title="سندات الصرف" sub="رد التأمينات والمبالغ الزائدة للمستأجرين. السند يُنشأ ثم يُعتمد، ولا يُحذف؛ الإلغاء بسبب ويبقى رقمه في التسلسل." org={org} asOf={asOf} print
      actions={canEdit && <Btn href="/vouchers/new">＋ سند صرف</Btn>}>
      <div className="kpis">
        <Kpi l="بانتظار الاعتماد" v={money(sum('pending'))} unit="ريال" tone="warn" s={`${db.vouchers.filter((v) => v.status === 'pending').length} سنداً`} href="?s=pending" />
        <Kpi l="المعتمد والمصروف" v={money(sum('approved'))} unit="ريال" tone="info" href="?s=approved" />
        <Kpi l="الملغى" v={String(db.vouchers.filter((v) => v.status === 'voided').length)} href="?s=voided" />
        <Kpi l="التأمينات المحتجزة" v={money(db.contracts.reduce((n, c) => n + Math.max(0, (c.deposit ?? 0) - (c.deposit_refund ?? 0) - (c.deposit_deduction ?? 0)), 0))} unit="ريال" s="قبل خصم السندات المعلقة" href="/reports/deposits" />
      </div>
      <div className="filters">{[['all', 'الكل'], ['pending', 'بانتظار الاعتماد'], ['approved', 'المعتمدة'], ['voided', 'الملغاة']].map(([k, l]) => <Link key={k} href={`?s=${k}`} className={st === k ? 'on' : ''}>{l}</Link>)}</div>
      <div className="card table-card"><DataTable label="سندات الصرف" storageKey={`vouchers:${st}`} summaryColumns={[5]} columns={[
        { label: 'السند' }, { label: 'التاريخ', kind: 'date' }, { label: 'النوع' }, { label: 'المستفيد', wide: true }, { label: 'العقد' }, { label: 'المبلغ', numeric: true }, { label: 'الطريقة' }, { label: 'الحالة' }, { label: 'أنشأه', hidden: true }, { label: 'اعتمده', hidden: true },
      ]} rows={vs.map((v) => { const c = v.contract_id ? a.C.get(v.contract_id) : undefined; return {
        id: v.id, search: [v.voucher_no, v.payee, v.note, VOUCHER_KINDS[v.kind]].join(' '),
        values: [v.voucher_no, v.date, VOUCHER_KINDS[v.kind] ?? v.kind, v.payee, c ? `${a.P.get(c.property_id)?.short} — ${a.U.get(c.unit_id)?.code}` : null, v.amount, v.method, VOUCHER_STATUS[v.status]?.[0] ?? v.status, v.created_by, v.approved_by],
        totals: { 5: v.status === 'voided' ? 0 : v.amount }, actions: [['فتح السند', `/vouchers/${v.id}`], ...(c ? [['فتح العقد', `/contracts/${c.id}`]] as [string, string][] : [])],
        cells: [<Link className="record-link" href={`/vouchers/${v.id}`}>{v.voucher_no}</Link>, date(v.date), VOUCHER_KINDS[v.kind] ?? v.kind, v.payee, c ? <Link href={`/contracts/${c.id}`}>{a.P.get(c.property_id)?.short} — {a.U.get(c.unit_id)?.code}</Link> : '—', money(v.amount), v.method,
          <Tag tone={VOUCHER_STATUS[v.status]?.[1] ?? 'mute'}>{VOUCHER_STATUS[v.status]?.[0] ?? v.status}</Tag>, v.created_by ?? '—', v.approved_by ?? '—'] }; })} /></div>
    </Page>
  );
}
