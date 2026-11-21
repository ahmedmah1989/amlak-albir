import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ctx } from '@/lib/ctx';
import { Page, Tag, Kpi } from '@/components/ui';
import { q } from '@/lib/db';
import { commitImport, revertImport } from '@/lib/actions8';
import { ENTITY_LABEL, LABELS, type Plan, type Entity } from '@/lib/importer';
import { money, date, IMPORT_STATUS as ST } from '@/lib/fmt';

const RS: Record<string, [string, string]> = { new: ['جديد', 'info'], update: ['تعديل', 'warn'], same: ['مطابق', 'mute'], error: ['خطأ', 'bad'] };
const show = (v: unknown) => v == null || v === '' ? '—' : typeof v === 'number' ? money(v) : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? date(String(v)) : String(v);
export default async function ImportBatch({ params, searchParams }: { params: { id: string }; searchParams: { e?: string; st?: string } }) {
  const { org, asOf } = await ctx('admin');
  const [b] = await q('select * from import_batches where id=$1', [params.id]); if (!b) notFound();
  const plan = JSON.parse(b.payload) as Plan, preview = b.status === 'preview';
  const files = await q(`select id, file_name from attachments where entity='import' and entity_id=$1`, [b.id]);
  const ents = (Object.keys(ENTITY_LABEL) as Entity[]).filter((e) => plan.rows.some((r) => r.entity === e));
  const e = (searchParams.e as Entity) ?? ents[0], st = searchParams.st ?? '';
  const rows = plan.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.entity === e && (!st || r.status === st));
  const c = (en: Entity | null, s0: string) => plan.rows.filter((r) => (!en || r.entity === en) && r.status === s0).length;
  const sm = JSON.parse(b.summary || '{}');
  return (
    <Page title={`دفعة الاستيراد ${b.batch_no}`} sub={`${b.file_name ?? ''} • ${plan.kind === 'template' ? 'النموذج الموحد' : 'ملف متابعة الإيجارات'} • رفعها ${b.created_by}`} org={org} asOf={asOf} print back={['/imports', 'استيراد البيانات']}
      actions={<Tag tone={ST[b.status]?.[1] ?? 'mute'}>{ST[b.status]?.[0]}</Tag>}>
      <div className="kpis">
        <Kpi l="سجلات جديدة" v={String(c(null, 'new'))} tone="info" s="تُضاف بحالة «مؤقتة»" />
        <Kpi l="تعديلات على موجود" v={String(c(null, 'update'))} tone="warn" s="تختار الحقول التي تُطبّق" />
        <Kpi l="مطابقة (بلا تغيير)" v={String(c(null, 'same'))} />
        <Kpi l="أخطاء (لن تُستورد)" v={String(c(null, 'error'))} tone={c(null, 'error') ? 'bad' : ''} />
      </div>
      {sm.committed && <p className="note">اعتُمدت: {sm.committed.property} عقار • {sm.committed.unit} وحدة • {sm.committed.tenant} مستأجر • {sm.committed.contract} عقد • {sm.committed.installment + sm.committed.generated} قسط (منها {sm.committed.generated} مولّد) • {sm.committed.updates} حقل معدّل.</p>}
      {plan.warnings.length > 0 && <div className="note warn"><b>ملاحظات القراءة ({plan.warnings.length})</b><ul>{plan.warnings.slice(0, 30).map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
      {files.length > 0 && <p className="noprint">الملف الأصلي: {files.map((f) => <a key={f.id} href={`/api/files/${f.id}`}>{f.file_name}</a>)}</p>}
      <form action={commitImport} id="commit-form"><input type="hidden" name="id" value={b.id} />
        <div className="filter-stack noprint"><div className="filters">{ents.map((en) => <Link key={en} href={`?e=${en}${st ? '&st=' + st : ''}`} className={e === en ? 'on' : ''}>{ENTITY_LABEL[en]} ({plan.rows.filter((r) => r.entity === en).length})</Link>)}</div>
          <div className="filters">{[['', 'الكل'], ['new', 'جديد'], ['update', 'تعديل'], ['error', 'أخطاء'], ['same', 'مطابق']].map(([k, l]) => <Link key={k} href={`?e=${e}${k ? '&st=' + k : ''}`} className={st === k ? 'on' : ''}>{l} ({k ? c(e, k) : plan.rows.filter((r) => r.entity === e).length})</Link>)}</div></div>
        <div className="card"><div className="tbl"><table>
          <thead><tr><th>الحالة</th><th>السجل</th><th>البيانات / المقارنة قبل وبعد</th><th>المصدر في الملف</th>{preview && <th className="noprint">تطبيق</th>}</tr></thead>
          <tbody>{rows.map(({ r, i }) => <tr key={i}>
            <td><Tag tone={RS[r.status][1]}>{RS[r.status][0]}</Tag></td>
            <td><b>{r.data.name ?? r.data.code ?? (r.entity === 'contract' ? `${r.data.unit ?? ''} — ${r.data.tenant ?? ''}` : r.entity === 'installment' ? `قسط ${r.data.no ?? ''} • ${show(r.data.due_date)}` : '—')}</b>{r.data.property && r.entity !== 'property' && <div className="cell-sub">{r.data.property}</div>}</td>
            <td>{r.errors.length > 0 && <div className="amount-bad">{r.errors.join(' • ')}</div>}
              {r.status === 'update' ? <table className="diff"><thead><tr>{preview && <th></th>}<th>الحقل</th><th>الحالي في البرنامج</th><th>في الملف</th></tr></thead><tbody>
                {r.diffs.map((d) => <tr key={d.field}>{preview && <td><input type="checkbox" name={`ap:${i}:${d.field}`} value="1" form="commit-form" aria-label={`تطبيق ${d.label}`} /></td>}<td>{d.label}</td><td className="old">{show(d.old)}</td><td className="new">{show(d.next)}</td></tr>)}</tbody></table>
                : <span className="kv-line">{Object.entries(r.data).filter(([k, v]) => v != null && v !== '' && LABELS[k] && !['property', 'contract'].includes(k)).map(([k, v]) => <span key={k}>{LABELS[k]}: <b>{show(v)}</b></span>)}</span>}</td>
            <td className="cell-sub">{r.source}</td>
            {preview && <td className="noprint">{r.status === 'new' ? <label className="chk"><input type="checkbox" name="skip" value={i} form="commit-form" /> استبعاد</label> : r.status === 'update' ? 'اختر الحقول' : '—'}</td>}
          </tr>)}{!rows.length && <tr><td colSpan={5} className="muted">لا توجد سجلات بهذا التصنيف.</td></tr>}</tbody></table></div></div>
        {preview && <div className="card noprint import-actions"><p>الاعتماد يضيف السجلات الجديدة (غير المستبعدة) بحالة «مؤقتة»، ويطبّق الحقول المختارة فقط على السجلات الموجودة مع تسجيلها في سجل التغييرات. الأخطاء لا تُستورد.</p>
          <button className="btn" type="submit">اعتماد الدفعة</button></div>}
      </form>
      {(preview || b.status === 'committed') && <details className="box noprint"><summary>{preview ? 'تجاهل الدفعة' : 'التراجع عن الدفعة'}</summary><div className="in">
        <form action={revertImport} className="frm"><input type="hidden" name="id" value={b.id} /><p>{preview ? 'تُحذف المعاينة دون أي تغيير على البيانات.' : 'تُحذف كل السجلات التي أضافتها الدفعة (عقارات ووحدات ومستأجرون وعقود وأقساط). لا يمكن ذلك إن سُجّلت عليها سندات. التعديلات على السجلات القديمة لا تُرجع تلقائياً وهي موجودة في سجل التغييرات.'}</p>
          <button className="btn danger" type="submit">{preview ? 'تجاهل' : 'تراجع نهائي'}</button></form></div></details>}
    </Page>
  );
}
