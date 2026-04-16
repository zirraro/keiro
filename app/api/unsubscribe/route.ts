import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyProspectToken } from '@/lib/email/unsubscribe-token';

export const runtime = 'nodejs';

/**
 * POST /api/unsubscribe  { token: string, reason?: string }
 *   Verifies the signed token, marks the prospect as perdu + unsubscribed,
 *   stops any running email/DM sequence and logs an activity.
 *
 * Also accepts GET /api/unsubscribe?t=... for one-click/RFC-8058 compatibility —
 * mail clients that pre-scan links won't touch POST but may touch GET, so we
 * still accept GET (idempotent: running it twice is safe).
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function runUnsubscribe(token: string, reason?: string) {
  const prospectId = verifyProspectToken(token);
  if (!prospectId) {
    return { ok: false, status: 400, error: 'invalid_token' as const };
  }

  const supabase = sb();

  const { data: prospect, error: findErr } = await supabase
    .from('crm_prospects')
    .select('id, email, status, email_sequence_status, user_id')
    .eq('id', prospectId)
    .maybeSingle();

  if (findErr) return { ok: false, status: 500, error: findErr.message };
  if (!prospect) return { ok: false, status: 404, error: 'prospect_not_found' as const };

  // Idempotent — if already unsubscribed, still return ok (so repeated clicks work).
  const alreadyDone = prospect.email_sequence_status === 'unsubscribed' && prospect.status === 'perdu';

  if (!alreadyDone) {
    const { error: updErr } = await supabase
      .from('crm_prospects')
      .update({
        status: 'perdu',
        temperature: 'cold',
        email_sequence_status: 'unsubscribed',
        dm_status: 'stopped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospectId);

    if (updErr) return { ok: false, status: 500, error: updErr.message };

    // Log the activity for audit (best-effort).
    try {
      const now = new Date().toISOString();
      await supabase.from('crm_activities').insert({
        prospect_id: prospectId,
        user_id: prospect.user_id,
        type: 'unsubscribe',
        description: reason
          ? `Désinscription via lien email — motif: ${String(reason).slice(0, 300)}`
          : 'Désinscription via lien email',
        date_activite: now,
        created_at: now,
      });
    } catch {}
  }

  return { ok: true as const, email: prospect.email, alreadyDone };
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const token = String(body?.token || '');
  const reason = body?.reason ? String(body.reason) : undefined;
  const result = await runUnsubscribe(token, reason);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || '';
  const result = await runUnsubscribe(token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
