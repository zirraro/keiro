import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/cron/token-lifecycle
 *
 * Daily proactive token-expiry watch. For each connected platform we
 * detect tokens that will REALLY expire within 72h AND can't be
 * auto-refreshed — only those clients get a reconnect email. Refresh-
 * recoverable tokens (TikTok with valid refresh_token, LinkedIn idem)
 * are left alone because the next API call rotates them transparently.
 *
 * Sources of truth :
 *   - TikTok   : profiles.tiktok_access_token + tiktok_refresh_token + tiktok_token_expiry
 *   - Instagram: profiles.instagram_igaa_token — renouvelable via
 *                /refresh_access_token (60 jours, prolongeable indéfiniment) ;
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
    .select('id, email, first_name, tiktok_username, tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_connected_at, linkedin_username, linkedin_access_token, linkedin_token_expiry, instagram_username, instagram_access_token, instagram_igaa_token, instagram_token_expiry')
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

      // 72h = 3 rappels quotidiens avant la coupure (règle fondateur 03/08).
      if (refreshBroken && hoursLeft <= 72 && hoursLeft > -48) {
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
    // Le jeton vivant est instagram_igaa_token ; instagram_access_token est un
    // reliquat qui contient une valeur périmée. Lire le mauvais faisait échouer
    // le renouvellement à chaque passage, et partir un email pour rien.
    const jetonIgVivant = (c.instagram_igaa_token || c.instagram_access_token) as string | null;

    // ── Un jeton RÉVOQUÉ n'est pas un jeton expiré ──
    //
    // Fondateur, 2026-08-12, après avoir reçu un mail de révocation : « si
    // c'est bien le cas, on doit couper la connexion, forcer la déconnexion du
    // client, comme ça il va sur Keiro et se reconnecte. »
    //
    // Tout ce qui suit ne regardait que la DATE D'EXPIRATION. Or une révocation
    // — le client retire l'application depuis Instagram, ou Meta invalide le
    // jeton — laisse une date d'expiration parfaitement valide dans le futur.
    // Le jeton mort restait donc en base, l'interface affichait « connecté », et
    // on continuait de programmer des publications qui ne partiraient jamais.
    // Constaté aujourd'hui : 22 posts Instagram en attente, aucun compte
    // réellement connecté.
    //
    // On INTERROGE donc le jeton au lieu de faire confiance à sa date.
    //
    // Deux échecs consécutifs avant de couper : déconnecter un compte qui
    // marche à cause d'une panne réseau ou d'une limitation temporaire serait
    // pire que le bug qu'on corrige.
    if (jetonIgVivant) {
      let revoque = false;
      try {
        const sonde = await fetch(
          `https://graph.instagram.com/v21.0/me?fields=id&access_token=${jetonIgVivant}`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!sonde.ok) {
          const corps = await sonde.text().catch(() => '');
          // Seule une erreur d'AUTHENTIFICATION compte. Une limitation de débit
          // ou une panne de Meta ne dit rien de la validité du jeton.
          revoque = sonde.status === 401
            || /OAuthException|"code":\s*190|invalid[_ ]?(access[_ ]?)?token|session has been invalidated|revoked/i.test(corps);
          if (revoque) {
            console.warn(`[token-lifecycle] jeton IG refusé pour ${c.email} : ${corps.slice(0, 140)}`);
          }
        }
      } catch { /* réseau : on ne conclut rien */ }

      if (revoque) {
        const { data: echecsPrecedents } = await sb
          .from('agent_logs').select('id')
          .eq('action', 'ig_token_sonde_echec').eq('user_id', c.id)
          .gte('created_at', new Date(now - 24 * 3600000).toISOString()).limit(2);

        await sb.from('agent_logs').insert({
          agent: 'content', action: 'ig_token_sonde_echec', status: 'warn', user_id: c.id,
          data: { email: c.email }, created_at: new Date().toISOString(),
        });

        if ((echecsPrecedents?.length || 0) >= 1) {
          // Deuxième échec : on coupe pour de bon. Effacer le jeton est ce qui
          // fait basculer l'interface sur « reconnecter » — tant qu'il reste en
          // base, le client croit son compte relié et ne fait rien.
          await sb.from('profiles').update({
            instagram_access_token: null,
            instagram_igaa_token: null,
            instagram_token_expiry: null,
          }).eq('id', c.id);

          events.push({ user_id: c.id, network: 'instagram', action: 'connexion_coupee_revocation' });
          await sb.from('agent_logs').insert({
            agent: 'content', action: 'instagram_connexion_coupee', status: 'warn', user_id: c.id,
            data: { email: c.email, motif: 'jeton révoqué — deux sondes en échec' },
            created_at: new Date().toISOString(),
          });

          // Le client doit SAVOIR, sinon il découvre le silence de son compte.
          try {
            await sb.from('notifications').insert({
              user_id: c.id, agent: 'content', type: 'action',
              title: 'Reconnecte ton compte Instagram',
              message: "L'accès à ton compte Instagram a été révoqué — tes publications sont en pause. Reconnecte-le en un clic depuis KeiroAI pour qu'elles repartent.",
              created_at: new Date().toISOString(),
            });
          } catch { /* la notification est un confort */ }

          try { await sendReconnectEmail({ ...c, _ig: true }, 'instagram', 0); emailed++; } catch { /* best-effort */ }

          continue;   // inutile de tenter un renouvellement sur un jeton mort
        }
      }
    }

    if (jetonIgVivant && c.instagram_token_expiry) {
      const expiry = new Date(c.instagram_token_expiry).getTime();
      const hoursLeft = (expiry - now) / 3600000;

      if (hoursLeft <= 168 && hoursLeft > -48) { // 7 days window
        // Try silent refresh first (only works on IGAA tokens, which
        // start with 'IGAA'). Page tokens can't be refreshed — those
        // require user reconnect.
        const tok = jetonIgVivant;
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
        if (!refreshOk && hoursLeft <= 72) {
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
      if (hoursLeft <= 72 && hoursLeft > -48) {
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
    // ── La couleur du réseau concerné ──
    //
    // Le client reconnaît le message avant de l'avoir lu. Un mail « Instagram »
    // en violet Keiro ressemble à une relance commerciale ; aux couleurs du
    // réseau, il ressemble à ce qu'il est — une formalité technique sur SON
    // compte. Couleurs pleines, jamais de dégradé : Outlook les ignore et
    // afficherait du texte blanc sur fond blanc.
    const teinte = network === 'instagram' ? '#C13584'
      : network === 'tiktok' ? '#0f172a'
      : '#0A66C2';
    const teinteDouce = network === 'instagram' ? '#FDF2F8'
      : network === 'tiktok' ? '#F1F5F9'
      : '#EFF6FF';

    const titre = dejaCoupe
      ? `Ton ${platformLabel} s'est déconnecté`
      : `Ton accès ${platformLabel} arrive à échéance`;

    // Mise en page en TABLEAUX et styles en ligne : c'est la seule chose que
    // tous les clients de messagerie rendent correctement. Ni flexbox, ni
    // grille, ni feuille de style externe.
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${dejaCoupe ? `Tes publications ${platformLabel} sont en pause — 30 secondes pour les relancer.` : `30 secondes pour renouveler ton accès ${platformLabel} et ne rien interrompre.`}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">

    <tr><td style="background:${teinte};padding:26px 32px;">
      <div style="font-size:28px;line-height:1;margin-bottom:10px;">${platformEmoji}</div>
      <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">${titre}</div>
    </td></tr>

    <tr><td style="padding:30px 32px 8px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#0f172a;">Salut ${firstName},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#334155;">
        L'autorisation que tu avais donnée à KeiroAI sur ton compte <strong>${platformLabel}</strong> ${delai}.
      </p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#334155;">
        C'est normal, et c'est même une bonne chose : ${platformLabel} limite dans le temps
        les accès accordés aux applications. Tu gardes la main, rien ne se prolonge sans toi.
      </p>
    </td></tr>

    <tr><td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${teinteDouce};border-radius:12px;">
        <tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#334155;">
          ${dejaCoupe
            ? `<strong style="color:#0f172a;">Tes publications sont en pause</strong>, mais rien n'est perdu : tout ce qui était programmé est conservé et repart dès que l'accès est rétabli.`
            : `<strong style="color:#0f172a;">Rien ne s'arrête</strong> tant que tu renouvelles avant l'échéance. La publication continue sans interruption.`}
        </td></tr>
      </table>
    </td></tr>

    <tr><td align="center" style="padding:28px 32px 8px;">
      <a href="${reconnectUrl}" style="display:inline-block;background:${teinte};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 34px;border-radius:12px;">
        Reconnecter mon ${platformLabel}
      </a>
      <div style="margin-top:12px;font-size:13px;color:#64748b;">Un clic, tu réautorises, c'est reparti — 30 secondes.</div>
    </td></tr>

    <tr><td style="padding:26px 32px 30px;">
      <div style="border-top:1px solid #e8edf4;padding-top:18px;font-size:13px;line-height:1.6;color:#64748b;">
        On renouvelle ces accès en silence chaque fois qu'on le peut. On ne t'écrit
        que lorsque ${platformLabel} exige que ce soit <em>toi</em> qui valides — c'est le cas ici.
      </div>
    </td></tr>

  </table>
  <div style="max-width:560px;margin:18px auto 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
    KeiroAI — ton équipe marketing, tous les jours.<br>
    Une question ? Réponds simplement à ce message.
  </div>
</td></tr>
</table>
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
