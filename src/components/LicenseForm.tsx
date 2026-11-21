import { LICENSE_KINDS } from '@/lib/ops';
import { saveLicense } from '@/lib/ops-actions';
export default function LicenseForm({ props, pid, back }: { props: { id: string; name: string }[]; pid?: string; back: string }) {
  return <form action={saveLicense} className="frm"><input type="hidden" name="back" value={back} /><div className="grid">
    {pid ? <input type="hidden" name="property_id" value={pid} /> : <label className="fld"><span>العقار</span><select name="property_id" required defaultValue=""><option value="" disabled>اختر</option>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <label className="fld"><span>نوع المستند</span><select name="kind" required>{LICENSE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
    <label className="fld"><span>الرقم</span><input name="number" dir="ltr" /></label><label className="fld"><span>جهة الإصدار</span><input name="issuer" /></label>
    <label className="fld"><span>تاريخ الإصدار</span><input type="date" name="issue_date" /></label><label className="fld"><span>تاريخ الانتهاء</span><input type="date" name="expiry_date" /></label>
    <label className="fld wide"><span>ملاحظات</span><input name="notes" /></label><label className="fld wide"><span>صورة المستند (PDF أو صورة)</span><input type="file" name="files" accept="application/pdf,image/*" multiple /></label>
  </div><div className="fa"><button className="btn" type="submit">حفظ المستند</button></div></form>;
}
