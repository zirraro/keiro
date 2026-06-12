/**
 * Auto-publish "toggle + cap 60" — brief v2 §2 (2026-06-11).
 *
 * The client is free: auto-publish toggle ON = posts ship immediately. Trust is
 * RE-confirmed periodically rather than earned up front. Per client AND per
 * network we count auto-publications:
 *   - 50 → in-app/email heads-up ("10 publications auto avant confirmation")
 *   - 55 → reminder
 *   - 60 → the network's auto toggle flips OFF. Posts KEEP being generated but
 *          fall back to validation (pending_approval) — never a silent stop.
 *          Reactivation is one-click (signed link / dashboard) → counter reset.
 *
 * The toggle NEVER bypasses the QA gate or Théo/Jade hard escalations — those
 * are enforced upstream regardless of this counter.
 *
 * State lives in org_agent_configs.config (agent_id='content'), alongside the
 * existing auto_mode / auto_mode_<network> flags read by the publish loop:
 *   auto_count_<net>, auto_alert50_<net>, auto_alert55_<net>
 */

import { sendEmailWithFallback } from '@/lib/email/send-with-fallback';

export const AUTO_CAP = 60;
const ALERT_50 = 50;
const ALERT_55 = 55;

const NET_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
};

const NETWORKS = ['instagram', 'tiktok', 'linkedin'] as const;

/** Signed token for the 1-click reactivation link (same family as the
 *  publish-approval / token-reconnect links). */
export function generateReactivateToken(userId: string, platform: string): string {
  return Buffer.from(`${userId}:${platform}:${process.env.CRON_SECRET || 'keiro'}`)
    .toString('base64url')
    .slice(0, 24);
}
export function verifyReactivateToken(userId: string, platform: string, token: string): boolean {
  return !!token && token === generateReactivateToken(userId, platform);
}

async function loadContentConfigRow(supabase: any, userId: string): Promise<{ id: string; config: any } | null> {
  const { data } = await supabase
    .from('org_agent_configs')
    .select('id, config, created_at')
    .eq('user_id', userId)
    .eq('agent_id', 'content')
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

async function logCycle(supabase: any, userId: string, net: string, event: string, count: number): Promise<void> {
  try {
    await supabase.from('agent_logs').insert({
      agent: 'content',
      action: 'auto_cap_cycle',
      status: 'ok',
      user_id: userId,
      data: { event, platform: net, count, cap: AUTO_CAP, at: new Date().toISOString() },
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

async function clientEmail(supabase: any, userId: string): Promise<{ email: string | null; firstName: string | null }> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('email, first_name')
      .eq('id', userId)
      .maybeSingle();
    return { email: data?.email || null, firstName: data?.first_name || null };
  } catch {
    return { email: null, firstName: null };
  }
}

async function sendCapEmail(
  supabase: any,
  userId: string,
  net: string,
  kind: 'approaching' | 'reminder' | 'reached',
  count: number,
): Promise<void> {
  const { email, firstName } = await clientEmail(supabase, userId);
  if (!email) return;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  const label = NET_LABEL[net] || net;
  const hi = firstName ? `Salut ${firstName}` : 'Salut';
  const reactivateUrl = `${siteUrl}/api/agents/content/reactivate-auto?user_id=${userId}&platform=${net}&token=${generateReactivateToken(userId, net)}`;

  let subject = '';
  let body = '';
  if (kind === 'approaching') {
    subject = `Plus que ${AUTO_CAP - count} publications auto sur ${label}`;
    body = `<p>${hi} 👋</p><p>Tes agents ont publié <strong>${count} fois en autonomie</strong> sur ${label}. Encore <strong>${AUTO_CAP - count}</strong> et on te redemandera un petit feu vert — c'est juste pour rester sûr que tout te convient.</p><p>Rien à faire pour l'instant, tout continue normalement 🚀</p>`;
  } else if (kind === 'reminder') {
    subject = `Plus que ${AUTO_CAP - count} publications auto sur ${label}`;
    body = `<p>${hi} 👋</p><p>Petit rappel : encore <strong>${AUTO_CAP - count} publications</strong> en auto sur ${label} avant qu'on te redemande de confirmer. Tout roule, aucune action requise maintenant.</p>`;
  } else {
    subject = `Tes agents ont publié ${AUTO_CAP} fois en autonomie sur ${label} — on continue ?`;
    body = `<p>${hi} 🎉</p>
<p>Bravo — tes agents ont publié <strong>${AUTO_CAP} fois en totale autonomie</strong> sur ${label}. Pour rester sûr que tout te plaît, on a mis la publication auto en pause sur ${label}.</p>
<p>👉 <strong>Tes prochains posts continuent d'être créés</strong> et t'attendent en validation — rien n'est perdu.</p>
<div style="text-align:center;margin:24px 0;">
  <a href="${reactivateUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:bold;font-size:15px;">Réactiver la publication auto sur ${label}</a>
</div>
<p style="font-size:13px;color:#6b7280;">Un clic et tes agents repartent en autonomie. Tu peux aussi gérer ça depuis ton dashboard.</p>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f4f4f7;margin:0;padding:0;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
${body}
<p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px;">KeiroAI — Léna, ton agent contenu</p>
</div></div></body></html>`;

  try {
    await sendEmailWithFallback({ to: email, subject, html });
  } catch { /* non-fatal — never block publishing on an email */ }
}

/**
 * Record one successful AUTO publication on a network and enforce the cap.
 * Call ONLY for genuine auto-publishes (toggle ON, post was a draft — not a
 * manually-approved post). Returns the new count.
 */
export async function recordAutoPublish(supabase: any, userId: string | null, platform: string): Promise<number> {
  if (!userId) return 0;
  const net = (platform || 'instagram').toLowerCase();
  if (!NETWORKS.includes(net as any)) return 0;

  const row = await loadContentConfigRow(supabase, userId);
  if (!row) return 0; // no config row → client never set up auto; nothing to cap
  const cfg = row.config || {};
  const count = (Number(cfg[`auto_count_${net}`]) || 0) + 1;
  const newCfg: any = { ...cfg, [`auto_count_${net}`]: count };

  if (count === ALERT_50 && !cfg[`auto_alert50_${net}`]) {
    newCfg[`auto_alert50_${net}`] = true;
    await sendCapEmail(supabase, userId, net, 'approaching', count);
    await logCycle(supabase, userId, net, 'alert_50', count);
  } else if (count === ALERT_55 && !cfg[`auto_alert55_${net}`]) {
    newCfg[`auto_alert55_${net}`] = true;
    await sendCapEmail(supabase, userId, net, 'reminder', count);
    await logCycle(supabase, userId, net, 'alert_55', count);
  } else if (count >= AUTO_CAP) {
    // Flip this network's auto toggle OFF → publish loop falls back to
    // pending_approval (validation). Global auto_mode stays true only if
    // another network is still auto.
    newCfg[`auto_mode_${net}`] = false;
    newCfg.auto_mode = NETWORKS.some(n => n !== net && (newCfg[`auto_mode_${n}`] ?? cfg.auto_mode ?? false));
    await sendCapEmail(supabase, userId, net, 'reached', count);
    await logCycle(supabase, userId, net, 'cap_reached', count);
  }

  await supabase.from('org_agent_configs').update({ config: newCfg }).eq('id', row.id);
  return count;
}

/**
 * One-click reactivation: reset the network's counter + alerts and turn auto
 * back ON. Logs the cycle (and the reactivation delay implicitly via timestamps).
 */
export async function reactivateAutoPublish(supabase: any, userId: string, platform: string): Promise<boolean> {
  const net = (platform || 'instagram').toLowerCase();
  if (!NETWORKS.includes(net as any)) return false;
  const row = await loadContentConfigRow(supabase, userId);
  if (!row) return false;
  const cfg = row.config || {};
  const newCfg = {
    ...cfg,
    [`auto_count_${net}`]: 0,
    [`auto_alert50_${net}`]: false,
    [`auto_alert55_${net}`]: false,
    [`auto_mode_${net}`]: true,
    auto_mode: true,
  };
  await supabase.from('org_agent_configs').update({ config: newCfg }).eq('id', row.id);
  await logCycle(supabase, userId, net, 'reactivated', 0);
  return true;
}
