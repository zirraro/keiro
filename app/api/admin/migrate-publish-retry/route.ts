/**
 * One-shot migration endpoint — adds retry_count + next_retry_at to content_calendar.
 *
 * Why this exists: the Supabase Postgres host is not reachable from the founder's
 * Windows dev machine (IPv6-only route + pooler mismatch), so we ship the DDL as a
 * temporary admin endpoint that runs from Vercel's network where Supabase IS reachable.
 *
 * Usage: GET /api/admin/migrate-publish-retry with header `Authorization: Bearer <CRON_SECRET>`.
 * This route should be deleted once the migration has been applied to production.
 */
import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore — pg has no bundled types; runtime-only usage here
import { Client } from 'pg';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SQL = `
ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_content_calendar_retry_ready
  ON content_calendar (next_retry_at)
  WHERE status = 'retry_pending';
`;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Build Supabase direct PG connection string from the project ref.
  // The password must be provided at call time via ?pw=... query param because
  // it is not stored in env vars (we don't want a long-lived secret for a one-shot).
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    return NextResponse.json({ ok: false, error: 'Cannot infer Supabase project ref' }, { status: 500 });
  }

  const pw = request.nextUrl.searchParams.get('pw');
  if (!pw) {
    return NextResponse.json({ ok: false, error: 'Missing ?pw= with Supabase postgres password' }, { status: 400 });
  }

  const client = new Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: pw,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    await client.query(SQL);
    const check = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'content_calendar'
         AND column_name IN ('retry_count','next_retry_at')
       ORDER BY column_name`
    );
    return NextResponse.json({
      ok: true,
      applied: true,
      columns: check.rows.map((r: any) => r.column_name),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
