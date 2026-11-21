import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { Page, Empty, Tag } from '@/components/ui';
import { waTemplates, waLink } from '@/lib/messages';
import { money } from '@/lib/fmt';

/** رسائل واتساب جاهزة لعدة مستأجرين: زر لكل مستأجر يفتح المحادثة بالنص */
export default async function BulkWhatsApp({ searchParams }: { searchParams: { ids?: string; k?: string } }) {
  const { a, org, asOf } = await ctx();
  const sts = (searchParams.ids ?? '').split(',').map((id) => a.tenantStats.find((s) => s.t.id === id)).filter(Boolean).slice(0, 100) as typeof a.tenantStats;
  const k = searchParams.k ?? 'claim';
  if (!sts.length) return <Page title="رسائل واتساب" org={org} asOf={asOf} back={['/tenants', 'المستأجرون']}><Empty>حدد المستأجرين من الجدول أولاً.</Empty></Page>;
  const KS: [string, string][] = [['remind', 'تذكير بقسط قادم'], ['claim', 'مطالبة بالمتأخرات'], ['warn', 'إنذار']];
  return (
    <Page title={`رسائل واتساب — ${sts.length} مستأجر`} sub="اضغط «فتح المحادثة» لكل مستأجر؛ تُفتح المحادثة والنص جاهز للإرسال. سجّل المتابعة بعد الإرسال." org={org} asOf={asOf} back={['/tenants', 'المستأجرون']}>
      <div className="chips-row noprint">{KS.map(([kk, l]) => <a key={kk} className={'btn sm' + (kk === k ? '' : ' ghost')} href={`?k=${kk}&ids=${sts.map((s) => s.t.id).join(',')}`}>{l}</a>)}</div>
      <div className="card"><div className="tbl"><table><thead><tr><th>المستأجر</th><th>الجوال</th><th className="n">المتأخر</th><th>نص الرسالة</th><th></th></tr></thead>
        <tbody>{sts.map((s) => {
          const next = s.rows.filter((r) => r.balance > 0 && r.due_date >= asOf).sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
          const tp = waTemplates({ org, name: s.t.name, trade: s.contracts.find((c) => c.trade_name)?.trade_name, arrears: s.arrears, overdueCount: s.overdueCount, next: next ? { amount: next.balance, due: next.due_date } : null });
          const m = tp.find((x) => x.key === k) ?? tp[0]; const link = m ? waLink(s.t.phone, m.text) : null;
          return <tr key={s.t.id}><td><Link href={`/tenants/${s.t.id}`}>{s.t.name}</Link></td><td dir="ltr">{s.t.phone ?? <Tag tone="bad">لا يوجد</Tag>}</td><td className="n">{s.arrears ? money(s.arrears) : '—'}</td>
            <td className="wa-text">{m ? m.text : <span className="muted">لا توجد رسالة مناسبة (لا متأخرات ولا أقساط قادمة)</span>}</td>
            <td>{link ? <a className="btn sm" href={link} target="_blank" rel="noreferrer">فتح المحادثة</a> : '—'}</td></tr>; })}</tbody></table></div></div>
    </Page>
  );
}
