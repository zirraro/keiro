import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import dns from 'node:dns/promises';

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
      const ok = await hasMx(dom);
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
