import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { getSettings } from '@/lib/data';
import { Page, Empty } from '@/components/ui';
import { money, date, hijri } from '@/lib/fmt';

export default async function Handover({ params }: { params: { id: string } }) {
  const { a, org, asOf } = await ctx();
  const c = a.C.get(params.id); if (!c) notFound();
  const S = await getSettings();
  const t = a.T.get(c.tenant_id)!, u = a.U.get(c.unit_id)!, p = a.P.get(c.property_id)!;
  const open = a.rows.filter((r) => r.contract_id === c.id && r.balance > 0).reduce((x, r) => x + r.balance, 0);
  return (
    <Page title="محضر إخلاء وتسليم وحدة" sub={`${p.name} — ${u.code}`} org={org} asOf={asOf} print letter back={[`/contracts/${c.id}`, 'العقد']}>
      {!c.vacated_on ? <Empty>لم يُسجَّل إخلاء لهذا العقد. سجّله من «إدارة العقد».</Empty> :
      <div className="letter">
        <div className="lh"><div className="o">{org}</div><img src="/api/logo" alt="" /></div>
        <div className="meta"><span>العقد: {c.contract_no ?? '—'}</span><span>تاريخ الإخلاء: {date(c.vacated_on)} — {hijri(c.vacated_on)}</span></div>
        <h2>محضر إخلاء وتسليم</h2>
        <p>تم في تاريخ <b>{date(c.vacated_on)}</b> استلام الوحدة <b>{u.code}</b> في <b>{p.name}</b> من المستأجر <b>{t.name}</b>{c.trade_name && <> ({c.trade_name})</>}، المؤجرة بالعقد الذي يبدأ في {date(c.start_date)}.</p>
        <h3>حالة الوحدة عند التسليم</h3><p style={{ whiteSpace: 'pre-wrap' }}>{c.handover_notes}</p>
        <h3>تسوية التأمين</h3>
        <div className="tbl"><table><tbody>
          <tr><td>مبلغ التأمين</td><td className="n">{money(c.deposit ?? 0)}</td></tr>
          <tr><td>المستقطع (أضرار / مستحقات)</td><td className="n">{money(c.deposit_deduction ?? 0)}</td></tr>
          <tr><td>المسترد للمستأجر</td><td className="n">{money(c.deposit_refund ?? 0)}</td></tr>
          <tr className="tot"><td>المتبقي على المستأجر من الأقساط</td><td className="n">{money(open)}</td></tr></tbody></table></div>
        {open > 0 && <p className="note warn">على المستأجر أرصدة إيجار غير مسددة بقيمة {money(open)} ريال لم تُسوَّ بهذا المحضر.</p>}
        <div className="sgn"><div>المستأجر<br /><small>الاسم والتوقيع</small></div><div>{S.org_signatory || 'مندوب الجمعية'}<br /><small>{org}</small></div></div>
      </div>}
    </Page>
  );
}
