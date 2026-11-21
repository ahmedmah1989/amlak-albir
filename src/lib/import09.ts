import 'server-only';
import data from '@/data/import-09.json';

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>;
type Tx = <T>(fn: (q: Q) => Promise<T>) => Promise<T>;

async function ins(q: Q, table: string, rows: Record<string, any>[], cols: string[]) {
  for (const r of rows) {
    await q(`insert into ${table} (${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')}) on conflict do nothing`, cols.map((c) => r[c] ?? null));
  }
}

/** ترحيلات تحديث 09 — تُنفَّذ مرة واحدة عند أول تشغيل، وكلها إضافة فقط. */
export async function runMigrations09(q: Q, tx: Tx) {
  const done = async (k: string) => (await q('select value from settings where key=$1', [k])).length > 0;
  // داخل المعاملة يجب استخدام اتصال المعاملة نفسه (PGlite لا يسمح باستعلام خارجي أثناء المعاملة)
  const mark = (t: Q, k: string, v: string) => t('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);

  // 1) سجل تقييم افتتاحي لكل عقار له قيمة مسجلة ولا يملك سجل تقييمات
  if (!(await done('mig09_valuations'))) {
    await tx(async (t) => {
      const ps = await t(`select p.* from properties p where (p.land_value is not null or p.building_value is not null)
        and not exists (select 1 from property_valuations v where v.property_id=p.id)`);
      for (const p of ps) await t(`insert into property_valuations (id,property_id,kind,val_date,land_value,building_value,basis,note,created_by)
        values ($1,$2,'initial',null,$3,$4,$5,'رصيد افتتاحي من بيانات العقار قبل تحديث 09','النظام') on conflict do nothing`,
        [p.id + '-v0', p.id, p.land_value, p.building_value, p.value_status]);
      await t(`update properties set land_basis = case when ownership='مستأجر من الغير' then 'leased' else 'owned' end where land_basis is null`);
      await mark(t, 'mig09_valuations', new Date().toISOString());
    });
  }

  // 2) العقارات الجديدة من ملف متابعة الإيجارات (بيانات مؤقتة قيد التأكيد)
  if (!(await done('import_09'))) {
    const d = data as any;
    await tx(async (t) => {
      await ins(t, 'properties', d.properties, ['id', 'name', 'short', 'type', 'location', 'ownership', 'land_value', 'building_value', 'value_status', 'notes', 'land_basis', 'data_status', 'data_source']);
      await ins(t, 'units', d.units, ['id', 'property_id', 'code', 'kind', 'unit_type', 'floor', 'rooms', 'monthly_rent', 'note']);
      await ins(t, 'tenants', d.tenants, ['id', 'name', 'phone', 'notes', 'tenant_type', 'contact_person']);
      await ins(t, 'contracts', d.contracts, ['id', 'property_id', 'unit_id', 'tenant_id', 'start_date', 'end_date', 'annual_rent', 'frequency', 'status', 'contract_no', 'notes']);
      await ins(t, 'installments', d.installments.map((i: any) => ({ ...i, kind: 'rent', note: i.note ?? '' })),
        ['id', 'contract_id', 'no', 'period_from', 'period_to', 'due_date', 'amount', 'opening_paid', 'needs_confirmation', 'note', 'src_receipt', 'src_dates', 'rating', 'kind']);
      await ins(t, 'property_valuations', d.valuations.map((v: any) => ({ ...v, created_by: 'النظام' })),
        ['id', 'property_id', 'kind', 'val_date', 'land_value', 'building_value', 'basis', 'note', 'created_by']);
      // عقار موجود (صلة الفقيد): تُكمَّل القيمة ونهاية عقد الأرض فقط إن كانت فارغة
      for (const e of d.existing ?? []) {
        const [p] = await t('select * from properties where id=$1', [e.property_id]); if (!p) continue;
        await t(`update properties set land_basis=$2 where id=$1 and (land_basis is null or land_basis='owned') and ownership<>'ملك الجمعية'`, [p.id, e.land_basis]);
        if (e.ground_lease_end) await t('update properties set ground_lease_end=$2 where id=$1 and ground_lease_end is null', [p.id, e.ground_lease_end]);
        const [{ n }] = await t('select count(*)::int n from property_valuations where property_id=$1', [p.id]);
        if (n === 0 && p.land_value == null && p.building_value == null && e.valuation) {
          const v = e.valuation;
          await ins(t, 'property_valuations', [{ ...v, created_by: 'النظام' }], ['id', 'property_id', 'kind', 'val_date', 'land_value', 'building_value', 'basis', 'note', 'created_by']);
          await t(`update properties set land_value=$2, building_value=$3, value_status=coalesce(value_status,'مسجلة') where id=$1`, [p.id, v.land_value, v.building_value]);
          await t(`update properties set value_status='مسجلة' where id=$1 and value_status='غير مدخلة'`, [p.id]);
        }
      }
      await t(`insert into activity_log (username,action,details) values ('النظام','استيراد مؤقت',$1)`,
        [`تحديث 09: إضافة ${d.properties.length} عقارات و${d.contracts.length} عقداً و${d.installments.length} قسطاً من ملف متابعة الإيجارات — بيانات مؤقتة قيد التأكيد`]);
      await mark(t, 'import_09', new Date().toISOString());
    });
  }
}
