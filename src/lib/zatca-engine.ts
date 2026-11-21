import 'server-only';
/** تشغيل المرحلة الثانية: التسجيل (الشهادات)، توقيع الفاتورة عند إصدارها، والإرسال للهيئة مع إعادة المحاولة */
import { q } from './db';
import { getSettings, todayRiyadh } from './data';
import { generateKeys, buildCsr, zatcaApi, certFromToken, pureXml, signInvoice, type InvInput, type Party } from './zatca2';
import { FIRST_PIH } from './zatca';

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>;
const setS = (k: string, v: string) => q('insert into settings values ($1,$2) on conflict (key) do update set value=excluded.value', [k, v]);
export const zatcaActive = (S: Record<string, string>) => S.zatca_stage === 'active' && !!S.zatca_pcsid && !!S.zatca_private_key;
export const sellerParty = (S: Record<string, string>): Party => ({ name: S.org, vat: S.org_vat_no, crn: S.org_cr || null, street: S.org_street, building: S.org_building, district: S.org_district, city: S.org_city, postal: S.org_postal });
export function missingSeller(S: Record<string, string>) {
  const need: [string, string][] = [['org_vat_no', 'الرقم الضريبي'], ['org_cr', 'السجل التجاري أو رقم الترخيص'], ['org_street', 'اسم الشارع'], ['org_building', 'رقم المبنى (4 أرقام)'], ['org_district', 'الحي'], ['org_city', 'المدينة'], ['org_postal', 'الرمز البريدي (5 أرقام)']];
  return need.filter(([k]) => !S[k]).map(([, l]) => l).concat(S.org_building && !/^\d{4}$/.test(S.org_building) ? ['رقم المبنى يجب أن يكون 4 أرقام'] : [], S.org_postal && !/^\d{5}$/.test(S.org_postal) ? ['الرمز البريدي 5 أرقام'] : []);
}
function sample(S: Record<string, string>, kind: 'invoice' | 'credit', standard: boolean, icv: number, pih: string): InvInput {
  const now = new Date(); const d = now.toISOString().slice(0, 10), tm = now.toISOString().slice(11, 19);
  return { uuid: crypto.randomUUID(), no: `TST-${icv}`, icv, pih, issueDate: d, issueTime: tm, kind, standard, seller: sellerParty(S),
    buyer: standard ? { name: 'شركة تجريبية', vat: '399999999900003', street: 'شارع تجريبي', building: '1234', district: 'حي تجريبي', city: S.org_city || 'الرياض', postal: '12345' } : { name: 'مستأجر تجريبي' },
    supplyDate: d, description: 'إيجار تجريبي', net: 1000, vat: 150, total: 1150, vatRate: 15, refNo: kind === 'credit' ? 'TST-1' : null, reason: kind === 'credit' ? 'تعديل تجريبي' : null };
}
/** التسجيل: OTP ← شهادة امتثال ← فحوص الامتثال ← شهادة إنتاج */
export async function onboard(otp: string, by: string) {
  const S = await getSettings(); const env = S.zatca_env || 'sandbox';
  const miss = missingSeller(S); if (miss.length) throw new Error('أكمل بيانات الجهة أولاً: ' + miss.join('، '));
  const keys = generateKeys(); const serial = `1-Amlak|2-1.0|3-${crypto.randomUUID()}`;
  const csr = buildCsr(keys.privatePem, { cn: `AMLAK-${S.org_vat_no}`, serial, vat: S.org_vat_no, org: S.org, branch: S.zatca_branch || 'الإدارة الرئيسية', address: `${S.org_street} ${S.org_building}, ${S.org_city}`, category: 'Real Estate', invoiceTypes: '1100', env });
  const c = await zatcaApi(env, '/compliance', { otp, body: { csr } });
  if (!c.ok || !c.json.binarySecurityToken) throw new Error(`رفضت الهيئة طلب شهادة الامتثال (${c.status}): ${JSON.stringify(c.json.errors ?? c.json.dispositionMessage ?? c.json).slice(0, 300)}`);
  await setS('zatca_private_key', keys.privatePem); await setS('zatca_csr', csr); await setS('zatca_ccsid', c.json.binarySecurityToken); await setS('zatca_ccsid_secret', c.json.secret); await setS('zatca_req_id', String(c.json.requestID)); await setS('zatca_stage', 'compliance'); await setS('zatca_egs_serial', serial);
  // فحوص الامتثال: فاتورة مبسطة وإشعار دائن مبسط وفاتورة قياسية وإشعارها
  const cert = certFromToken(c.json.binarySecurityToken); let pih = FIRST_PIH; const results: string[] = [];
  const S2 = await getSettings();
  for (const [i, [kind, std]] of ([['invoice', false], ['credit', false], ['invoice', true], ['credit', true]] as const).entries()) {
    const inv = sample(S2, kind, std, i + 1, pih); const pure = pureXml(inv);
    const sg = signInvoice(pure, cert, keys.privatePem, { seller: S2.org, vat: S2.org_vat_no, at: `${inv.issueDate}T${inv.issueTime}`, total: inv.total, tax: inv.vat }, std);
    const r = await zatcaApi(env, '/compliance/invoices', { auth: [c.json.binarySecurityToken, c.json.secret], body: { invoiceHash: sg.hash, uuid: inv.uuid, invoice: Buffer.from(sg.xml).toString('base64') } });
    const st = r.json.reportingStatus ?? r.json.clearanceStatus ?? r.status;
    results.push(`${std ? 'قياسية' : 'مبسطة'} ${kind === 'credit' ? 'دائن' : 'فاتورة'}: ${st}`);
    if (!r.ok) throw new Error(`فشل فحص الامتثال (${results.join(' • ')}): ${JSON.stringify(r.json.validationResults?.errorMessages ?? r.json).slice(0, 400)}`);
    pih = sg.hash;
  }
  const p = await zatcaApi(env, '/production/csids', { auth: [c.json.binarySecurityToken, c.json.secret], body: { compliance_request_id: String(c.json.requestID) } });
  if (!p.ok || !p.json.binarySecurityToken) throw new Error(`رفضت الهيئة شهادة الإنتاج (${p.status}): ${JSON.stringify(p.json.errors ?? p.json).slice(0, 300)}`);
  await setS('zatca_pcsid', p.json.binarySecurityToken); await setS('zatca_secret', p.json.secret); await setS('zatca_stage', 'active'); await setS('zatca_onboarded', `${todayRiyadh()} • ${by} • ${env}`);
  await q(`insert into activity_log (username,action,details) values ($1,'ربط الفاتورة الإلكترونية',$2)`, [by, `${env} • ${results.join(' • ')}`]);
  return results;
}
/** يوقّع الفاتورة داخل معاملة الإصدار: XML + تجزئة متسلسلة + QR المرحلة الثانية */
export async function signForInvoice(t: Q, S: Record<string, string>, f: { id: string; no: string; uuid: string; icv: number; at: string; kind: 'invoice' | 'credit'; buyer_name: string; buyer_vat: string | null; buyer_address?: string | null; description: string; net: number; vat: number; total: number; vat_rate: number; supply_date: string | null; ref_no?: string | null; reason?: string | null }) {
  const [prev] = await t(`select zhash from invoices where zhash is not null order by icv desc nulls last limit 1`);
  const standard = !!f.buyer_vat;
  const inv: InvInput = { uuid: f.uuid, no: f.no, icv: f.icv, pih: prev?.zhash ?? FIRST_PIH, issueDate: f.at.slice(0, 10), issueTime: f.at.slice(11, 19), kind: f.kind, standard, seller: sellerParty(S),
    buyer: standard ? { name: f.buyer_name, vat: f.buyer_vat, street: f.buyer_address || undefined, city: S.org_city, building: undefined, district: undefined, postal: undefined } : { name: f.buyer_name },
    supplyDate: f.supply_date, description: f.description, net: f.net, vat: f.vat, total: f.total, vatRate: f.vat_rate, refNo: f.ref_no, reason: f.reason };
  const sg = signInvoice(pureXml(inv), certFromToken(S.zatca_pcsid), S.zatca_private_key, { seller: S.org, vat: S.org_vat_no, at: f.at.replace('Z', ''), total: f.total, tax: f.vat }, standard);
  await t(`update invoices set xml=$2, zhash=$3, qr=$4, standard=$5, zatca_status='pending' where id=$1`, [f.id, sg.xml, sg.hash, sg.qr, standard]);
}
/** إرسال فاتورة موقعة للهيئة: إبلاغ (مبسطة) أو اعتماد (قياسية) */
export async function submitInvoice(id: string) {
  const S = await getSettings(); if (!zatcaActive(S)) return { ok: false, msg: 'الربط غير مفعّل' };
  const [inv] = await q('select id, uuid, zhash, xml, standard, zatca_status from invoices where id=$1', [id]);
  if (!inv?.xml) return { ok: false, msg: 'الفاتورة غير موقعة (صدرت قبل تفعيل الربط)' };
  if (['reported', 'cleared'].includes(inv.zatca_status)) return { ok: true, msg: 'أُرسلت من قبل' };
  const path = inv.standard ? '/invoices/clearance/single' : '/invoices/reporting/single';
  let r; try { r = await zatcaApi(S.zatca_env || 'sandbox', path, { auth: [S.zatca_pcsid, S.zatca_secret], clearance: !!inv.standard, body: { invoiceHash: inv.zhash, uuid: inv.uuid, invoice: Buffer.from(inv.xml).toString('base64') } }); }
  catch (e: any) { await q(`update invoices set zatca_status='failed', zatca_response=$2, zatca_sent_at=now() where id=$1`, [id, 'تعذر الاتصال بالهيئة: ' + e.message]); return { ok: false, msg: 'تعذر الاتصال بالهيئة: ' + e.message }; }
  const st = String(r.json.reportingStatus ?? r.json.clearanceStatus ?? '');
  const good = r.ok && /REPORTED|CLEARED/.test(st);
  const warn = (r.json.validationResults?.warningMessages ?? []).map((w: any) => w.message).join(' | ');
  const err = (r.json.validationResults?.errorMessages ?? []).map((w: any) => w.message).join(' | ');
  const status = good ? (inv.standard ? 'cleared' : 'reported') : r.status === 409 ? 'reported' : 'failed';
  await q(`update invoices set zatca_status=$2, zatca_response=$3, zatca_sent_at=now() ${r.json.clearedInvoice ? ', xml=$4' : ''} where id=$1`,
    r.json.clearedInvoice ? [id, status, (warn ? 'تحذيرات: ' + warn : '') + (err ? ' أخطاء: ' + err : '') || st, Buffer.from(r.json.clearedInvoice, 'base64').toString('utf8')] : [id, status, (warn ? 'تحذيرات: ' + warn : '') + (err ? ' أخطاء: ' + err : '') || `${r.status} ${st}`]);
  return { ok: status !== 'failed', msg: status === 'failed' ? `رفضت الهيئة الفاتورة: ${err || r.status}` : status === 'cleared' ? 'اعتمدت الهيئة الفاتورة' : 'تم إبلاغ الهيئة' };
}
export async function retryPending() {
  const S = await getSettings(); if (!zatcaActive(S)) return;
  for (const r of await q(`select id from invoices where xml is not null and (zatca_status='pending' or (zatca_status='failed' and zatca_response like 'تعذر الاتصال%')) and (zatca_sent_at is null or zatca_sent_at < now() - interval '30 minutes') order by icv limit 20`)) await submitInvoice(r.id).catch(() => {});
}
