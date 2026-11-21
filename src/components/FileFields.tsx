/** حقول إرفاق عدة ملفات داخل نموذج الحفظ نفسه */
export default function FileFields({ cats, label = 'إرفاق مستندات (يمكن اختيار أكثر من ملف)' }: { cats: string[]; label?: string }) {
  return <>
    <h3 className="sec-title">المستندات</h3>
    <label className="fld wide"><span>📎 {label}</span><input type="file" name="files" multiple accept="application/pdf,image/*" /><small>PDF أو صور حتى 15 م.ب للملف. يمكن التصوير بالجوال مباشرة. تُحفظ مع البيانات بضغطة واحدة.</small></label>
    <label className="fld"><span>نوع المستندات</span><select name="file_category" defaultValue={cats[0]}>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
    <label className="fld"><span>تاريخ انتهاء المستند (اختياري)</span><input type="date" name="file_expires" /></label>
  </>;
}
