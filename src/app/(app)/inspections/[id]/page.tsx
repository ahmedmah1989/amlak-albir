import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag } from '@/components/ui';
import Attachments from '@/components/Attachments';
import { q } from '@/lib/db';
import { money, date } from '@/lib/fmt';
import { CONDITIONS, type InspItem } from '@/lib/ops';
const TONE: Record<string, string> = { good: 'ok', fair: 'info', damaged: 'bad', missing: 'bad' };
export default async function Inspection({ params }: { params: { id: string } }) {
  const { db, a, org, asOf, canEdit, isAdmin } = await ctx();
  const [x] = await q('select * from inspections where id=$1', [params.id]); if (!x) notFound();
  const items: InspItem[] = JSON.parse(x.items); const c = x.contract_id ? db.contracts.find((k) => k.id === x.contract_id) : null;
  const [prev] = x.kind === 'move_out' && x.contract_id ? await q(`select items from inspections where contract_id=$1 and kind='move_in' order by date desc limit 1`, [x.contract_id]) : [];
  const before: InspItem[] = prev ? JSON.parse(prev.items) : [];
  const worse = items.filter((it) => { const b = before.find((y) => y.area === it.area && y.item === it.item); const rank = (s: string) => ['good', 'fair', 'damaged', 'missing'].indexOf(s); return !b ? it.cond !== 'good' && it.cond !== 'fair' : rank(it.cond) > rank(b.cond); });
  const cost = items.reduce((n, it) => n + (it.cost || 0), 0);
  return (
    <Page title={x.kind === 'move_in' ? 'محضر استلام الوحدة' : 'محضر فحص الإخلاء'} sub={`${a.P.get(db.units.find((u) => u.id === x.unit_id)?.property_id ?? '')?.short ?? ''} — ${a.U.get(x.unit_id)?.code ?? ''} • ${date(String(x.date))}${c ? ` • ${a.T.get(c.tenant_id)?.name}` : ''}`} org={org} asOf={asOf} print sig back={c ? [`/contracts/${c.id}`, 'العقد'] : ['/units', 'الوحدات']}>
      <div className="kpis"><div className="kpi"><div className="l">البنود</div><div className="v">{items.length}</div></div><div className={'kpi ' + (worse.length ? 'bad' : '')}><div className="l">{x.kind === 'move_out' ? 'بنود ساءت حالتها' : 'بنود بها ملاحظات'}</div><div className="v">{worse.length}</div></div>
        {x.kind === 'move_out' && <div className="kpi warn"><div className="l">تكلفة الإصلاح المقدرة</div><div className="v">{money(cost)} <small>ريال</small></div><div className="s">يمكن استقطاعها من التأمين</div></div>}</div>
      {x.kind === 'move_out' && c && cost > 0 && canEdit && <p className="note noprint">لتسوية التأمين: <Link href={`/contracts/${c.id}?tab=actions&deduct=${cost}`}>إخلاء وتسوية التأمين بخصم {money(cost)} ريال ←</Link></p>}
      <div className="card"><div className="tbl"><table><thead><tr><th>القسم</th><th>البند</th>{x.kind === 'move_out' && <th>عند الاستلام</th>}<th>الحالة</th><th>ملاحظة</th>{x.kind === 'move_out' && <th className="n">التكلفة</th>}</tr></thead><tbody>
        {items.map((it, i) => { const b = before.find((y) => y.area === it.area && y.item === it.item); return <tr key={i} className={worse.includes(it) ? 'hl' : ''}><td>{it.area}</td><td>{it.item}</td>
          {x.kind === 'move_out' && <td>{b ? CONDITIONS.find((k) => k[0] === b.cond)?.[1] : '—'}</td>}<td><Tag tone={TONE[it.cond] ?? 'mute'}>{CONDITIONS.find((k) => k[0] === it.cond)?.[1]}</Tag></td><td>{it.note || '—'}</td>{x.kind === 'move_out' && <td className="n">{it.cost ? money(it.cost) : '—'}</td>}</tr>; })}</tbody></table></div>
        {x.notes && <p className="note">{x.notes}</p>}<p className="muted">القائم بالفحص: {x.inspector ?? '—'} • {x.tenant_present ? 'بحضور المستأجر' : 'بدون حضور المستأجر'}</p></div>
      <Attachments entity="inspection" id={x.id} items={db.attachments} back={`/inspections/${x.id}`} canEdit={canEdit} isAdmin={isAdmin} cats={['صور الاستلام', 'صور التسليم', 'أخرى']} title="الصور" />
      <div className="sig print-only"><div>المستأجر</div><div>مندوب الجمعية</div><div>الاعتماد</div></div>
    </Page>
  );
}
