import type { ReactNode } from 'react';
import { Page, XL } from '@/components/ui';
import { q } from '@/lib/db';
import { PRESETS, reportQuery, type ReportParams, type SP } from '@/lib/report-params';
import { reportById } from '@/lib/reports-catalog';
import { toggleFavorite, saveReport } from '@/lib/report-actions';
import type { DB } from '@/lib/types';

export type ParamKey = 'period' | 'compare' | 'property' | 'tenant' | 'method' | 'status' | 'group' | 'detail' | 'days' | 'chart';
/**
 * إطار موحد لكل التقارير: لوحة معايير ثابتة على اليمين وورقة التقرير بترويستها على اليسار.
 * المعايير كلها في رابط الصفحة، فالتقرير المحفوظ والطباعة والإكسل تستخدم نفس النطاق.
 */
export default async function ReportFrame({ id, title, sub, sp, rp, db, org, asOf, userId, params, groups = [], statuses = [], methods = [], xl, children, extraScope, hideFilters }: {
  id: string; title: string; sub?: string; sp: SP; rp: ReportParams; db: DB; org: string; asOf: string; userId: string;
  params: ParamKey[]; groups?: [string, string][]; statuses?: [string, string][]; methods?: string[]; xl?: { r: string; q?: string }; children: ReactNode; extraScope?: string; hideFilters?: boolean;
}) {
  const def = reportById(id);
  const fav = (await q(`select id from saved_reports where user_id=$1 and kind='fav' and report_id=$2`, [userId, id])).length > 0;
  const href = (def?.href.split('?')[0] ?? '/reports') + reportQuery(sp);
  const has = (k: ParamKey) => params.includes(k);
  const P = new Map(db.properties.map((p) => [p.id, p.short]));
  const scope = [has('period') ? rp.label : '', rp.cLabel && `مقارنة مع ${rp.cLabel}`, rp.props.length ? rp.props.map((x) => P.get(x)).join('، ') : has('property') ? 'كل العقارات' : '',
    rp.tenant && db.tenants.find((t) => t.id === rp.tenant)?.name, rp.method, rp.status && statuses.find((x) => x[0] === rp.status)?.[1],
    rp.group && groups.find((g) => g[0] === rp.group) && `مجمّع حسب ${groups.find((g) => g[0] === rp.group)![1]}`, has('days') && `خلال ${rp.days} يوماً`, extraScope].filter(Boolean).join(' • ');
  const keep = (names: string[]) => names.map((n) => sp[n] ? <input key={n} type="hidden" name={n} value={sp[n]} /> : null);
  return (
    <Page title={title} sub={sub} org={org} asOf={asOf} print sig={rp.sig} filters={scope} back={['/reports', 'مركز التقارير']}
      actions={<>
        <form action={toggleFavorite} className="inline noprint"><input type="hidden" name="report_id" value={id} /><input type="hidden" name="back" value={href} />
          <button className={'btn ghost fav-btn' + (fav ? ' on' : '')} type="submit" title={fav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}>{fav ? '★ في المفضلة' : '☆ مفضلة'}</button></form>
        <details className="quick-new save-report noprint"><summary className="btn ghost">حفظ كتقرير</summary><div>
          <form action={saveReport} className="save-report-form"><input type="hidden" name="report_id" value={id} /><input type="hidden" name="href" value={href} />
            <label className="fld"><span>اسم التقرير المحفوظ</span><input name="name" required maxLength={80} placeholder={`مثل: ${title} — ${rp.label}`} /></label>
            <label className="chk"><input type="checkbox" name="shared" value="1" /> مشاركة مع باقي المستخدمين</label>
            <button className="btn sm" type="submit">حفظ بالمعايير الحالية</button></form></div></details>
        {xl && <XL r={xl.r} q={xl.q ?? ''} />}
      </>}>
      {rp.orient === 'p' && <style>{'@media print{@page{size:A4 portrait}}'}</style>}
      <div className={'report-layout' + (hideFilters ? ' no-params' : '')}>
        {!hideFilters && <form method="get" className="report-params noprint" aria-label="معايير التقرير">
          {has('period') && <fieldset><legend>الفترة</legend>
            <div className="chips">{PRESETS.filter(([k]) => k !== 'custom').map(([k, l]) => <a key={k} href={reportQuery(sp, { pr: k, from: undefined, to: undefined })} className={rp.preset === k ? 'on' : ''}>{l}</a>)}</div>
            <div className="two"><label className="fld"><span>من</span><input type="date" name="from" defaultValue={rp.from} /></label><label className="fld"><span>إلى</span><input type="date" name="to" defaultValue={rp.to} /></label></div></fieldset>}
          {has('compare') && <fieldset><legend>مقارنة مع</legend><div className="chips">{([['none', 'بدون'], ['prev', 'الفترة السابقة'], ['yoy', 'نفس الفترة العام السابق']] as [string, string][]).map(([k, l]) =>
            <label key={k} className={'chip-radio' + (rp.compare === k ? ' on' : '')}><input type="radio" name="cmp" value={k} defaultChecked={rp.compare === k} />{l}</label>)}</div></fieldset>}
          {has('days') && <fieldset><legend>الأفق الزمني</legend><div className="chips">{[30, 60, 90, 180, 365].map((d) => <a key={d} href={reportQuery(sp, { days: String(d) })} className={rp.days === d ? 'on' : ''}>{d} يوماً</a>)}</div></fieldset>}
          {(has('property') || has('tenant') || has('method') || has('status')) && <fieldset><legend>النطاق</legend>
            {has('property') && <label className="fld"><span>العقار</span><select name="p" defaultValue={rp.props[0] ?? ''}><option value="">كل العقارات</option>{db.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
            {has('tenant') && <label className="fld"><span>المستأجر</span><select name="t" defaultValue={rp.tenant}><option value="">كل المستأجرين</option>{db.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
            {has('method') && methods.length > 0 && <label className="fld"><span>طريقة السداد</span><select name="m" defaultValue={rp.method}><option value="">الكل</option>{methods.map((m) => <option key={m}>{m}</option>)}</select></label>}
            {has('status') && statuses.length > 0 && <label className="fld"><span>الحالة</span><select name="st" defaultValue={rp.status}><option value="">الكل</option>{statuses.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
          </fieldset>}
          {(has('group') || has('detail') || has('chart')) && <fieldset><legend>العرض</legend>
            {has('detail') && <div className="chips">{([['summary', 'ملخص'], ['detail', 'تفصيلي']] as [string, string][]).map(([k, l]) => <label key={k} className={'chip-radio' + (rp.detail === k ? ' on' : '')}><input type="radio" name="d" value={k} defaultChecked={rp.detail === k} />{l}</label>)}</div>}
            {has('group') && groups.length > 0 && <label className="fld"><span>تجميع حسب</span><select name="g" defaultValue={rp.group}>{groups.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
            {has('chart') && <label className="chk"><input type="checkbox" name="ch" value="0" defaultChecked={!rp.chart} /> إخفاء الرسم البياني</label>}
          </fieldset>}
          <fieldset><legend>الطباعة</legend>
            <div className="chips">{([['l', 'عرضي'], ['p', 'طولي']] as [string, string][]).map(([k, l]) => <label key={k} className={'chip-radio' + (rp.orient === k ? ' on' : '')}><input type="radio" name="o" value={k} defaultChecked={rp.orient === k} />{l}</label>)}</div>
            <label className="chk"><input type="checkbox" name="sig" value="0" defaultChecked={!rp.sig} /> بدون خانات التوقيع</label>
            <label className="fld"><span>ملاحظة أسفل التقرير</span><input name="note" defaultValue={rp.note} maxLength={300} placeholder="تظهر في الطباعة" /></label>
          </fieldset>
          {keep(has('period') ? ['pr'] : ['pr', 'from', 'to'])}{keep(has('days') ? ['days'] : [])}
          <div className="report-params-actions"><button className="btn" type="submit">تطبيق</button><a className="btn ghost" href={def?.href.split('?')[0] ?? '?'}>الافتراضي</a></div>
        </form>}
        <div className="report-paper">{children}{rp.note && <p className="report-note">ملاحظة: {rp.note}</p>}</div>
      </div>
    </Page>
  );
}

/** مقارنة رقمين لعرضها في المؤشرات */
export function Delta({ cur, prev, money: m, invert }: { cur: number; prev: number | null; money?: (n: number) => string; invert?: boolean }) {
  if (prev == null) return null;
  const d = cur - prev, pc = prev ? (d / Math.abs(prev)) * 100 : null, good = invert ? d < 0 : d > 0;
  return <span className={'delta ' + (d === 0 ? '' : good ? 'up' : 'down')}>{d > 0 ? '▲' : d < 0 ? '▼' : '●'} {m ? m(Math.abs(d)) : Math.abs(d)}{pc != null ? ` (${pc > 0 ? '+' : ''}${pc.toFixed(1)}%)` : ''}</span>;
}
