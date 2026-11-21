import Link from 'next/link';
import type { Tenant, Unit, Property } from '@/lib/types';
import { Tag } from './ui';
import { date, TENANT_TYPE } from '@/lib/fmt';
import { daysBetween } from '@/lib/calc';

const V = ({ v, ltr }: { v: string | number | null | undefined; ltr?: boolean }) => v == null || v === '' ? <b><Tag tone="warn">غير مسجل</Tag></b> : <b dir={ltr ? 'ltr' : undefined}>{v}</b>;
const exp = (d: string | null, today: string) => !d ? <b className="muted">—</b> : <b>{date(d)} {daysBetween(today, d) < 0 ? <Tag tone="bad">منتهية</Tag> : daysBetween(today, d) <= 60 ? <Tag tone="warn">قريباً</Tag> : null}</b>;

/** بطاقة بيانات المستأجر الكاملة */
export function TenantCard({ t, today, docs, edit }: { t: Tenant; today: string; docs?: number; edit?: boolean }) {
  const co = t.tenant_type === 'company';
  return <div className="card"><h2>بيانات المستأجر <small><Link href={`/tenants/${t.id}`}>فتح الملف</Link>{edit && <> • <Link href={`/tenants/${t.id}/edit`}>تعديل</Link></>}</small></h2><div className="facts">
    <div><span>الاسم</span><b><Link href={`/tenants/${t.id}`}>{t.name}</Link></b></div>
    <div><span>النوع</span><b>{TENANT_TYPE[t.tenant_type ?? 'individual']}</b></div>
    <div><span>{co ? 'هوية الممثل' : 'الهوية / الإقامة'}</span><V v={t.national_id} ltr /></div>
    <div><span>انتهاء الهوية</span>{exp(t.id_expiry, today)}</div>
    {!co && <div><span>الجنسية</span><V v={t.nationality} /></div>}
    {(co || t.cr_no) && <><div><span>السجل التجاري</span><V v={t.cr_no} ltr /></div><div><span>انتهاء السجل</span>{exp(t.cr_expiry, today)}</div></>}
    <div><span>الرقم الضريبي</span><b dir="ltr">{t.vat_no ?? '—'}</b></div>
    <div><span>الجوال</span><V v={t.phone} ltr /></div>
    <div><span>جوال إضافي</span><b dir="ltr">{t.phone2 ?? '—'}</b></div>
    <div><span>البريد</span><b dir="ltr">{t.email ?? '—'}</b></div>
    <div><span>مسؤول التواصل</span><b>{t.contact_person ?? '—'}</b></div>
    <div><span>العنوان الوطني</span><V v={t.address} /></div>
    <div><span>الكفيل</span><b>{t.guarantor_name ?? '—'}{t.guarantor_phone && <div dir="ltr" className="muted">{t.guarantor_phone}</div>}</b></div>
    {docs != null && <div><span>مستندات المستأجر</span><b>{docs ? `${docs} ملف` : <Tag tone="warn">لا يوجد</Tag>}</b></div>}
  </div></div>;
}

/** بطاقة بيانات الوحدة / المحل */
export function UnitCard({ u, p, docs, edit }: { u: Unit; p: Property; docs?: number; edit?: boolean }) {
  return <div className="card"><h2>بيانات الوحدة / المحل <small><Link href={`/units/${u.id}`}>فتح الوحدة</Link>{edit && <> • <Link href={`/properties/${p.id}?unit=${u.id}#unit`}>تعديل</Link></>}</small></h2><div className="facts">
    <div><span>العقار</span><b><Link href={`/properties/${p.id}`}>{p.name}</Link></b></div>
    <div><span>الوحدة</span><b><Link href={`/units/${u.id}`}>{u.code}</Link></b></div>
    <div><span>النوع</span><V v={u.unit_type} /></div>
    <div><span>الدور</span><b>{u.floor ?? '—'}</b></div>
    <div><span>المساحة</span>{u.area ? <b>{Number(u.area).toLocaleString('en-US', { maximumFractionDigits: 2 })} م²</b> : <V v={null} />}</div>
    <div><span>الغرف</span><b>{u.rooms ?? '—'}</b></div>
    <div><span>عداد الكهرباء</span><V v={u.elec_meter} ltr /></div>
    <div><span>عداد المياه</span><b dir="ltr">{u.water_meter ?? '—'}</b></div>
    <div><span>الموقع</span><b>{p.location ?? '—'}</b></div>
    {docs != null && <div><span>مستندات الوحدة</span><b>{docs ? `${docs} ملف` : '—'}</b></div>}
  </div>{u.features && <p className="note">{u.features}</p>}{u.note && <p className="muted">{u.note}</p>}</div>;
}
