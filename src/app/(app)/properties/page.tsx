import Link from 'next/link';
import DataTable from '@/components/DataTable';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Btn, XL } from '@/components/ui';
import { money, date, pct } from '@/lib/fmt';

export default async function Properties() {
  const { a, org, asOf, isAdmin } = await ctx();
  return (
    <Page title="العقارات والوحدات" sub={`${a.propStats.length} عقارات بقيمة دفترية ${money(a.totalBook)} ريال`} org={org} asOf={asOf} print
      actions={<>{isAdmin && <Btn href="/properties/new">＋ عقار جديد</Btn>}<XL r="properties" /></>}>
      {a.propStats.some(s=>s.p.data_status==='provisional')&&<p className="note warn noprint"><b>{a.propStats.filter(s=>s.p.data_status==='provisional').length} عقارات ببيانات مؤقتة قيد التأكيد</b> — استُوردت من ملف متابعة الإيجارات. افتح كل عقار لمراجعة بياناته واعتمادها.</p>}
      <div className="card table-card"><DataTable label="العقارات" storageKey="properties" summaryColumns={[4,5,6,7,9]} columns={[
        {label:'العقار',wide:true},{label:'النوع'},{label:'الملكية'},{label:'مجموعات التأجير',numeric:true},{label:'قيمة الأرض',numeric:true,hidden:true},{label:'قيمة المبنى',numeric:true,hidden:true},{label:'القيمة الحالية',numeric:true},{label:'الإيجار السنوي',numeric:true},{label:'العائد %',numeric:true},{label:'المتأخرات',numeric:true},{label:'آخر تقييم',kind:'date',hidden:true},{label:'أقرب نهاية عقد',kind:'date'},{label:'الوضع'},{label:'الإشغال %',numeric:true}
      ]} rows={a.propStats.map(s=>{const leaseU=s.units.filter(u=>u.kind==='lease'),occ=leaseU.length?Math.round(leaseU.filter(u=>a.active.some(c=>c.unit_id===u.id)).length/leaseU.length*100):null,units=leaseU.length,sub=s.units.filter(u=>u.kind==='subunit').length,prov=s.p.data_status==='provisional';return {id:s.p.id,search:[s.p.name,s.p.type,s.p.ownership,s.p.location,s.idle?'بلا دخل':'مؤجر',prov?'مؤقت':''].join(' '),values:[s.p.name,s.p.type,s.p.ownership,units,s.p.land_value,s.p.building_value,s.bv||null,s.rent,s.yield,s.arrears,s.lastValDate,s.nextEnd,s.idle?'بلا دخل':'مؤجر',occ],totals:{4:s.p.land_value??0,5:s.p.building_value??0,6:s.bv||0,7:s.rent,9:s.arrears},cells:[<><Link href={`/properties/${s.p.id}`}>{s.p.name}</Link>{prov&&<> <Tag tone="est">مؤقت</Tag></>}</>,s.p.type,s.p.ownership,<>{units}{sub>0?<small className="cell-sub">و{sub} وحدات فرعية</small>:null}</>,s.p.land_basis==='leased'?'لا تُقيَّم':money(s.p.land_value),money(s.p.building_value),s.bv?<Link href={`/properties/${s.p.id}#tab=valuation`}>{money(s.bv)}</Link>:'غير مدرجة',money(s.rent),s.yield==null?'—':pct(s.yield),s.arrears?money(s.arrears):'—',s.lastValDate?date(s.lastValDate):'—',date(s.nextEnd),s.idle?<Tag tone="bad">بلا دخل</Tag>:<Tag tone="ok">مؤجر</Tag>,occ==null?'—':<Link href={`/units?p=${s.p.id}`}>{occ}%</Link>],actions:[['فتح العقار',`/properties/${s.p.id}`],['الوحدات',`/units?p=${s.p.id}`],['العقود',`/contracts?p=${s.p.id}`],['القيمة والتقييمات',`/properties/${s.p.id}?tab=valuation`],['تقرير الأداء',`/reports/performance?p=${s.p.id}`]]};})} /></div>
      <p className="table-hint">مجموعات التأجير قد تضم وحدات فرعية. إجمالي العائد للمحفظة {a.totalBook ? pct((a.annualRent/a.totalBook)*100) : 'غير متاح دون قيمة دفترية'}؛ لا يُحسب بجمع نسب عائد العقارات.</p>
      <details className="screen-fold noprint"><summary>عرض بطاقات العقارات</summary>
      <div className="props noprint">{a.propStats.map((s) => (
        <Link key={s.p.id} href={`/properties/${s.p.id}`} className={'pc' + (s.idle ? ' idle' : '')}>
          <h3>{s.p.name}</h3><div className="loc">{s.p.location} • {s.p.ownership}</div>
          <div className="facts"><div><span>القيمة الدفترية</span><b>{s.bv ? money(s.bv) : 'غير مدرجة'}</b></div>
            <div><span>الإيجار السنوي</span><b>{money(s.rent)}</b></div><div><span>المتأخرات</span><b>{s.arrears ? money(s.arrears) : '—'}</b></div></div>
          {s.idle ? <Tag tone="bad">لا يوجد عقد ساري</Tag> : <Tag tone="ok">{s.contracts} عقود سارية</Tag>}
        </Link>))}</div>
      </details>
    </Page>
  );
}
