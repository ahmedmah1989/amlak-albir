import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const t0 = Date.now();
  try {
    const [r] = await q('select 1 as one');
    const [sv] = await q(`select value from settings where key='schema_v'`).catch((e) => [{ value: 'ERR:' + String(e).slice(0, 200) }]);
    return NextResponse.json({ ok: true, one: r?.one, schema_v: sv?.value ?? null, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ ok: false, ms: Date.now() - t0, error: String(e), stack: (e as Error)?.stack?.slice(0, 900) }, { status: 500 });
  }
}
