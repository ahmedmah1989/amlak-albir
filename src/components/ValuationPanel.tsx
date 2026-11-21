import { Form, F, Hidden } from '@/components/form';
import { addValuation, deleteValuation, saveLandBasis } from '@/lib/actions5';
import { money, date, hijri, LAND_BASIS } from '@/lib/fmt';
import type { Property, Valuation, AttachMeta } from '@/lib/types';

const BASIS = ['تقييم معتمد', 'تقييم داخلي', 'قرار مجلس الإدارة', 'دفترية', 'الأرض تقديرية', 'تقديرية'];
const tot = (v: { land_value: number | null; building_value: number | null }) => (v.land_value ?? 0) + (v.building_value ?? 0);
const signed = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + money(Math.abs(x));

/** تبويب «القيمة والتقييمات» في صفحة العقار */
export default function ValuationPanel({ p, vals, files, isAdmin }: { p: Property; vals: Valuation[]; files: AttachMeta[]; isAdmin: boolean }) {
  const basis = p.land_basis ?? 'owned', cur = tot(p), first = vals[0], last = vals[vals.length - 1];
  const revs = vals.filter((v) => v.kind === 'revaluation'), diff = first ? cur - tot(first) : null;
  const leased = basis === 'leased', landOnly = basis === 'land_only';
  return <>
    <div className="kpis">
      <div className="kpi"><div className="l">قيمة الأرض الحالية</div><div className="v">{leased ? 'لا تُقيَّم' : money(p.land_value)}{!leased && p.land_value != null && <small> ريال</small>}</div>
        <div className="s">{leased ? 'أرض مستأجرة من الغير' : p.land_area ? `${money(p.land_area)} م²` : 'المساحة غير مسجلة'}</div></div>
      <div className="kpi"><div className="l">قيمة المبنى الحالية</div><div className="v">{landOnly ? 'لا يوجد' : money(p.building_value)}{!landOnly && p.building_value != null && <small> ريال</small>}</div>
        <div className="s">{landOnly ? 'أرض فضاء' : p.building_area ? `${money(p.building_area)} م²` : 'المساحة غير مسجلة'}</div></div>
      <div className="kpi info"><div className="l">إجمالي القيمة الحالية</div><div className="v">{cur ? money(cur) : '—'}<small> ريال</small></div><div className="s">{p.value_status ?? 'غير محدد الأساس'}</div></div>
      <div className={'kpi ' + (diff == null || diff === 0 ? '' : diff > 0 ? 'ok' : 'bad')}><div className="l">فرق إعادة التقييم المتراكم</div>
        <div className="v">{diff == null ? '—' : signed(diff)}</div><div className="s">{revs.length ? `${revs.length} إعادة تقييم • آخرها ${last?.val_date ? date(last.val_date) : '—'}` : 'لا توجد إعادة تقييم بعد'}</div></div>
    </div>

    <div className="card"><h2>سجل التقييمات ({vals.length})</h2>
      {vals.length === 0 ? <p className="muted empty">لا توجد قيمة مسجلة لهذا العقار. سجّل القيمة الافتتاحية من النموذج أدناه.</p> :
      <div className="tbl"><table>
        <thead><tr><th>التاريخ</th><th>النوع</th><th className="n">الأرض</th><th className="n">المبنى</th><th className="n">الإجمالي</th><th className="n">الفرق عن السابق</th><th>الأساس / المقيّم</th><th>المرجع</th><th>المستندات</th><th>بواسطة</th>{isAdmin && <th className="noprint"></th>}</tr></thead>
        <tbody>{vals.map((v, i) => {
          const prev = i > 0 ? tot(vals[i - 1]) : null, d = prev == null ? null : tot(v) - prev;
          const fs = files.filter((f) => f.entity === 'valuation' && f.entity_id === v.id);
          return <tr key={v.id}>
            <td className="n">{v.val_date ? <>{date(v.val_date)}<div className="cell-sub">{hijri(v.val_date)}</div></> : <span className="muted">غير محدد</span>}</td>
            <td>{v.kind === 'initial' ? 'قيمة افتتاحية' : 'إعادة تقييم'}</td>
            <td className="n">{money(v.land_value)}{v.prev_land != null && v.prev_land !== v.land_value && <div className="cell-sub">كانت {money(v.prev_land)}</div>}</td>
            <td className="n">{money(v.building_value)}{v.prev_building != null && v.prev_building !== v.building_value && <div className="cell-sub">كانت {money(v.prev_building)}</div>}</td>
            <td className="n"><b>{money(tot(v))}</b></td>
            <td className={'n ' + (d == null || d === 0 ? '' : d > 0 ? 'amount-ok' : 'amount-bad')}>{d == null ? '—' : signed(d)}</td>
            <td>{v.basis ?? '—'}{v.valuer && <div className="cell-sub">{v.valuer}</div>}</td>
            <td>{[v.ref_no && `تقرير ${v.ref_no}`, v.decision_no && `قرار ${v.decision_no}`].filter(Boolean).join(' • ') || '—'}{v.note && <div className="cell-sub" title={v.note}>{v.note}</div>}</td>
            <td>{fs.length ? fs.map((f) => <div key={f.id}><a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">{f.file_name}</a></div>) : '—'}</td>
            <td>{v.created_by ?? '—'}</td>
            {isAdmin && <td className="noprint">{i === vals.length - 1 && <details className="inline-confirm"><summary className="btn sm ghost">إلغاء السجل</summary>
              <form action={deleteValuation}><Hidden n="id" v={v.id} /><label className="fld"><span>سبب الإلغاء</span><input name="reason" required placeholder="مثل: خطأ في إدخال المبلغ" /></label>
                <button className="btn sm danger" type="submit">تأكيد الإلغاء</button></form></details>}</td>}
          </tr>; })}
          <tr className="tot"><td colSpan={4}>القيمة الحالية = آخر سجل حسب التاريخ</td><td className="n">{money(cur)}</td><td className="n">{diff == null ? '—' : signed(diff)}</td><td colSpan={isAdmin ? 5 : 4}>الفرق المتراكم مقارنة بأول قيمة مسجلة</td></tr>
        </tbody></table></div>}
    </div>

    {isAdmin && <div className="g2 noprint">
      <div className="card"><h2>{vals.length ? 'تسجيل إعادة تقييم' : 'تسجيل القيمة الافتتاحية'}</h2>
        <p className="muted">القيمة الجديدة تصبح القيمة الحالية للعقار، ويبقى السجل السابق كما هو. الحقل الفارغ يعني بدون تغيير.</p>
        <form action={addValuation} className="frm" encType="multipart/form-data"><div className="grid">
          <Hidden n="property_id" v={p.id} /><Hidden n="kind" v={vals.length ? 'revaluation' : 'initial'} />
          <F label="تاريخ التقييم" name="val_date" type="date" req={vals.length > 0} />
          <F label="أساس التقييم" name="basis" opts={BASIS.map((x) => [x, x])} def={vals.length ? 'تقييم معتمد' : 'دفترية'} />
          {!leased && <F label="قيمة الأرض الجديدة" name="land_value" type="number" hint={p.land_value != null ? `الحالية ${money(p.land_value)}` : undefined} />}
          {!landOnly && <F label="قيمة المبنى الجديدة" name="building_value" type="number" hint={p.building_value != null ? `الحالية ${money(p.building_value)}` : undefined} />}
          <F label="المقيّم / الجهة" name="valuer" hint="مثل: مكتب تقييم معتمد من تقييم" />
          <F label="رقم تقرير التقييم" name="ref_no" />
          <F label="رقم قرار الاعتماد" name="decision_no" />
          <F label="ملاحظات" name="note" type="textarea" wide />
          <label className="fld wide"><span>📎 تقرير التقييم (PDF أو صور، يمكن اختيار أكثر من ملف)</span><input type="file" name="files" multiple accept="application/pdf,image/*" /></label>
        </div><div className="fa"><button className="btn" type="submit">{vals.length ? 'حفظ إعادة التقييم' : 'حفظ القيمة'}</button></div></form>
      </div>
      <div className="card"><h2>وضع الأرض والمساحات</h2>
        <Form action={saveLandBasis} submit="حفظ"><Hidden n="property_id" v={p.id} />
          <F label="وضع الأرض" name="land_basis" def={basis} opts={LAND_BASIS} req wide />
          <F label="مساحة الأرض م²" name="land_area" type="number" def={p.land_area} />
          <F label="مساحة المبنى م²" name="building_area" type="number" def={p.building_area} />
        </Form>
        <p className="muted">«مبنى على أرض مستأجرة»: تُسجَّل قيمة المبنى فقط. «أرض فضاء»: تُسجَّل قيمة الأرض فقط.</p>
      </div>
    </div>}
  </>;
}
