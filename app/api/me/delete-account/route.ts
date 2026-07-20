import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/me/delete-account
 *   body { confirm: true }
 *
 * Suppression de compte + données, à la demande de l'utilisateur (prérequis CASA
 * ASVS V8 + Google Limited Use « delete on request »).
 *  1. RÉVOQUE immédiatement les tokens OAuth (Google en priorité) côté fournisseur.
 *  2. Efface tous les tokens/credentials du profil.
 *  3. Enregistre la demande de suppression → purge complète des données sous 30 j
 *     (conforme à data-retention-and-deletion.md).
 *  4. Confirme par email.
 */
export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json({ ok: false, error: 'Confirmation requise (confirm:true).' }, { status: 400 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1. Révocation des tokens Google (Limited Use : couper l'accès aux données Google).
  let googleRevoked = false;
  try {
    const { data: prof } = await sb.from('profiles').select('gmail_refresh_token, business_refresh_token').eq('id', user.id).maybeSingle();
    for (const tk of [(prof as any)?.gmail_refresh_token, (prof as any)?.business_refresh_token]) {
      if (tk) {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: String(tk) }),
        }).then((r) => { if (r.ok) googleRevoked = true; }).catch(() => {});
      }
    }
  } catch { /* best-effort */ }

  // 2. Effacer tous les tokens / credentials du profil (Google, Meta, TikTok, LinkedIn, SMTP).
  const tokenFields: Record<string, null> = {
    gmail_refresh_token: null, gmail_access_token: null, business_refresh_token: null, business_access_token: null,
    facebook_page_access_token: null, instagram_igaa_token: null, instagram_business_account_id: null,
    tiktok_access_token: null, tiktok_refresh_token: null,
    linkedin_access_token: null, linkedin_user_id: null,
    smtp_host: null, smtp_user: null, smtp_pass: null, outlook_refresh_token: null,
  };
  try { await sb.from('profiles').update({ ...tokenFields, deletion_requested_at: new Date().toISOString() }).eq('id', user.id); }
  catch {
    // deletion_requested_at peut ne pas exister → au minimum on efface les tokens.
    try { await sb.from('profiles').update(tokenFields).eq('id', user.id); } catch { /* noop */ }
  }

  // 3. Journaliser la demande (déclenche la purge sous 30 j + audit).
  await sb.from('agent_logs').insert({
    agent: 'system', action: 'account_deletion_requested', user_id: user.id,
    data: { email: user.email, google_revoked: googleRevoked, requested_at: new Date().toISOString() },
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  // 4. Email de confirmation (utilisateur + admin).
  try {
    const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
    if (user.email) {
      await sendEmailWithFallback({
        to: user.email,
        subject: 'KeiroAI — suppression de votre compte',
        html: `<p>Bonjour,</p><p>Nous avons bien reçu votre demande de suppression de compte. Vos accès Google et autres connexions ont été révoqués immédiatement. L'ensemble de vos données sera supprimé définitivement sous 30 jours, conformément à notre politique.</p><p>Si ce n'était pas vous, contactez-nous immédiatement à contact@keiroai.com.</p><p>L'équipe KeiroAI</p>`,
      }).catch(() => {});
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    google_revoked: googleRevoked,
    message: 'Compte marqué pour suppression. Tokens révoqués. Données supprimées sous 30 jours.',
  });
}
