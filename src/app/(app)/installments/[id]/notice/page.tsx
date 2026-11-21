import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { getSettings } from '@/lib/data';
import { Page } from '@/components/ui';
import { money, date, hijri } from '@/lib/fmt';
import { tafqit } from '@/lib/tafqit';

/** إشعار مطالبة بقسط مع تفصيل الضريبة — ليس فاتورة إلكترونية معتمدة من هيئة الزكاة */
export default async function Notice({ params }: { params: { id: string } }) {
  const { org, asOf, a } = await ctx();
  const r = a.rows.find((x) => x.id === params.id); if (!r) notFound();
  const S = await getSettings(); const t = a.T.get(r.contract.tenant_id)!;
  const vat = r.contract.vat_rate ?? 0, net = vat ? Math.round((r.amount / (1 + vat / 100)) * 100) / 100 : r.amount, tax = Math.round((r.amount - net) * 100) / 100;
  const no = `N-${r.contract.contract_no?.split('/')[0] ?? r.contract_id.slice(-6)}-${r.no}`;
  return (
    <Page title="إشعار مطالبة بقسط إيجار" sub={`${t.name} — قسط ${r.no}`} org={org} asOf={asOf} print letter back={[`/installments/${r.id}`, 'القسط']}>
      <div className="letter">
        <div className="lh"><div><div className="o">{org}</div>{S.org_vat_no && <div>الرقم الضريبي: <span dir="ltr">{S.org_vat_no}</span></div>}{S.org_address && <div>{S.org_address}</div>}</div><img src="/api/logo" alt="" /></div>
        <div className="meta"><span>رقم الإشعار: <span dir="ltr">{no}</span></span><span>تاريخ الإصدار: {date(asOf)} — {hijri(asOf)}</span></div>
        <h2>إشعار مطالبة بقسط إيجار</h2>
        <div className="facts">
          <div><span>المستأجر</span><b>{t.name}</b></div>{r.contract.trade_name && <div><span>النشاط</span><b>{r.contract.trade_name}</b></div>}
          {t.vat_no && <div><span>الرقم الضريبي للمستأجر</span><b dir="ltr">{t.vat_no}</b></div>}{t.cr_no && <div><span>السجل التجاري</span><b dir="ltr">{t.cr_no}</b></div>}
          <div><span>العقار / الوحدة</span><b>{r.propertyName} — {r.unitCode}</b></div><div><span>رقم عقد إيجار</span><b dir="ltr">{r.contract.contract_no ?? '—'}</b></div>
          <div><span>الفترة</span><b>{r.period_from ? `${date(r.period_from)} – ${date(r.period_to)}` : '—'}</b></div><div><span>تاريخ الاستحقاق</span><b>{date(r.due_date)}</b></div>
        </div>
        <div className="tbl"><table><tbody>
          <tr><td>قيمة الإيجار للفترة (قبل الضريبة)</td><td className="n">{money(net)}</td></tr>
          <tr><td>ضريبة القيمة المضافة {vat ? `${vat}%` : '(غير خاضع / غير محدد)'}</td><td className="n">{money(tax)}</td></tr>
          <tr className="tot"><td>إجمالي القسط</td><td className="n">{money(r.amount)}</td></tr>
          <tr><td>المسدد حتى تاريخه</td><td className="n">{money(r.amount - r.balance)}</td></tr>
          <tr className="tot"><td>المطلوب سداده</td><td className="n">{money(r.balance)}</td></tr></tbody></table></div>
        <p>المطلوب: <b>{tafqit(r.balance)}</b></p>
        <p className="muted">هذا إشعار مطالبة داخلي، وليس فاتورة إلكترونية صادرة عبر نظام الفوترة الإلكترونية لهيئة الزكاة والضريبة والجمارك.</p>
        <div className="sgn"><div>المستلم</div><div>{S.org_signatory || 'المحاسب'}<br /><small>{org}</small></div></div>
      </div>
    </Page>
  );
}
