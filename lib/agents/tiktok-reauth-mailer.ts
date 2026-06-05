/**
 * 2026-06-05 — TikTok client reauth mailer.
 *
 * Founder ask: "pas necessaire pour admin a l'erreur il faut juste
 * prevenir au digest de fin de journée si client pas reconnecté et
 * au moment de l'erreur envoyer un mail au client concerné et lui
 * demander de se reconnecter pour publication".
 *
 * Single source of truth for sending the TikTok reconnect email to
 * the affected client + logging the failed post_id so we can
 * re-launch publication once they reconnect.
 *
 * Dedup: skip if an email already went out in the last 12h for the
 * same user (avoids client spam if multiple posts fail in a row).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function notifyClientTikTokReauth(
  supabase: SupabaseClient,
  userId: string,
  failedPostId: string | null,
  reasonHint: string,
): Promise<{ emailSent: boolean; deduped: boolean; postQueued: boolean }> {
  const result = { emailSent: false, deduped: false, postQueued: false };
  if (!userId) return result;

  const since12h = new Date(Date.now() - 12 * 3600 * 1000).toISOString();

  // 1. Queue the failed post_id so the OAuth callback can re-launch it
  if (failedPostId) {
    try {
      await supabase.from('agent_logs').insert({
        agent: 'content',
        action: 'tiktok_post_pending_reauth',
        status: 'pending',
        user_id: userId,
        data: { post_id: failedPostId, reason: reasonHint.substring(0, 200) },
        created_at: new Date().toISOString(),
      });
      result.postQueued = true;
    } catch { /* logging best-effort */ }
  }

  // 2. Dedup: any reauth email already sent in the last 12h?
  try {
    const { data: recent } = await supabase
      .from('agent_logs')
      .select('id')
      .eq('agent', 'content')
      .eq('action', 'tiktok_reauth_email_sent')
      .contains('data', { user_id: userId })
      .gte('created_at', since12h)
      .limit(1);
    if (recent && recent.length > 0) {
      result.deduped = true;
      return result;
    }
  } catch { /* fail-open : if dedup query fails we still try to send */ }

  // 3. Load client profile
  let profile: any = null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('email, first_name, tiktok_username, is_admin')
      .eq('id', userId)
      .single();
    profile = data;
  } catch { return result; }
  if (!profile?.email) return result;

  // Skip if this is the admin account (we don't spam ourselves)
  if (profile.is_admin) {
    // Still log the event so the digest knows, just don't send mail
    try {
      await supabase.from('agent_logs').insert({
        agent: 'content',
        action: 'tiktok_reauth_email_sent',
        status: 'skipped_admin',
        user_id: userId,
        data: { user_id: userId, email: profile.email, reason: reasonHint.substring(0, 200), admin_skip: true },
        created_at: new Date().toISOString(),
      });
    } catch {}
    return result;
  }

  // 4. Send the reconnect email
  try {
    const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
    const firstName = profile.first_name || 'toi';
    const reconnectUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/api/auth/tiktok-oauth`;
    const subject = 'Reconnecte ton TikTok à KeiroAI 🎵';
    const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
  <h2 style="color:#0c1a3a;margin:0 0 16px;">Salut ${firstName} 👋</h2>
  <p style="line-height:1.6;">L'accès TikTok via KeiroAI a expiré et le renouvellement automatique a échoué (révocation côté TikTok).<br><br>Résultat : ton dernier post programmé n'a pas pu partir, et Léna ne pourra plus publier sur ton compte TikTok tant que tu n'as pas reconnecté.</p>
  <p style="line-height:1.6;"><strong>Ce qu'il faut faire :</strong> reconnecte en 30 secondes. Dès que c'est fait, KeiroAI relance automatiquement les posts qui n'avaient pas pu partir.</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${reconnectUrl}" style="display:inline-block;background:linear-gradient(135deg,#000,#ff0050);color:#fff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px;">Reconnecter mon TikTok →</a>
  </div>
  <p style="font-size:13px;color:#64748b;line-height:1.6;">Les jetons d'accès TikTok ont une durée de vie de 24h, KeiroAI les renouvelle en silence à chaque publication. Quand TikTok révoque la session (sécurité, déconnexion manuelle ailleurs, etc.) une reconnexion humaine est nécessaire.</p>
  <p style="font-size:12px;color:#94a3b8;margin-top:24px;">— L'équipe KeiroAI</p>
</body></html>`;
    const text = `Salut ${firstName},\n\nTon TikTok via KeiroAI a expiré et le renouvellement auto a échoué. Reconnecte en 30s : ${reconnectUrl}\n\nDès reconnexion, on relance automatiquement les posts en attente.\n\n— KeiroAI`;
    const sendRes = await sendEmailWithFallback({
      to: profile.email,
      toName: firstName,
      subject,
      html,
      textContent: text,
      fromName: 'KeiroAI',
      fromEmail: 'contact@keiroai.com',
      tags: ['tiktok_reauth', 'on_error'],
    });
    if (sendRes.ok) {
      result.emailSent = true;
      await supabase.from('agent_logs').insert({
        agent: 'content',
        action: 'tiktok_reauth_email_sent',
        status: 'success',
        user_id: userId,
        data: { user_id: userId, email: profile.email, reason: reasonHint.substring(0, 200), trigger: 'on_publish_error' },
        created_at: new Date().toISOString(),
      });
    }
  } catch (e: any) {
    console.warn('[tiktok-reauth-mailer] send failed:', e?.message);
  }

  return result;
}

/**
 * Re-launch all posts that were queued as "pending reauth" for this
 * user when they reconnect TikTok (called from the OAuth callback).
 * Only picks pending-reauth events from the last 7 days.
 */
export async function relaunchPendingPostsAfterReauth(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ relaunched: number; postIds: string[] }> {
  const result = { relaunched: 0, postIds: [] as string[] };
  if (!userId) return result;

  const since7d = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: pendingEvents } = await supabase
    .from('agent_logs')
    .select('id, data, created_at')
    .eq('agent', 'content')
    .eq('action', 'tiktok_post_pending_reauth')
    .eq('user_id', userId)
    .gte('created_at', since7d)
    .order('created_at', { ascending: false });

  if (!pendingEvents || pendingEvents.length === 0) return result;

  const postIds = Array.from(new Set(
    pendingEvents.map((e: any) => e.data?.post_id).filter(Boolean),
  )) as string[];

  if (postIds.length === 0) return result;

  // Re-queue these posts: status = 'approved' + clear publish_diagnostic
  const { data: updated } = await supabase
    .from('content_calendar')
    .update({
      status: 'approved',
      publish_diagnostic: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', postIds)
    .eq('platform', 'tiktok')
    .in('status', ['publish_failed', 'retry_pending'])
    .select('id');

  result.relaunched = updated?.length || 0;
  result.postIds = (updated || []).map((p: any) => p.id);

  // Mark the pending-reauth events as resolved (set status='resolved')
  if (result.relaunched > 0) {
    await supabase
      .from('agent_logs')
      .update({ status: 'resolved' })
      .in('id', pendingEvents.map((e: any) => e.id));
  }

  return result;
}
