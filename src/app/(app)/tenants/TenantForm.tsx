import { Form, F, Hidden } from '@/components/form';
import { saveTenant } from '@/lib/actions';
import type { Tenant } from '@/lib/types';
import { NATIONALITIES, opts, ATT_CATS } from '@/lib/fmt';
import FileFields from '@/components/FileFields';

export default function TenantForm({ t }: { t?: Tenant }) {
  return (
    <Form action={saveTenant} cancel={t ? `/tenants/${t.id}` : '/tenants'}>
      {t && <Hidden n="id" v={t.id} />}
      <h3 className="sec-title">الهوية</h3>
      <F label="الاسم (كما في الهوية أو السجل)" name="name" def={t?.name} req wide />
      <F label="نوع المستأجر" name="tenant_type" req def={t?.tenant_type ?? 'individual'} opts={[['individual', 'فرد'], ['company', 'منشأة / شركة']]} />
      <F label="رقم الهوية / الإقامة" name="national_id" def={t?.national_id} dir="ltr" hint="10 أرقام — للفرد أو لممثل المنشأة" />
      <F label="انتهاء الهوية" name="id_expiry" type="date" def={t?.id_expiry} />
      <F label="الجنسية" name="nationality" def={t?.nationality} opts={opts(NATIONALITIES)} />
      <F label="رقم السجل التجاري" name="cr_no" def={t?.cr_no} dir="ltr" hint="للمنشآت" />
      <F label="انتهاء السجل التجاري" name="cr_expiry" type="date" def={t?.cr_expiry} />
      <F label="الرقم الضريبي" name="vat_no" def={t?.vat_no} dir="ltr" hint="15 رقماً — إن وجد" />
      <h3 className="sec-title">التواصل</h3>
      <F label="الجوال الأساسي" name="phone" def={t?.phone} dir="ltr" placeholder="05xxxxxxxx" />
      <F label="جوال إضافي" name="phone2" def={t?.phone2} dir="ltr" />
      <F label="البريد الإلكتروني" name="email" type="email" def={t?.email} dir="ltr" />
      <F label="المفوض / مسؤول التواصل" name="contact_person" def={t?.contact_person} />
      <F label="العنوان الوطني" name="address" def={t?.address} wide />
      <h3 className="sec-title">الكفيل / الضامن</h3>
      <F label="اسم الكفيل" name="guarantor_name" def={t?.guarantor_name} />
      <F label="جوال الكفيل" name="guarantor_phone" def={t?.guarantor_phone} dir="ltr" />
      <F label="هوية الكفيل" name="guarantor_id" def={t?.guarantor_id} dir="ltr" />
      <F label="ملاحظات" name="notes" type="textarea" def={t?.notes} wide />
      <FileFields cats={ATT_CATS.tenant} label="صورة الهوية / السجل / العنوان الوطني (أكثر من ملف)" />
    </Form>
  );
}
