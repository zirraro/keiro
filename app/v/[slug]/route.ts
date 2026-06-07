/**
 * GET /v/[slug]
 *
 * Tracking short-link redirector. Logs the click → redirects to the
 * stored target_url. If the slug is unknown, 404s gracefully so we
 * don't leak the system to fuzzers.
 *
 * Used by Jade DM drafts (public visual URLs sent inside TikTok DMs)
 * so we can flag prospects who opened the link but didn't reply.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { resolveAndLog } from '@/lib/tracking/short-links';

export const runtime = 'nodejs';

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || !/^[a-z0-9]{4,16}$/.test(slug)) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const fwdIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ua = req.headers.get('user-agent') || undefined;
  const target = await resolveAndLog(slug, hashIp(fwdIp), ua);
  if (!target) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.redirect(target, 302);
}
