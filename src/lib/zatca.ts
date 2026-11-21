import 'server-only';
import { createHash, randomUUID } from 'crypto';
import qrcode from './vendor/qrcode';

/**
 * الفاتورة الضريبية — المرحلة الأولى (الإصدار): رمز QR بصيغة TLV حسب متطلبات هيئة الزكاة والضريبة والجمارك
 * (1 اسم البائع، 2 الرقم الضريبي، 3 وقت الإصدار، 4 الإجمالي شامل الضريبة، 5 مبلغ الضريبة).
 * جاهزية المرحلة الثانية (الربط): UUID لكل فاتورة، عداد فواتير ICV، وتجزئة متسلسلة PIH تربط كل فاتورة بالسابقة.
 * الربط الفعلي مع منصة «فاتورة» يحتاج شهادة CSID باسم الجمعية وتوقيع XML (UBL 2.1) — لا يُرسَل شيء من البرنامج حالياً.
 */
function tlv(tag: number, value: string) { const v = Buffer.from(value, 'utf8'); return Buffer.concat([Buffer.from([tag, v.length]), v]); }
export function zatcaQr(o: { seller: string; vat: string; at: string; total: number; tax: number }) {
  return Buffer.concat([tlv(1, o.seller), tlv(2, o.vat), tlv(3, o.at), tlv(4, o.total.toFixed(2)), tlv(5, o.tax.toFixed(2))]).toString('base64');
}
/** يفك TLV للتحقق (يُستخدم في الاختبار وعرض محتوى الرمز) */
export function decodeQr(b64: string) {
  const b = Buffer.from(b64, 'base64'); const out: Record<number, string> = {}; let i = 0;
  while (i < b.length) { const t = b[i], l = b[i + 1]; out[t] = b.subarray(i + 2, i + 2 + l).toString('utf8'); i += 2 + l; }
  return out;
}
export function qrSvg(text: string, size = 160) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qr: any = (qrcode as any)(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), q = 4, cell = size / (n + q * 2); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${((c + q) * cell).toFixed(2)} ${((r + q) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="رمز الفاتورة الضريبية"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
export const newUuid = () => randomUUID();
/** تجزئة الفاتورة (SHA-256 بترميز base64) على تمثيل ثابت لحقولها — تُستخدم كسلسلة PIH */
export function invoiceHash(f: Record<string, unknown>) {
  const canon = JSON.stringify(Object.keys(f).sort().reduce((o, k) => ({ ...o, [k]: f[k] }), {}));
  return createHash('sha256').update(canon).digest('base64');
}
export const FIRST_PIH = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';
