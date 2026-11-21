import 'server-only';
/**
 * إرسال رسالة نصية عبر بوابة SMS بأي مزود يدعم HTTP (مثل مزودي الرسائل في السعودية):
 * sms_url: رابط البوابة ويمكن أن يحتوي {phone} و{message} • sms_method: GET أو POST
 * sms_body: جسم الطلب لـ POST (JSON أو form) ويحتوي {phone} و{message} • sms_auth: قيمة ترويسة Authorization (اختياري)
 */
export const smsReady = (s: Record<string, string>) => !!s.sms_url;
export function intlPhone(p: string) { const d = p.replace(/\D/g, ''); return d.startsWith('966') ? d : d.startsWith('05') ? '966' + d.slice(1) : d.startsWith('5') && d.length === 9 ? '966' + d : d; }
export const waReady = (s: Record<string, string>) => !!s.wa_url;
export const sendSms = (s: Record<string, string>, phone: string, message: string) => sendGateway(s, 'sms', phone, message);
/** نفس آلية البوابة لرسائل واتساب عبر مزود API (wa_url, wa_method, wa_body, wa_auth) */
export const sendWhatsApp = (s: Record<string, string>, phone: string, message: string) => sendGateway(s, 'wa', phone, message);
async function sendGateway(all: Record<string, string>, k: 'sms' | 'wa', phone: string, message: string) {
  const s = { sms_url: all[k + '_url'], sms_method: all[k + '_method'], sms_body: all[k + '_body'], sms_auth: all[k + '_auth'] };
  if (!s.sms_url) throw new Error(k === 'wa' ? 'بوابة واتساب غير مضبوطة' : 'بوابة الرسائل غير مضبوطة');
  const ph = intlPhone(phone);
  const fill = (t: string, enc: boolean) => t.replace(/\{phone\}/g, enc ? encodeURIComponent(ph) : ph).replace(/\{message\}/g, enc ? encodeURIComponent(message) : JSON.stringify(message).slice(1, -1));
  const method = (s.sms_method || 'GET').toUpperCase();
  const headers: Record<string, string> = {}; if (s.sms_auth) headers.Authorization = s.sms_auth;
  let body: string | undefined;
  if (method === 'POST') { body = fill(s.sms_body || '{"to":"{phone}","text":"{message}"}', false); headers['Content-Type'] = body.trim().startsWith('{') ? 'application/json' : 'application/x-www-form-urlencoded'; }
  const r = await fetch(fill(s.sms_url, true), { method, headers, body, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${k === 'wa' ? 'بوابة واتساب' : 'بوابة الرسائل'} ردّت ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
