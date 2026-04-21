import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  return !!cronSecret && auth === `Bearer ${cronSecret}`;
}

/**
 * POST /api/agents/onboarding/check-stuck
 *
 * Clara's proactive outreach. Scans active clients and, for anyone who:
 *   - has had their account for ≥ 3 days
 *   - has dossier completeness_score < 50
 *   - hasn't already been offered a setup call
 * … drops a client_notifications row offering a 1-to-1 setup call.
 *
 * Critical business rationale (from user 2026-04-21): the dossier data
 * feeds Jade (content), Léna (DMs/comments), Théo (Google reviews), Hugo
 * (emails) — an incomplete dossier means generic, low-conversion output
 * across every agent. Catching stuck clients early and offering human
 * help lifts the floor for the whole agent stack.
 *
 * Booking URL comes from env SETUP_CALL_URL (Calendly/Cal.com link).
 */
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const bookingUrl = process.env.SETUP_CALL_URL || 'mailto:contact@keiroai.com?subject=Setup%20call%20KeiroAI';
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // Active paying clients only. Admin + free tier are out of scope.
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, first_name, subscription_plan, created_at, onboarding_setup_meeting_offered_at, is_admin')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free')
    .neq('is_admin', true)
    .lte('created_at', threeDaysAgo);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ ok: true, offered: 0, skipped_total: 0 });
  }

  let offered = 0;
  const skipped: string[] = [];

  for (const c of clients) {
    // Skip if we already pinged them in the last 14 days (don't spam).
    if (c.onboarding_setup_meeting_offered_at) {
      const since = new Date(c.onboarding_setup_meeting_offered_at).getTime();
      if (now.getTime() - since < 14 * 24 * 60 * 60 * 1000) {
        skipped.push(`${c.id}:recent_ping`);
        continue;
      }
    }

    const { data: dossier } = await supabase
      .from('business_dossiers')
      .select('completeness_score')
      .eq('user_id', c.id)
      .maybeSingle();

    const score = dossier?.completeness_score ?? 0;
    if (score >= 50) {
      skipped.push(`${c.id}:score_ok(${score})`);
      continue;
    }

    const firstName = c.first_name || 'cher client';

    await supabase.from('client_notifications').insert({
      user_id: c.id,
      agent: 'onboarding',
      type: 'setup_call_offer',
      title: 'Clara te propose un coup de main (30 min, gratuit)',
      message: `Ton dossier business est à ${score}% — les agents ont besoin de plus d'infos sur ton business pour bien cibler. On fait 30 min ensemble pour le finir vite et bien ?`,
      data: {
        completeness_score: score,
        booking_url: bookingUrl,
        first_name: firstName,
        reason: `dossier_under_50_after_3d`,
      },
    }).throwOnError?.();

    await supabase.from('profiles').update({
      onboarding_setup_meeting_offered_at: now.toISOString(),
    }).eq('id', c.id);

    await supabase.from('agent_logs').insert({
      agent: 'onboarding',
      action: 'setup_call_offered',
      status: 'ok',
      user_id: c.id,
      data: { completeness_score: score, booking_url: bookingUrl },
      created_at: now.toISOString(),
    }).throwOnError?.();

    offered++;
  }

  return NextResponse.json({ ok: true, offered, skipped_total: skipped.length, skipped_breakdown: skipped.slice(0, 20) });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
