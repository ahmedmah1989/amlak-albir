import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page } from '@/components/ui';
import { q } from '@/lib/db';
import { CONDITIONS, type InspItem } from '@/lib/ops';
import { saveInspection, inspectionTemplate } from '@/lib/ops-actions';
/** محضر فحص الوحدة: عند التسليم للمستأجر (move_in) أو عند الإخلاء (move_out) — بنود قياسية + أصول الوحدة + صور */
export default async function NewInspection({ params, searchParams }: { params: { id: string }; searchParams: { kind?: string } }) {
  const { db, a, org, asOf } = await ctx('accountant');
  const c = db.contracts.find((x) => x.id === params.id); if (!c) notFound();
  const kind = searchParams.kind === 'move_out' ? 'move_out' : 'move_in';
  const tpl = await inspectionTemplate(c.unit_id);
  const [prev] = kind === 'move_out' ? await q(`select items from inspections where contract_id=$1 and kind='move_in' order by date desc limit 1`, [c.id]) : [];
  const before: InspItem[] = prev ? JSON.parse(prev.items) : [];
  const was = (it: { area: string; item: string }) => before.find((b) => b.area === it.area && b.item === it.item);
  return (
    <Page title={kind === 'move_in' ? 'محضر استلام المستأجر للوحدة' : 'محضر فحص الوحدة عند الإخلاء'} sub={`${a.P.get(c.property_id)?.short} — ${a.U.get(c.unit_id)?.code} • ${a.T.get(c.tenant_id)?.name}`} org={org} asOf={asOf} back={[`/contracts/${c.id}`, 'العقد']}>
      {kind === 'move_out' && !prev && <p className="note warn">لا يوجد محضر استلام سابق لهذا العقد؛ لن تظهر المقارنة.</p>}
      <form action={saveInspection} className="card frm insp-form"><input type="hidden" name="contract_id" value={c.id} /><input type="hidden" name="unit_id" value={c.unit_id} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="count" value={tpl.length + 5} />
        <div className="grid"><label className="fld"><span>التاريخ</span><input type="date" name="date" defaultValue={asOf} /></label><label className="fld"><span>القائم بالفحص</span><input name="inspector" /></label>
          <label className="chk"><input type="checkbox" name="tenant_present" value="1" defaultChecked /> بحضور المستأجر</label></div>
        <div className="tbl"><table className="insp-tbl"><thead><tr><th>البند</th>{kind === 'move_out' && <th>عند الاستلام</th>}<th>الحالة</th><th>ملاحظة</th>{kind === 'move_out' && <th>تكلفة الإصلاح</th>}</tr></thead><tbody>
          {[...tpl, ...Array.from({ length: 5 }, () => ({ area: 'أخرى', item: '' }))].map((it, i) => { const b = was(it); return <tr key={i}>
            <td><input type="hidden" name={`area_${i}`} value={it.area} />{it.item ? <><input type="hidden" name={`item_${i}`} value={it.item} /><small className="muted">{it.area}</small><div>{it.item}</div></> : <input className="inp" name={`item_${i}`} placeholder="بند إضافي" />}</td>
            {kind === 'move_out' && <td>{b ? CONDITIONS.find((x) => x[0] === b.cond)?.[1] : '—'}{b?.note && <div className="cell-sub">{b.note}</div>}</td>}
            <td><select className="inp" name={`cond_${i}`} defaultValue="good">{CONDITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
            <td><input className="inp" name={`note_${i}`} /></td>{kind === 'move_out' && <td><input className="inp" name={`cost_${i}`} dir="ltr" placeholder="0" /></td>}</tr>; })}</tbody></table></div>
        <label className="fld wide"><span>ملاحظات عامة</span><textarea name="notes" rows={2} /></label>
        <label className="fld wide"><span>الصور</span><input type="file" name="files" accept="image/*" capture="environment" multiple /></label>
        <div className="fa"><button className="btn" type="submit">حفظ المحضر</button></div></form>
    </Page>
  );
}
