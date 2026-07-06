import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import dns from 'node:dns/promises';
import { sendBrevoCompat } from '@/lib/email/brevo-compat';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Auto-remédiation SÛRE (founder 06/07). Une couche qui applique automatiquement
 * des correctifs à FAIBLE RISQUE, RÉVERSIBLES et LOGGÉS — jamais de code, jamais
 * de déploiement, jamais de suppression de données. Chaque action est whitelistée.
 *
 * Principe : le diagnostic (digest) et le runtime (fallbacks) sont déjà auto ;
 * ici on automatise le NETTOYAGE de données / la protection qui, sinon,
 * demanderait une intervention manuelle — tout en gardant la sécurité.
 *
 * Actions actuelles :
 *   1. invalid_email_cleanup — marque les prospects ACTIFS dont le domaine email
 *      n'a AUCUN MX (donc injoignables) en 'email_invalid' + libère le canal.
 *      Évite de gaspiller des slots Brevo et de compter des faux échecs.
 *      (Le prospect reste VIVANT et joignable par DM/tel — on ne le tue pas.)
 *
 * Cron : quotidien. Cappé pour rester léger et sûr.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function authOk(req: NextRequest) {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

const mxCache = new Map<string, boolean>();
async function hasMx(domain: string): Promise<boolean> {
  if (!domain) return false;
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  let ok = false;
  try { const r = await dns.resolveMx(domain); ok = Array.isArray(r) && r.length > 0; }
  catch { ok = false; }
  mxCache.set(domain, ok);
  return ok;
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const supabase = sb();
  const CAP = 150; // borne de sûreté : nb de prospects vérifiés par run
  const actions: Record<string, any> = {};

  // ── 1. invalid_email_cleanup ──────────────────────────────
  let checked = 0, cleaned = 0;
  try {
    const { data: prospects } = await supabase
      .from('crm_prospects')
      .select('id, email, email_sequence_status')
      .not('email', 'is', null)
      .not('email_sequence_status', 'in', '("email_invalid","bounced","stopped")')
      .limit(CAP);

    // Regroupe par domaine pour minimiser les lookups DNS.
    const byDomain = new Map<string, { ids: string[] }>();
    for (const p of (prospects || []) as any[]) {
      const dom = String(p.email || '').split('@')[1]?.toLowerCase();
      if (!dom) continue;
      if (!byDomain.has(dom)) byDomain.set(dom, { ids: [] });
      byDomain.get(dom)!.ids.push(p.id);
    }
    const invalidIds: string[] = [];
    for (const [dom, { ids }] of byDomain) {
      checked += ids.length;
      // Domaine malformé (pas de point / caractères invalides) → invalide direct.
      const malformed = !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dom);
      const ok = !malformed && await hasMx(dom);
      if (!ok) invalidIds.push(...ids);
    }
    if (invalidIds.length > 0) {
      // Réversible : on flague l'email + libère le canal, on NE supprime PAS le
      // prospect (doctrine : jamais supprimer, il reste joignable autrement).
      await supabase.from('crm_prospects')
        .update({ email_sequence_status: 'email_invalid', active_channel: null, updated_at: new Date().toISOString() })
        .in('id', invalidIds);
      cleaned = invalidIds.length;
    }
  } catch (e: any) {
    actions.invalid_email_cleanup_error = e?.message;
  }
  actions.invalid_email_cleanup = { checked, cleaned };

  // ── 2. runaway_agent_guard ────────────────────────────────
  // Si un couple (client, agent) est en tempête d'erreurs (≥80% d'échecs sur
  // ≥10 runs / 24h), on met CET agent en pause TEMPORAIRE (6h) pour ce client
  // → stoppe le gaspillage (coût/erreurs répétées) le temps qu'on regarde.
  // Réversible (expire seul), fail-safe (honoré par client-schedules), alerte admin.
  const paused: Array<{ user_id: string; agent: string; rate: number; runs: number }> = [];
  try {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: logs } = await supabase
      .from('agent_logs')
      .select('agent, status, user_id')
      .not('user_id', 'is', null)
      .gte('created_at', since24h)
      .limit(20000);
    const stats: Record<string, { ok: number; err: number; agent: string; user_id: string }> = {};
    for (const l of (logs || []) as any[]) {
      const key = `${l.user_id}::${l.agent}`;
      if (!stats[key]) stats[key] = { ok: 0, err: 0, agent: l.agent, user_id: l.user_id };
      if (l.status === 'error' || l.status === 'failed') stats[key].err++;
      else stats[key].ok++;
    }
    const MAX_PAUSES = 20; // borne de sûreté
    for (const s of Object.values(stats)) {
      const total = s.ok + s.err;
      if (total < 10) continue;
      const rate = s.err / total;
      if (rate < 0.8) continue;
      if (paused.length >= MAX_PAUSES) break;
      // Upsert la pause dans org_agent_configs (jsonb, réversible).
      const { data: cfg } = await supabase.from('org_agent_configs')
        .select('id, config').eq('user_id', s.user_id).eq('agent_id', s.agent).maybeSingle();
      const already = (cfg?.config as any)?.auto_paused_until && new Date((cfg!.config as any).auto_paused_until).getTime() > Date.now();
      if (already) continue; // déjà en pause → pas de re-alerte
      const next = { ...((cfg?.config as any) || {}), auto_paused_until: new Date(Date.now() + 6 * 3600 * 1000).toISOString(), auto_pause_reason: `error-storm ${Math.round(rate * 100)}% sur ${total} runs/24h` };
      if (cfg?.id) await supabase.from('org_agent_configs').update({ config: next }).eq('id', cfg.id);
      else await supabase.from('org_agent_configs').insert({ user_id: s.user_id, agent_id: s.agent, config: next });
      paused.push({ user_id: s.user_id, agent: s.agent, rate: Math.round(rate * 100), runs: total });
    }
    if (paused.length > 0) {
      await sendBrevoCompat({
        sender: { name: 'KeiroAI Ops', email: 'contact@keiroai.com' },
        to: [{ email: process.env.ADMIN_EMAIL || 'contact@keiroai.com' }],
        subject: `[KeiroAI] 🛡️ Auto-pause de ${paused.length} agent(s) en tempête d'erreurs`,
        htmlContent: `<div style="font-family:system-ui"><h3>🛡️ Auto-remédiation — agents mis en pause 6h</h3><ul>${paused.map(p => `<li><code>${p.agent}</code> · client <code>${p.user_id.slice(0, 8)}</code> — ${p.rate}% d'échecs sur ${p.runs} runs/24h</li>`).join('')}</ul><p>Pause temporaire (6h) pour stopper le gaspillage. Vérifie la cause, puis ça reprend seul ou tu réactives.</p></div>`,
      }).catch(() => {});
    }
  } catch (e: any) { actions.runaway_agent_guard_error = e?.message; }
  actions.runaway_agent_guard = { paused: paused.length, details: paused };

  // ── 3. stale_dm_queue_cleanup ─────────────────────────────
  // Les DM préparés jamais envoyés depuis > 30 jours sont périmés (le contexte
  // du prospect a changé) → on les marque 'expired' pour ne plus les proposer.
  let dmExpired = 0;
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: stale } = await supabase.from('dm_queue')
      .select('id').eq('status', 'pending').lt('created_at', since30d).limit(500);
    const ids = (stale || []).map((r: any) => r.id);
    if (ids.length > 0) {
      await supabase.from('dm_queue').update({ status: 'expired' }).in('id', ids);
      dmExpired = ids.length;
    }
  } catch (e: any) { actions.stale_dm_queue_cleanup_error = e?.message; }
  actions.stale_dm_queue_cleanup = { expired: dmExpired };

  // ── Log de traçabilité (chaque remédiation est tracée) ──
  try {
    await supabase.from('agent_logs').insert({
      agent: 'ops', action: 'auto_remediate', status: 'ok',
      data: { actions, at: new Date().toISOString() },
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, actions });
}
