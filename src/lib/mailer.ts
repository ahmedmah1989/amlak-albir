import 'server-only';
import net from 'net';
import tls from 'tls';

/** إرسال بريد عبر SMTP بدون حزم إضافية: SSL على 465 أو STARTTLS على 587، مع AUTH LOGIN */
export type Smtp = { host: string; port: number; secure: 'ssl' | 'starttls' | 'none'; user: string; pass: string; from: string };
export function smtpFrom(s: Record<string, string>): Smtp | null {
  if (!s.smtp_host || !s.smtp_user || !s.smtp_pass) return null;
  return { host: s.smtp_host, port: Number(s.smtp_port || 465), secure: (s.smtp_secure as Smtp['secure']) || 'ssl', user: s.smtp_user, pass: s.smtp_pass, from: s.smtp_from || s.smtp_user };
}
const b64 = (x: string) => Buffer.from(x, 'utf8').toString('base64');
export async function sendMail(cfg: Smtp, to: string, subject: string, text: string) {
  let sock: net.Socket | tls.TLSSocket = cfg.secure === 'ssl' ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : net.connect({ host: cfg.host, port: cfg.port });
  sock.setTimeout(20000);
  let buf = '';
  const read = () => new Promise<string>((res, rej) => {
    const onData = (d: Buffer) => { buf += d.toString('utf8'); const lines = buf.split('\r\n').filter(Boolean); const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) { const out = buf; buf = ''; sock.off('data', onData); res(out); } };
    sock.on('data', onData); sock.once('error', rej); sock.once('timeout', () => rej(new Error('انتهت مهلة خادم البريد')));
  });
  const cmd = async (c: string | null, ok: number[]) => { if (c != null) sock.write(c + '\r\n'); const r = await read(); const code = Number(r.slice(0, 3)); if (!ok.includes(code)) throw new Error(`خادم البريد رفض: ${r.trim().split('\r\n').pop()}`); return r; };
  try {
    await cmd(null, [220]); await cmd('EHLO amlak.local', [250]);
    if (cfg.secure === 'starttls') {
      await cmd('STARTTLS', [220]);
      sock = await new Promise<tls.TLSSocket>((res, rej) => { const t = tls.connect({ socket: sock as net.Socket, servername: cfg.host }, () => res(t)); t.once('error', rej); });
      sock.setTimeout(20000); await cmd('EHLO amlak.local', [250]);
    }
    await cmd('AUTH LOGIN', [334]); await cmd(b64(cfg.user), [334]); await cmd(b64(cfg.pass), [235]);
    const from = (cfg.from.match(/<([^>]+)>/)?.[1] ?? cfg.from).trim();
    await cmd(`MAIL FROM:<${from}>`, [250]); await cmd(`RCPT TO:<${to}>`, [250, 251]); await cmd('DATA', [354]);
    const msg = [`From: =?UTF-8?B?${b64('نظام الأملاك')}?= <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', `Date: ${new Date().toUTCString()}`, '', b64(text).replace(/.{76}/g, '$&\r\n'), '.'].join('\r\n');
    await cmd(msg, [250]); await cmd('QUIT', [221]).catch(() => {});
  } finally { sock.end(); }
}
