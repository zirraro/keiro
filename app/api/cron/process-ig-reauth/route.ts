import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/process-ig-reauth
 *
 * Scans agent_logs for recent 'ig_token_expired_auto_disconnect' events
 * and sends ONE reconnection email per client per 24h (no spam). Uses
 * Brevo → admin fallback so the email lands even when the client hasn't
 * wired their own SMTP.
 *
 * Scheduled hourly from the VPS worker. Auth: CRON_SECRET.
 */
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

  const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find expired-token events not yet followed by a sent email.
  const { data: events } = await sb
    .from('agent_logs')
    .select('id, data, created_at')
    .eq('agent', 'content')
    .eq('action', 'ig_token_expired_auto_disconnect')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!events || events.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const seenUsers = new Set<string>();
  let sent = 0;

  for (const ev of events) {
    const userId = ev.data?.user_id;
    if (!userId || seenUsers.has(userId)) continue;
    seenUsers.add(userId);

    // Dedup — has an email already gone out today for this user?
    const { data: alreadySent } = await sb
      .from('agent_logs')
      .select('id')
      .eq('agent', 'content')
      .eq('action', 'ig_reauth_email_sent')
      .contains('data', { user_id: userId })
      .gte('created_at', sinceISO)
      .limit(1);
    if (alreadySent && alreadySent.length > 0) continue;

    const { data: profile } = await sb
      .from('profiles')
      .select('id, email, first_name')
      .eq('id', userId)
      .maybeSingle();
    if (!profile?.email) continue;

    const firstName = profile.first_name || 'toi';
    const reconnectUrl = ev.data?.reconnect_url || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/integrations/meta`;

    // Send via Brevo
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) continue;

    try {
      const subject = 'Reconnecte ton Instagram à KeiroAI 📱';
      const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
  <h2 style="color:#0c1a3a;margin:0 0 16px;">Salut ${firstName} 👋</h2>
  <p style="line-height:1.6;">Ton token Instagram a expiré ou été révoqué côté Meta.<br>Résultat : Léna (ton agent contenu) ne peut plus publier pour toi.</p>
  <p style="line-height:1.6;"><strong>Ce qu'il faut faire :</strong> reconnecte ton compte Instagram en 30 secondes.</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${reconnectUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px;">Reconnecter mon Instagram →</a>
  </div>
  <p style="font-size:13px;color:#64748b;line-height:1.6;">Les tokens Meta expirent tous les 60 jours environ. Dès que tu te reconnectes, Léna reprend ses publications automatiquement.</p>
  <p style="font-size:12px;color:#94a3b8;margin-top:24px;">— L'équipe KeiroAI</p>
</body></html>`;
      const textBody = `Salut ${firstName},\n\nTon token Instagram a expiré — Léna ne peut plus publier pour toi.\n\nReconnecte ton IG en 30s : ${reconnectUrl}\n\n— KeiroAI`;

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: 'contact@keiroai.com', name: 'KeiroAI' },
          to: [{ email: profile.email, name: firstName }],
          subject,
          htmlContent: html,
          textContent: textBody,
          tags: ['ig_reauth'],
        }),
      });

      if (res.ok) {
        sent++;
        await sb.from('agent_logs').insert({
          agent: 'content',
          action: 'ig_reauth_email_sent',
          status: 'success',
          data: { user_id: userId, email: profile.email, reconnect_url: reconnectUrl },
          created_at: new Date().toISOString(),
        });
      } else {
        const err = await res.text().catch(() => '');
        console.warn(`[ig-reauth] Brevo ${res.status}: ${err.substring(0, 200)}`);
      }
    } catch (err: any) {
      console.error('[ig-reauth] send failed:', err?.message);
    }
  }

  return NextResponse.json({ ok: true, events_found: events.length, sent });
}
