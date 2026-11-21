import { schedule } from '@netlify/functions';

// Daily backup at 23:00 UTC = 02:00 Asia/Riyadh. Calls the app's protected cron
// route, which writes the JSON backup to Supabase Storage (when configured).
export const handler = schedule('0 23 * * *', async (req) => {
  const origin = new URL(req.url).origin;
  const res = await fetch(origin + '/api/cron/backup', {
    headers: { authorization: 'Bearer ' + (process.env.CRON_SECRET || '') },
  });
  console.log('backup cron:', res.status, await res.text());
});
