import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { getSettings } from '@/lib/data';
import { Page, Btn } from '@/components/ui';
import { Hidden } from '@/components/form';
import { addFollowUp } from '@/lib/actions';
import { money, date, hijri } from '@/lib/fmt';
import { tafqit } from '@/lib/tafqit';
import { addDays } from '@/lib/calc';

const TYPES: Record<string, { t: string; days: number; follow: string }> = {
  reminder: { t: 'تذكير بموعد سداد', days: 0, follow: 'إشعار بالسداد' },
  claim: { t: 'خطاب مطالبة بسداد مبالغ متأخرة', days: 7, follow: 'إشعار بالسداد' },
  warning: { t: 'إنذار بسداد مبالغ متأخرة', days: 15, follow: 'إنذار رسمي' },
};
export default async function Letter({ params, searchParams }: { params: { id: string }; searchParams: { type?: string; c?: string } }) {
  const { a, org, asOf, canEdit } = await ctx();
  const st = a.tenantStats.find((x) => x.t.id === params.id); if (!st) notFound();
  const type = TYPES[searchParams.type ?? ''] ? searchParams.type! : 'claim', T = TYPES[type];
  const S = await getSettings();
  const rows = st.rows.filter((r) => (!searchParams.c || r.contract_id === searchParams.c) && r.balance > 0 &&
    (type === 'reminder' ? r.due_date <= addDays(asOf, 30) : r.status === 'overdue' || r.status === 'due')).sort((x, y) => x.due_date.localeCompare(y.due_date));
  const total = rows.reduce((x, r) => x + r.balance, 0);
  const trade = [...new Set(st.contracts.map((c) => c.trade_name).filter(Boolean))].join(' / ');
  const ref = `L-${asOf.replace(/-/g, '')}-${st.t.id.slice(-4).toUpperCase()}`;
  const units = [...new Set(rows.map((r) => `${r.propertyName} — ${r.unitCode}`))].join('، ') || st.activeContracts.map((c) => `${a.P.get(c.property_id)?.name} — ${a.U.get(c.unit_id)?.code}`).join('، ');
  return (
    <Page title={T.t} sub={st.t.name} org={org} asOf={asOf} print letter back={[`/tenants/${st.t.id}`, st.t.name]}
      actions={<>{Object.entries(TYPES).map(([k, v]) => <Btn key={k} href={`?type=${k}${searchParams.c ? '&c=' + searchParams.c : ''}`} kind={k === type ? '' : 'ghost'}>{v.t.split(' ')[0]}</Btn>)}</>}>
      {!rows.length && <p className="note warn noprint">لا توجد مبالغ {type === 'reminder' ? 'مستحقة خلال 30 يوماً' : 'متأخرة'} لهذا المستأجر؛ راجع قبل الإرسال.</p>}
      <div className="letter">
        <div className="lh"><div><div className="o">{org}</div>{S.org_cr && <div>ترخيص/سجل: {S.org_cr}</div>}{S.org_phone && <div dir="ltr">{S.org_phone}</div>}</div><img src="/api/logo" alt="" /></div>
        <div className="meta"><span>الرقم: <span dir="ltr">{ref}</span></span><span>التاريخ: {date(asOf)} — {hijri(asOf)}</span></div>
        <p>المكرم/ <b>{st.t.name}</b>{trade && <> — {trade}</>} &nbsp; المحترم</p>
        <p>السلام عليكم ورحمة الله وبركاته،</p>
        <h2>{T.t}</h2>
        {type === 'reminder' ? <p>نود تذكيركم بأن قسط/أقساط الإيجار الخاصة بـ <b>{units}</b> يحل موعد سدادها حسب البيان التالي، بإجمالي <b>{money(total)} ريال</b> ({tafqit(total)}). نأمل السداد في الموعد المحدد وتزويدنا بإشعار التحويل.</p>
          : <p>إشارة إلى عقد الإيجار المبرم معكم بخصوص <b>{units}</b>، نفيدكم بأن المبالغ المستحقة عليكم وغير المسددة حتى تاريخه بلغت <b>{money(total)} ريال</b> ({tafqit(total)}) حسب البيان التالي، ونأمل المبادرة بسدادها خلال <b>{T.days} يوماً</b> من تاريخ هذا الخطاب.</p>}
        <div className="tbl"><table><thead><tr><th>الوحدة</th><th className="n">القسط</th><th>الفترة</th><th className="n">الاستحقاق</th><th className="n">أيام التأخير</th><th className="n">المتبقي</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.unitCode}</td><td className="n">{r.no}</td><td className="n">{r.period_from ? `${date(r.period_from)} – ${date(r.period_to)}` : '—'}</td><td className="n">{date(r.due_date)}</td><td className="n">{r.daysLate || '—'}</td><td className="n">{money(r.balance)}</td></tr>)}
            <tr className="tot"><td>الإجمالي</td><td></td><td></td><td></td><td></td><td className="n">{money(total)}</td></tr></tbody></table></div>
        {type === 'warning' && <p>وفي حال عدم السداد خلال المدة المذكورة، ستضطر الجمعية — مع الأسف — لاتخاذ ما يلزم من إجراءات نظامية وفق بنود العقد والأنظمة المعمول بها، بما في ذلك المطالبة عبر منصة إيجار وجهات التنفيذ المختصة.</p>}
        <p>علماً بأن السداد يتم بالتحويل إلى حساب الجمعية مع إرسال صورة الإشعار، ولأي استفسار يمكنكم التواصل معنا{S.org_phone ? <> على الرقم <span dir="ltr">{S.org_phone}</span></> : null}.</p>
        <p>وتقبلوا وافر التحية والتقدير،،</p>
        <div className="sgn"><div>المستأجر / المستلم<br /><small>الاسم والتوقيع والتاريخ</small></div><div>{S.org_signatory || 'المفوض بالتوقيع'}<br /><small>{org}</small></div></div>
      </div>
      {canEdit && <form action={addFollowUp} className="noprint" style={{ marginTop: 12 }}><Hidden n="tenant_id" v={st.t.id} /><Hidden n="date" v={asOf} /><Hidden n="type" v={T.follow} />
        <Hidden n="details" v={`${T.t} رقم ${ref} بمبلغ ${money(total)} ريال`} /><Hidden n="next_date" v={addDays(asOf, Math.max(T.days, 3))} />
        <button className="btn" type="submit">تسجيل الخطاب في سجل المتابعة (متابعة تالية بعد {Math.max(T.days, 3)} أيام)</button></form>}
    </Page>
  );
}
