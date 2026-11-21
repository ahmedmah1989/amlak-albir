import { Ic } from './icons';
import { uploadAttachment, deleteAttachment } from '@/lib/actions2';
import { date } from '@/lib/fmt';
import type { AttachMeta } from '@/lib/types';
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} م.ب` : `${Math.max(1, Math.round(n / 1024))} ك.ب`);
export default function Attachments({ entity, id, items, back, canEdit, isAdmin, cats, title = 'المستندات المرفقة' }: {
  entity: string; id: string; items: AttachMeta[]; back: string; canEdit: boolean; isAdmin: boolean; cats: string[]; title?: string }) {
  const mine = items.filter((x) => x.entity === entity && x.entity_id === id);
  return (
    <div className="card"><h2><Ic n="clip" />{title} ({mine.length})</h2>
      {mine.length === 0 ? <p className="muted empty">لا توجد مرفقات بعد.</p> :
        <div className="att">{mine.map((f) => {
          const img = f.mime.startsWith('image/'), pdf = f.mime === 'application/pdf';
          return <div key={f.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <a className="f" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
              <span className="ft" style={{ background: pdf ? '#b3261e' : img ? 'transparent' : '#2f5d8a' }}>{img ? <img src={`/api/files/${f.id}`} alt="" /> : pdf ? 'PDF' : 'ملف'}</span>
              <span className="fn"><b>{f.file_name}</b><span>{f.category ?? 'مستند'} • {kb(f.size)}{f.expires_on ? ` • ينتهي ${date(f.expires_on)}` : ''}</span></span></a>
            {isAdmin && <form action={deleteAttachment} className="noprint"><input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value={back} /><button className="btn sm ghost" title="حذف">✕</button></form>}
          </div>; })}</div>}
      {canEdit && <form action={uploadAttachment} className="drop noprint">
        <input type="hidden" name="entity" value={entity} /><input type="hidden" name="entity_id" value={id} /><input type="hidden" name="back" value={back} />
        <label className="fld"><span><Ic n="up" /> اختر ملفات أو صوّر بالجوال (PDF أو صور، حتى 15 م.ب)</span><input type="file" name="files" multiple accept="application/pdf,image/*" required /></label>
        <label className="fld" style={{ maxWidth: '13rem' }}><span>النوع</span><select name="category">{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="fld" style={{ maxWidth: '11rem' }}><span>تاريخ الانتهاء (اختياري)</span><input type="date" name="expires_on" /></label>
        <button className="btn" type="submit">إرفاق</button></form>}
    </div>
  );
}
