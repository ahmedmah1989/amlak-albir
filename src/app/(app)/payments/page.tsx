import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Btn, XL } from '@/components/ui';
import DataTable from '@/components/DataTable';
import { money, date } from '@/lib/fmt';

export default async function Payments({ searchParams }: { searchParams: { from?: string; to?: string; v?: string; p?: string; state?: string } }) {
  const { db, a, org, asOf, canEdit } = await ctx();
  const { from, to, p: pid, state } = searchParams; const showVoid = searchParams.v === '1';
  const receiptState = (p: typeof db.payments[number]) => p.voided ? 'voided' : p.bank_line_id ? 'matched' : db.attachments.some((x) => x.entity === 'payment' && x.entity_id === p.id) || p.method === 'نقدي' ? 'documented' : 'missing';
  const stateLabels: Record<string, string> = { voided: 'ملغى', matched: 'مطابق', documented: 'موثق', missing: 'بلا مرفق' };
  const ps = db.payments.filter((p) => (showVoid || !p.voided) && (!from || p.paid_on >= from) && (!to || p.paid_on <= to)
    && (!pid || (p.contract_id && a.C.get(p.contract_id)?.property_id === pid)) && (!state || receiptState(p) === state));
  const total = ps.filter((p) => !p.voided).reduce((x, p) => x + p.amount, 0);
  const exportQuery = new URLSearchParams(Object.entries({ from, to, v: searchParams.v, p: pid, state }).filter(([, v]) => v) as [string, string][]).toString();
  return <Page title="المقبوضات — سندات القبض" sub={`${ps.length} سنداً • ${money(total)} ريال${from || to ? ` • من ${date(from)} إلى ${date(to)}` : ''}`} org={org} asOf={asOf} print
    actions={<>{canEdit && <Btn href="/payments/new">💵 تسجيل مقبوضات</Btn>}<XL r="payments" q={exportQuery ? '&' + exportQuery : ''} /></>}>
    <form className="filter-panel noprint" method="get">
      <label className="fld"><span>من</span><input type="date" name="from" defaultValue={from} /></label>
      <label className="fld"><span>إلى</span><input type="date" name="to" defaultValue={to} /></label>
      <label className="fld"><span>العقار</span><select name="p" defaultValue={pid ?? ''}><option value="">كل العقارات</option>{db.properties.map((p) => <option value={p.id} key={p.id}>{p.short}</option>)}</select></label>
      <label className="fld"><span>التوثيق والمطابقة</span><select name="state" defaultValue={state ?? ''}><option value="">الكل</option><option value="matched">مطابق</option><option value="documented">موثق</option><option value="missing">بلا مرفق</option></select></label>
      <label className="fld"><span>السندات الملغاة</span><select name="v" defaultValue={searchParams.v ?? ''}><option value="">إخفاء</option><option value="1">إظهار</option></select></label>
      <button className="btn" type="submit">تطبيق</button><Link className="btn ghost" href="/payments">مسح الفلاتر</Link>
    </form>
    <div className="card table-card"><DataTable label="المقبوضات" storageKey={`payments:${exportQuery}`} summaryColumns={[4]} bulk={[{ label: 'إعادة طباعة السندات', href: '/payments/print', primary: true }]} columns={[
      { label: 'السند' }, { label: 'التاريخ', numeric: true }, { label: 'المستأجر', wide: true }, { label: 'العقار / الوحدة', wide: true },
      { label: 'المبلغ', numeric: true }, { label: 'الطريقة' }, { label: 'المرجع', hidden: true }, { label: 'سجّله', hidden: true }, { label: 'التوثيق' },
    ]} rows={ps.map((p) => {
      const c = p.contract_id ? a.C.get(p.contract_id) : undefined, tenant = a.T.get(p.tenant_id)?.name ?? '';
      const unit = c ? `${a.P.get(c.property_id)?.short} — ${a.U.get(c.unit_id)?.code}` : '—', status = receiptState(p);
      return { id: p.id, search: [p.receipt_no, p.paid_on, tenant, unit, p.amount, p.method, p.bank_ref, p.created_by, stateLabels[status]].join(' '),
        values: [p.receipt_no, p.paid_on, tenant, unit, p.amount, p.method, p.bank_ref, p.created_by, stateLabels[status]], totals: { 4: p.voided ? 0 : p.amount },
        actions: [['فتح السند', `/payments/${p.id}`], ['طباعة السند', `/payments/print?ids=${p.id}`], ['ملف المستأجر', `/tenants/${p.tenant_id}`], ...(c ? [['فتح العقد', `/contracts/${c.id}`]] as [string, string][] : [])],
        cells: [<Link className="record-link" href={`/payments/${p.id}`}>{p.receipt_no}</Link>, date(p.paid_on), tenant, unit, money(p.amount), p.method,
          <span dir="ltr">{p.bank_ref ?? '—'}</span>, p.created_by ?? '—', <Tag tone={status === 'voided' ? 'bad' : status === 'matched' ? 'ok' : status === 'documented' ? 'est' : 'warn'}>{stateLabels[status]}</Tag>],
      };
    })} /></div>
  </Page>;
}
