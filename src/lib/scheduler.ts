import 'server-only';
/**
 * جدولة داخلية بسيطة: تعمل داخل خادم البرنامج نفسه (لا تحتاج مهام ويندوز).
 * كل 10 دقائق تتحقق: إن كانت التنبيهات مفعّلة وتجاوزت الساعة الموعد المحدد ولم تُشغَّل اليوم، تُشغّل دورة واحدة.
 * تبدأ مع أول فتح لأي صفحة بعد تشغيل البرنامج.
 */
import { q, runAs, activeOrgs, MULTI } from './db';
import { billingTick } from './billing';
import { getSettings, todayRiyadh } from './data';
import { runCycle } from './notify';
import { sweepLinks } from './paylinks';
import { retryPending } from './zatca-engine';
import { createDuePM } from './ops';

const G = globalThis as unknown as { __amlakSched?: NodeJS.Timeout; __amlakBusy?: boolean };
const riyadhHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', hour12: false }).format(new Date()));
export async function tick() {
  if (G.__amlakBusy) return; G.__amlakBusy = true;
  try { if (MULTI) await billingTick().catch((e) => console.error('[الفوترة]', e)); for (const org of await activeOrgs()) await runAs(org, tickOrg); } catch (e) { console.error('[التنبيهات]', e); } finally { G.__amlakBusy = false; }
}
async function tickOrg() {
  try { await sweepLinks(); } catch (e) { console.error('[الدفع]', e); }
  try { await retryPending(); } catch (e) { console.error('[فاتورة]', e); }
  try { const S0 = await getSettings(), t0 = todayRiyadh(); if (S0.pm_last_run !== t0) { await q(`insert into settings values ('pm_last_run',$1) on conflict (key) do update set value=excluded.value`, [t0]); await createDuePM(); } } catch (e) { console.error('[الصيانة الدورية]', e); }
  try {
    const S = await getSettings(), today = todayRiyadh();
    if (S.notify_enabled !== '1' || S.notify_last_run === today || riyadhHour() < Number(S.notify_hour || 9)) return;
    await q(`insert into settings values ('notify_last_run',$1) on conflict (key) do update set value=excluded.value`, [today]);
    await runCycle('الجدولة التلقائية');
  } catch (e) { console.error('[التنبيهات]', e); }
}
export function ensureScheduler() {
  if (G.__amlakSched || process.env.AMLAK_NO_SCHEDULER === '1') return;
  G.__amlakSched = setInterval(() => { void tick(); }, 10 * 60 * 1000);
  setTimeout(() => { void tick(); }, 15000);
}
