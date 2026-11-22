// Scheduled notify/maintenance tick. Calls the app's existing /api/cron/notify
// route, which is CRON_SECRET-gated and self-gating (notify_hour, pm_last_run
// sentinels, sweep/retry only touch configured providers). With the charity's
// current settings (notify_enabled=0, no wa_url/pay_provider/smtp) a tick
// dispatches nothing externally; it only keeps internal maintenance warm.
// Cadence: every 10 minutes per the owner's original ask. UTC schedule.
export default async () => {
  const base = process.env.URL || 'https://amlak-albir.netlify.app';
  const res = await fetch(`${base}/api/cron/notify`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`notify tick failed: ${res.status}`);
  console.log('notify tick ok', res.status);
};

export const config = { schedule: '*/10 * * * *' };
