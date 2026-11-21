import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { money, date } from '@/lib/fmt';
import { createPayLink } from '@/lib/paylink-actions';
export const dynamic = 'force-dynamic';
export default async function NewPayLink({ searchParams }: { searchParams: { tenant?: string; contract?: string; inst?: string } }) {
  const { db, a, org, asOf } = await ctx('accountant');
  const contract = searchParams.contract ? db.contracts.find((c) => c.id === searchParams.contract) : undefined;
  const tenantId = contract?.tenant_id ?? searchParams.tenant ?? '';
  const ts = a.tenantStats.find((x) => x.t.id === tenantId);
  const open = ts ? ts.rows.filter((r) => r.balance > 0 && !r.needs_confirmation && (!contract || r.contract_id === contract.id)).sort((x, y) => x.due_date.localeCompare(y.due_date)) : [];
  const due = open.filter((r) => r.due_date <= asOf), pre = searchParams.inst ? open.filter((r) => r.id === searchParams.inst) : due.length ? due : open.slice(0, 1);
  const amt = pre.reduce((n, r) => n + r.balance, 0);
  return (
    <Page title="رابط دفع جديد" sub="يُرسل للمستأجر بواتساب أو رسالة، ويدفع منه بمدى أو البطاقة أو Apple Pay، ويُسجَّل السند تلقائياً." org={org} asOf={asOf} back={['/paylinks', 'روابط الدفع']}>
      {!ts ? <form method="get" className="card frm"><div className="grid"><label className="fld"><span>المستأجر</span><select name="tenant" required defaultValue=""><option value="" disabled>اختر</option>{db.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div><div className="fa"><button className="btn" type="submit">متابعة</button></div></form>
      : <form action={createPayLink} className="card frm"><input type="hidden" name="tenant_id" value={tenantId} />{contract && <input type="hidden" name="contract_id" value={contract.id} />}
        <h2>{ts.t.name}{contract && <small> — {a.P.get(contract.property_id)?.short} {a.U.get(contract.unit_id)?.code}</small>}</h2>
        {open.length > 0 && <fieldset className="fld wide"><span>الأقساط المشمولة (يُوزَّع المبلغ عليها أولاً)</span><div className="pl-insts">{open.map((r) => <label key={r.id} className="chk"><input type="checkbox" name="inst" value={r.id} defaultChecked={pre.includes(r)} /> {r.propertyShort} {r.unitCode} — قسط {r.no} — {date(r.due_date)} — <b>{money(r.balance)}</b>{r.status === 'overdue' && <span className="tag t-bad">متأخر</span>}</label>)}</div></fieldset>}
        <div className="grid">
          <label className="fld"><span>المبلغ</span><input name="amount" required dir="ltr" defaultValue={amt ? amt.toFixed(2) : ''} /><small>إجمالي المحدد {money(amt)} — يمكن تعديله (دفعة جزئية)</small></label>
          <label className="fld"><span>الوصف</span><input name="description" defaultValue={due.length ? `سداد متأخرات الإيجار (${due.length} أقساط)` : 'سداد قسط الإيجار'} /></label>
          <label className="fld"><span>صلاحية الرابط (يوم)</span><input name="days" type="number" min={1} max={60} defaultValue={7} /></label>
        </div><div className="fa"><button className="btn" type="submit">إنشاء الرابط</button></div></form>}
    </Page>
  );
}
