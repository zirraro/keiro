/**
 * GET /api/cron/tiktok-prospect-score
 *
 * Hourly cron: pick up to 30 TikTok prospects with no score (or stale
 * score >14d) per active client and call the matcher. Cheap (~€0.001
 * per prospect) and surfaces real ranking in JadeTiktokLive follows tab.
 *
 * Auth: CRON_SECRET. Scheduled from worker scheduler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scoreOneTiktokProspect } from '@/lib/agents/tiktok-prospect-scorer';

export const runtime = 'nodejs';
export const maxDuration = 180;

const PER_CLIENT_CAP = 30;
const STALE_DAYS = 14;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Get active clients that have a TikTok strategy
  const { data: clients } = await sb
    .from('profiles')
    .select('id, email')
    .not('tiktok_username', 'is', null)
    .limit(200);
  if (!clients || clients.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0 });
  }

  const staleSince = new Date(Date.now() - STALE_DAYS * 86400 * 1000).toISOString();
  let totalScored = 0;
  const perClient: Array<{ user_id: string; scored: number }> = [];

  for (const c of clients) {
    const { data: dossier } = await sb
      .from('business_dossiers')
      .select('audience_persona, business_type, value_proposition')
      .eq('user_id', c.id)
      .maybeSingle();
    if (!dossier?.audience_persona) continue;

    // Prospects without a score, or with a stale match_scored_at
    const { data: prospects } = await sb
      .from('crm_prospects')
      .select('id, business_notes')
      .eq('user_id', c.id)
      .not('tiktok_handle', 'is', null)
      .or(`score.is.null,score.eq.0`)
      .limit(PER_CLIENT_CAP);
    if (!prospects || prospects.length === 0) {
      perClient.push({ user_id: c.id, scored: 0 });
      continue;
    }

    let scored = 0;
    for (const p of prospects) {
      // Skip if already scored fresh
      const notes = (p.business_notes as any) || {};
      const lastScoredAt = notes.tiktok_match_scored_at;
      if (lastScoredAt && lastScoredAt > staleSince) continue;
      const r = await scoreOneTiktokProspect(sb, p.id, {
        audiencePersona: dossier.audience_persona,
        businessType: dossier.business_type,
        valueProposition: dossier.value_proposition,
      });
      if (r) scored++;
    }
    totalScored += scored;
    perClient.push({ user_id: c.id, scored });
  }

  return NextResponse.json({ ok: true, scanned: clients.length, totalScored, perClient: perClient.slice(0, 30) });
}
