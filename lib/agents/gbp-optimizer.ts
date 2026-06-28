/**
 * Théo SEO Fiche — optimisation de la fiche Google Business (scope business.manage).
 *
 * Levier #1 du SEO local. Améliore la DESCRIPTION (riche en mots-clés locaux,
 * factuelle) et publie des Google Posts. Deux modes :
 *   - 'auto'   : applique directement APRÈS un gate qualité strict (anti-invention
 *                + conformité Google). Doctrine "tout en auto" du founder.
 *   - 'review' : propose la nouvelle description au client qui valide en 1 clic.
 *
 * Qualité MAX, contrôlée : 2 passes Claude (génération sonnet-4-6 + vérification),
 * on n'écrit JAMAIS sur la fiche live sans que le gate passe.
 */

import { getValidToken, getLocationDetails, updateLocationDescription, createLocalPost } from '@/lib/google-business-oauth';

const CLAUDE = 'claude-sonnet-4-6';

async function claude(system: string, message: string, maxTokens = 700): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY manquante');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE, max_tokens: maxTokens, system, messages: [{ role: 'user', content: message }] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).substring(0, 160)}`);
  const data = await res.json();
  return (data.content?.[0]?.text || '').trim();
}

export type GbpOptimizeResult = {
  ok: boolean;
  mode?: 'auto' | 'review';
  applied?: boolean;
  proposed?: boolean;
  reason?: string;
  qc?: { pass: boolean; score: number; issues: string[] };
  description?: string;
};

export async function optimizeGbpListing(supabase: any, userId: string): Promise<GbpOptimizeResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_business_location_id, google_business_refresh_token')
    .eq('id', userId).single();
  if (!profile?.google_business_refresh_token || !profile?.google_business_location_id) {
    return { ok: false, reason: 'not_connected' };
  }
  const accessToken = await getValidToken(supabase, userId);
  if (!accessToken) return { ok: false, reason: 'token_expired' };

  // Mode auto | review stocké en jsonb (org_agent_configs.config.gbp_mode), PAS en
  // colonne (DDL bloqué). Défaut = auto (doctrine "tout en auto").
  const { data: cfg } = await supabase.from('org_agent_configs')
    .select('config').eq('user_id', userId).eq('agent_id', 'gmaps')
    .order('created_at', { ascending: false }).limit(1);
  const mode: 'auto' | 'review' = cfg?.[0]?.config?.gbp_mode === 'review' ? 'review' : 'auto';
  const locationStored = profile.google_business_location_id;

  // Contexte factuel — on n'invente RIEN hors du dossier.
  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('company_name, business_type, city, main_products, target_audience, value_proposition, unique_selling_points, address')
    .eq('user_id', userId).maybeSingle();

  let currentDesc = '';
  try {
    const details = await getLocationDetails(accessToken, locationStored);
    currentDesc = details?.profile?.description || '';
  } catch (e: any) {
    return { ok: false, reason: `read_failed: ${e?.message}` };
  }

  const facts = JSON.stringify(dossier || {}, null, 0).substring(0, 1500);

  // 1) Génération qualité (Sonnet 4.6)
  const genSystem = `Tu es Théo, expert SEO local. Rédige une description de fiche Google Business EXCELLENTE pour ce commerce.
RÈGLES STRICTES :
- 100% FACTUELLE : utilise UNIQUEMENT les infos du dossier fourni. N'INVENTE RIEN (pas de services, récompenses, années non mentionnés).
- SEO LOCAL : intègre naturellement l'activité + la ville + 2-3 mots-clés que les clients tapent.
- 700 caractères MAX, chaleureux, concret, en français.
- INTERDIT (règles Google) : numéro de téléphone, URL/lien, prix, emojis excessifs, MAJUSCULES promo, "meilleur/n°1" non prouvé, caractères spéciaux décoratifs.
- Pas de blabla générique : du concret sur ce que vit le client.
Réponds UNIQUEMENT avec la description, rien d'autre.`;
  let newDesc = await claude(genSystem, `Dossier: ${facts}\n\nDescription actuelle (à améliorer): "${currentDesc || '(vide)'}"`);
  newDesc = newDesc.replace(/^["']|["']$/g, '').trim().substring(0, 750);

  // 2) GATE QUALITÉ (2e passe) — anti-invention + conformité + meilleure que l'actuelle
  const qcSystem = `Tu es un contrôleur qualité STRICT pour les fiches Google Business. On te donne le DOSSIER (vérité), la description ACTUELLE et la description PROPOSÉE. Vérifie la proposée et réponds en JSON pur :
{"pass": true|false, "score": 0-100, "issues": ["..."]}
Mets pass=false si UN SEUL de ces points échoue :
- invente une info absente du dossier (service, chiffre, récompense, spécialité non listée),
- contient un téléphone, une URL, un prix, ou viole les règles Google (superlatifs non prouvés, MAJUSCULES promo),
- dépasse 750 caractères,
- n'est pas en français correct,
- n'est PAS meilleure (SEO local + clarté) que l'actuelle.
Sois sévère : en cas de doute sur une invention, pass=false.`;
  let qc = { pass: false, score: 0, issues: ['qc_parse_error'] };
  try {
    const raw = await claude(qcSystem, `DOSSIER: ${facts}\nACTUELLE: "${currentDesc}"\nPROPOSÉE: "${newDesc}"`, 300);
    const json = raw.match(/\{[\s\S]*\}/);
    if (json) qc = JSON.parse(json[0]);
  } catch { /* qc reste fail */ }

  if (!qc.pass) {
    await logGbp(supabase, userId, 'gbp_optimize_skipped', { reason: 'qc_failed', qc, proposed: newDesc.substring(0, 300) });
    return { ok: false, reason: 'qc_failed', qc, description: newDesc };
  }

  // 3) Application selon le mode
  if (mode === 'review') {
    await supabase.from('client_notifications').insert({
      user_id: userId, agent: 'gmaps', type: 'gbp_optimization_proposal',
      title: '✨ Proposition : description de ta fiche Google optimisée',
      message: `Théo a préparé une description optimisée (SEO local) pour ta fiche. Valide en 1 clic pour l'appliquer.`,
      data: { field: 'description', current: currentDesc, proposed: newDesc, location: locationStored, qc },
    }).throwOnError?.();
    await logGbp(supabase, userId, 'gbp_optimize_proposed', { qc, proposed: newDesc.substring(0, 300) });
    return { ok: true, mode: 'review', proposed: true, qc, description: newDesc };
  }

  // auto : on applique (gate déjà passé)
  const applied = await updateLocationDescription(accessToken, locationStored, newDesc);
  await logGbp(supabase, userId, applied ? 'gbp_optimize_applied' : 'gbp_optimize_apply_failed', { qc, description: newDesc.substring(0, 300) });
  return { ok: applied, mode: 'auto', applied, qc, description: newDesc };
}

/**
 * Publie un "Google Post" (actu/offre) sur la fiche — signal de fraîcheur = boost
 * de visibilité locale. Additif (n'écrase rien), gate qualité léger (factuel only).
 */
export async function publishGbpPost(supabase: any, userId: string): Promise<{ ok: boolean; posted?: boolean; reason?: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_business_location_id, google_business_refresh_token')
    .eq('id', userId).single();
  if (!profile?.google_business_refresh_token || !profile?.google_business_location_id) return { ok: false, reason: 'not_connected' };
  const accessToken = await getValidToken(supabase, userId);
  if (!accessToken) return { ok: false, reason: 'token_expired' };

  const { data: dossier } = await supabase
    .from('business_dossiers')
    .select('company_name, business_type, city, main_products, value_proposition, unique_selling_points')
    .eq('user_id', userId).maybeSingle();
  const facts = JSON.stringify(dossier || {}).substring(0, 1200);

  const system = `Tu es Théo, expert SEO local. Rédige un "Google Post" (actu/offre) pour la fiche Google de ce commerce.
RÈGLES : 100% FACTUEL (uniquement le dossier, n'invente rien), 1200 caractères max, ton chaleureux + concret, ancré local.
INTERDIT (règles Google) : numéro de téléphone, URL/lien, prix inventé, MAJUSCULES promo, superlatifs non prouvés, emojis en rafale.
Donne UNIQUEMENT le texte du post, rien d'autre.`;
  let summary = '';
  try {
    summary = (await claude(system, `Dossier: ${facts}`, 450)).replace(/^["']|["']$/g, '').trim().substring(0, 1400);
  } catch (e: any) {
    return { ok: false, reason: `gen_failed: ${e?.message}` };
  }
  if (summary.length < 30) return { ok: false, reason: 'too_short' };
  // Garde-fou conformité : pas de tel/URL.
  if (/\b\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2}\b/.test(summary) || /https?:\/\//i.test(summary)) {
    summary = summary.replace(/https?:\/\/\S+/gi, '').replace(/\b\d{2}([ .]?\d{2}){4}\b/g, '').trim();
  }

  const posted = await createLocalPost(accessToken, profile.google_business_location_id, summary);
  await logGbp(supabase, userId, posted ? 'gbp_post_published' : 'gbp_post_failed', { summary: summary.substring(0, 200) });
  return { ok: posted, posted };
}

async function logGbp(supabase: any, userId: string, action: string, data: any) {
  try {
    await supabase.from('agent_logs').insert({
      agent: 'gmaps', action, user_id: userId, status: action.includes('failed') ? 'error' : 'ok',
      data, created_at: new Date().toISOString(),
    });
  } catch { /* best-effort */ }
}
