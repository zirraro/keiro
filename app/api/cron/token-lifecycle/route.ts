import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/cron/token-lifecycle
 *
 * Daily proactive token-expiry watch. For each connected platform we
 * detect tokens that will REALLY expire within 24h AND can't be
 * auto-refreshed — only those clients get a reconnect email. Refresh-
 * recoverable tokens (TikTok with valid refresh_token, LinkedIn idem)
 * are left alone because the next API call rotates them transparently.
 *
 * Sources of truth :
 *   - TikTok   : profiles.tiktok_access_token + tiktok_refresh_token + tiktok_token_expiry
 *   - Instagram: profiles.instagram_igaa_token (long-lived, no refresh field;
 *                we treat the existing agent_logs ig_token_expired_auto_disconnect
 *                signal as the trigger — process-ig-reauth already sends the mail)
 *   - LinkedIn : profiles.linkedin_access_token + linkedin_token_expiry
 *
 * Dedup : we skip clients who reconnected within the last 24h
 *         (their expiry timestamp is in the future by definition,
 *         so they fall out of the < 24h window naturally).
 *
 * Auth: CRON_SECRET. Scheduled from worker scheduler daily.
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

  const now = Date.now();
  const in24h = new Date(now + 24 * 3600 * 1000).toISOString();
  const sinceISO = new Date(now - 24 * 3600 * 1000).toISOString();

  const { data: clients } = await sb
    .from('profiles')
    .select('id, email, first_name, tiktok_username, tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_connected_at, linkedin_username, linkedin_access_token, linkedin_token_expiry, instagram_username, instagram_access_token, instagram_token_expiry')
    .or('tiktok_access_token.not.is.null,linkedin_access_token.not.is.null,instagram_access_token.not.is.null');

  if (!clients || clients.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, emailed: 0 });
  }

  let emailed = 0;
  const events: any[] = [];

  for (const c of clients as any[]) {
    // ─── TikTok ───────────────────────────────────────────────────
    if (c.tiktok_access_token && c.tiktok_token_expiry) {
      const expiry = new Date(c.tiktok_token_expiry).getTime();
      const hoursLeft = (expiry - now) / 3600000;
      const hasRefresh = !!c.tiktok_refresh_token;

      // Has the refresh path been failing in the last 24h?
      let refreshBroken = !hasRefresh;
      if (hasRefresh) {
        // 2026-06-06 — ignore fail logs that pre-date the last reconnect
        // (otherwise we ping the client for an issue they already fixed).
        const reconnectedAt = (c as any).tiktok_connected_at
          ? new Date((c as any).tiktok_connected_at).toISOString()
          : null;
        const lowerBound = reconnectedAt && reconnectedAt > sinceISO ? reconnectedAt : sinceISO;
        const { data: fails } = await sb
          .from('agent_logs')
          .select('id')
          .eq('agent', 'content')
          .eq('action', 'tiktok_token_refresh_failed')
          .eq('user_id', c.id)
          .gte('created_at', lowerBound)
          .limit(1);
        refreshBroken = !!(fails && fails.length > 0);
      }

      if (refreshBroken && hoursLeft <= 24 && hoursLeft > -48) {
        // Dedup: already emailed in last 24h?
        const { data: alreadyEmailed } = await sb
          .from('agent_logs')
          .select('id')
          .eq('agent', 'content')
          .eq('action', 'tiktok_reauth_email_sent')
          .contains('data', { user_id: c.id })
          .gte('created_at', sinceISO)
          .limit(1);
        if (!alreadyEmailed || alreadyEmailed.length === 0) {
          const sent = await sendReconnectEmail(c, 'tiktok', hoursLeft);
          if (sent) {
            emailed++;
            events.push({ user_id: c.id, network: 'tiktok', action: 'reauth_email_sent', hoursLeft });
            await sb.from('agent_logs').insert({
              agent: 'content',
              action: 'tiktok_reauth_email_sent',
              status: 'success',
              user_id: c.id,
              data: { user_id: c.id, email: c.email, hours_left: hoursLeft },
              created_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    // ─── Instagram ────────────────────────────────────────────────
    // IGAA long-lived tokens last 60 days but CAN be refreshed via
    // /refresh_access_token before expiry. Strategy: when <7 days
    // remain, attempt refresh silently. Mail the client only if refresh
    // actually fails (token revoked or already expired).
    if (c.instagram_access_token && c.instagram_token_expiry) {
      const expiry = new Date(c.instagram_token_expiry).getTime();
      const hoursLeft = (expiry - now) / 3600000;

      if (hoursLeft <= 168 && hoursLeft > -48) { // 7 days window
        // Try silent refresh first (only works on IGAA tokens, which
        // start with 'IGAA'). Page tokens can't be refreshed — those
        // require user reconnect.
        const tok = c.instagram_access_token as string;
        let refreshOk = false;
        if (tok && tok.startsWith('IGAA')) {
          try {
            const r = await fetch(
              `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${tok}`,
              { signal: AbortSignal.timeout(8000) },
            );
            if (r.ok) {
              const j = await r.json().catch(() => null);
              const newTok = j?.access_token;
              const newExp = typeof j?.expires_in === 'number' ? j.expires_in : 60 * 86400;
              if (newTok) {
                await sb
                  .from('profiles')
                  .update({
                    instagram_access_token: newTok,
                    instagram_igaa_token: newTok,
                    instagram_token_expiry: new Date(now + newExp * 1000).toISOString(),
                  })
                  .eq('id', c.id);
                refreshOk = true;
                events.push({ user_id: c.id, network: 'instagram', action: 'token_refreshed', hoursLeft });
                await sb.from('agent_logs').insert({
                  agent: 'content',
                  action: 'instagram_token_refreshed',
                  status: 'success',
                  user_id: c.id,
                  data: { user_id: c.id, hours_left_before: Math.round(hoursLeft), new_expiry_days: Math.round(newExp / 86400) },
                  created_at: new Date().toISOString(),
                });
              }
            }
          } catch (e: any) {
            console.warn('[token-lifecycle] IG refresh threw:', e?.message);
          }
        }

        // Refresh failed (or unsupported token type) AND expiry truly imminent → mail client.
        if (!refreshOk && hoursLeft <= 48) {
          const { data: alreadyEmailed } = await sb
            .from('agent_logs')
            .select('id')
            .eq('agent', 'content')
            .eq('action', 'ig_reauth_email_sent')
            .contains('data', { user_id: c.id })
            .gte('created_at', sinceISO)
            .limit(1);
          if (!alreadyEmailed || alreadyEmailed.length === 0) {
            const sent = await sendReconnectEmail({ ...c, _ig: true }, 'instagram', hoursLeft);
            if (sent) {
              emailed++;
              events.push({ user_id: c.id, network: 'instagram', action: 'reauth_email_sent', hoursLeft });
              await sb.from('agent_logs').insert({
                agent: 'content',
                action: 'ig_reauth_email_sent',
                status: 'success',
                user_id: c.id,
                data: { user_id: c.id, email: c.email, hours_left: hoursLeft },
                created_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    // ─── LinkedIn ─────────────────────────────────────────────────
    if (c.linkedin_access_token && c.linkedin_token_expiry) {
      const expiry = new Date(c.linkedin_token_expiry).getTime();
      const hoursLeft = (expiry - now) / 3600000;
      // LinkedIn doesn't expose refresh tokens by default — every
      // imminent expiry means the user must reconnect manually.
      if (hoursLeft <= 24 && hoursLeft > -48) {
        const { data: alreadyEmailed } = await sb
          .from('agent_logs')
          .select('id')
          .eq('agent', 'content')
          .eq('action', 'linkedin_reauth_email_sent')
          .contains('data', { user_id: c.id })
          .gte('created_at', sinceISO)
          .limit(1);
        if (!alreadyEmailed || alreadyEmailed.length === 0) {
          const sent = await sendReconnectEmail(c, 'linkedin', hoursLeft);
          if (sent) {
            emailed++;
            events.push({ user_id: c.id, network: 'linkedin', action: 'reauth_email_sent', hoursLeft });
            await sb.from('agent_logs').insert({
              agent: 'content',
              action: 'linkedin_reauth_email_sent',
              status: 'success',
              user_id: c.id,
              data: { user_id: c.id, email: c.email, hours_left: hoursLeft },
              created_at: new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, scanned: clients.length, emailed, events: events.slice(0, 20) });
}

async function sendReconnectEmail(client: any, network: 'tiktok' | 'linkedin' | 'instagram', hoursLeft: number): Promise<boolean> {
  if (!client.email) return false;
  try {
    const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
    const firstName = client.first_name || 'toi';
    const reconnectPath = network === 'tiktok'
      ? '/api/auth/tiktok-oauth'
      : network === 'instagram'
        ? '/integrations/meta'
        : '/api/auth/linkedin-oauth';
    // On passe par /reconnecter : cette page efface l'autorisation périmée AVANT
    // de redemander l'accès. Sans cet effacement, le réseau réutilise l'ancienne
    // et le client croit avoir reconnecté sans que rien ne change.
    const reconnectUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com'}/reconnecter?reseau=${network}`;
    const platformLabel = network === 'tiktok' ? 'TikTok' : network === 'instagram' ? 'Instagram' : 'LinkedIn';
    const platformEmoji = network === 'tiktok' ? '🎵' : network === 'instagram' ? '📷' : '💼';
    // Combien de jours reste-t-il ? Le client doit savoir s'il a le temps ou
    // s'il est déjà bloqué — c'est ce qui distingue une info d'une urgence.
    const joursRestants = Number.isFinite(hoursLeft) ? Math.ceil(hoursLeft / 24) : null;
    const dejaCoupe = joursRestants !== null && joursRestants <= 0;
    const delai = dejaCoupe
      ? 'expirée'
      : joursRestants === 1 ? 'expire demain'
      : joursRestants !== null ? `expire dans ${joursRestants} jours`
      : 'arrive à expiration';

    const subject = dejaCoupe
      ? `${platformEmoji} ${platformLabel} : ton autorisation a expiré, la publication est en pause`
      : `${platformEmoji} ${platformLabel} : ton autorisation ${delai} — 30 secondes pour la renouveler`;
    // KeiroAI normalement renouvelle ces jetons en silence. Si ce mail
    // arrive, c'est que le renouvellement automatique a échoué (révocation
    // côté plateforme, login ailleurs, scope changé) — il faut une action
    // humaine, ce n'est pas un cycle routine.
    const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
  <h2 style="color:#0c1a3a;margin:0 0 16px;">Salut ${firstName} 👋</h2>
  <p style="line-height:1.6;">L'autorisation que tu avais donnée à KeiroAI sur ton compte ${platformLabel} ${delai}.</p>
  <p style="line-height:1.6;">C'est normal et prévu : ${platformLabel} limite dans le temps les accès qu'on accorde à une application. C'est une sécurité pour toi — tu gardes la main, et rien ne se prolonge tout seul sans que tu le décides.</p>
  <p style="line-height:1.6;">${dejaCoupe
    ? `En attendant, ton agent contenu ne peut plus publier sur ${platformLabel}. <strong>Tes publications programmées sont conservées</strong> et repartent dès que l'accès est rétabli — rien n'est perdu.`
    : `Tant que tu la renouvelles avant l'échéance, <strong>rien ne s'arrête</strong> : la publication continue sans interruption.`}</p>
  <p style="line-height:1.6;"><strong>30 secondes suffisent :</strong> un clic ci-dessous, tu réautorises chez ${platformLabel}, et c'est reparti.</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${reconnectUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px;">Reconnecter mon ${platformLabel} →</a>
  </div>
  <p style="font-size:13px;color:#64748b;line-height:1.6;">On renouvelle ces accès en silence chaque fois qu'on le peut. On ne t'écrit que lorsque ${platformLabel} exige que ce soit toi qui valides — c'est le cas ici.</p>
  <p style="font-size:12px;color:#94a3b8;margin-top:24px;">— L'équipe KeiroAI</p>
</body></html>`;
    const text = [
      `Salut ${firstName},`,
      ``,
      `L'autorisation que tu avais donnée à KeiroAI sur ton compte ${platformLabel} ${delai}.`,
      ``,
      `C'est normal : ${platformLabel} limite dans le temps les accès accordés aux applications. Tu gardes la main, rien ne se prolonge sans toi.`,
      ``,
      dejaCoupe
        ? `En attendant, la publication est en pause — tes posts programmés sont conservés.`
        : `Renouvelle avant l'échéance et rien ne s'arrête.`,
      ``,
      `30 secondes : ${reconnectUrl}`,
      ``,
      `— KeiroAI`,
    ].join('\n');
    const result = await sendEmailWithFallback({
      to: client.email,
      toName: firstName,
      subject,
      html,
      textContent: text,
      fromName: 'KeiroAI',
      fromEmail: 'contact@keiroai.com',
      tags: [`${network}_reauth`],
    });
    return result.ok;
  } catch (err: any) {
    console.error(`[token-lifecycle] ${network} email send failed for ${client.email}:`, err?.message);
    return false;
  }
}
