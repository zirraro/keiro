import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { detectSector, SECTORS } from '@/lib/agents/sales-playbook';
import { getAccountStage, accountWarmingSteps } from '@/lib/agents/reach-strategy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Comptes recommandés à SUIVRE (TikTok / Instagram) — signal de compte actif.
 *
 * 2026-06-24 — Founder : dans l'onglet réseau de Léna, proposer des comptes à
 * suivre pour que le compte client paraisse actif (suivre des comptes de sa
 * niche). Pour TOUS les clients (rentre dans leur plan).
 *
 * SÉCURITÉ : zéro handle inventé. On combine :
 *  1. de VRAIS handles présents dans le CRM du client (prospects/confrères de
 *     son secteur déjà scrapés — réels), filtrés par plateforme ;
 *  2. des CATÉGORIES de comptes à suivre + des liens de RECHERCHE TikTok/IG
 *     (le client trouve et suit lui-même de vrais comptes).
 * Suivre des confrères/locaux/inspirations = active le compte sans auto-follow
 * (l'API ne permet pas le follow programmatique — c'est une recommandation).
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Cache d'existence (par instance) — l'existence d'un compte est stable.
const existsCache = new Map<string, boolean>();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36';

/**
 * Vérifie qu'un compte existe VRAIMENT avant de le proposer (founder : surtout
 * TikTok, les handles CRM scrapés sont souvent invalides). On exige un signal
 * POSITIF dans la page (uniqueId/handle canonique) ; en cas de doute (404,
 * blocage, timeout, captcha) → on NE propose PAS. Mieux vaut moins de comptes
 * mais tous réels.
 */
async function accountExists(platform: string, handle: string): Promise<boolean> {
  const key = `${platform}:${handle.toLowerCase()}`;
  const cached = existsCache.get(key);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const url = platform === 'instagram' ? `https://www.instagram.com/${handle}/` : `https://www.tiktok.com/@${handle}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' }, signal: AbortSignal.timeout(6000), redirect: 'follow' });
    if (r.status === 200) {
      const html = (await r.text()).slice(0, 400_000);
      const h = handle.toLowerCase();
      if (platform === 'tiktok') {
        // Signal positif : uniqueId exact dans le JSON de la page, et pas de
        // marqueur "compte introuvable".
        const notFound = /couldn['’]t find this account|aucun résultat trouvé|video currently unavailable/i.test(html);
        ok = !notFound && new RegExp(`"uniqueId"\\s*:\\s*"${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(html);
      } else {
        // Instagram : 200 + handle présent dans og:url/canonical, pas de page login-only.
        const notFound = /Page Not Found|Sorry, this page isn|isn['’]t available/i.test(html);
        ok = !notFound && (new RegExp(`instagram\\.com/${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(html) || html.toLowerCase().includes(`"alternate_name":"@${h}"`));
      }
    }
  } catch { ok = false; }
  existsCache.set(key, ok);
  return ok;
}

const searchUrl = (platform: string, q: string) =>
  platform === 'instagram'
    ? `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(q)}`
    : platform === 'linkedin'
      ? `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(q)}`
      : `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const rawPlatform = (new URL(req.url).searchParams.get('platform') || 'tiktok').toLowerCase();
  const platform = ['instagram', 'tiktok', 'linkedin'].includes(rawPlatform) ? rawPlatform : 'tiktok';
  const handleCol = platform === 'instagram' ? 'instagram' : platform === 'linkedin' ? 'linkedin_url' : 'tiktok_handle';

  // Secteur + ville du client (brand kit puis dossier).
  let sectorLabel = 'commerce local', city = '';
  try {
    const { data: kit } = await supabase.from('brand_kits').select('vertical, address').eq('org_id', user.id).maybeSingle();
    const sector = detectSector(kit?.vertical || '');
    sectorLabel = (SECTORS as any)[sector]?.label || sectorLabel;
    const addr = String(kit?.address || '');
    const m = addr.match(/\d{5}\s+([A-Za-zÀ-ÿ' -]+)/); if (m) city = m[1].trim();
  } catch { /* best-effort */ }

  // 1) Vrais handles du CRM (mêmes secteur, plateforme renseignée). On ne
  //    propose QUE des comptes dont l'existence est VÉRIFIÉE (founder : surtout
  //    TikTok). Candidats format-valides → vérif live en parallèle → on garde
  //    les confirmés (max 8).
  const realHandles: { handle: string; company: string; prospectId: string | null }[] = [];
  // LinkedIn : les handles CRM sont des URLs + l'existence est difficile à
  // vérifier de façon fiable → on saute la liste de handles et on ne propose
  // que des recherches LinkedIn (catégories). Insta/TikTok : vérif live.
  if (platform !== 'linkedin') try {
    const { data: rows } = await supabase.from('crm_prospects')
      .select(`id, company, ${handleCol}, no_outbound, temperature, status`).eq('user_id', user.id).not(handleCol, 'is', null).limit(80);
    const seen = new Set<string>();
    const candidates: { handle: string; company: string; prospectId: string | null }[] = [];
    for (const r of (rows || []) as any[]) {
      // Coordination : un follow est un touch → jamais d'opt-out / mort / perdu.
      if (r.no_outbound || r.temperature === 'dead' || r.status === 'perdu') continue;
      const h = String(r[handleCol] || '').replace(/^@/, '').replace(/\s/g, '').replace(/https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/\/$/, '').trim();
      if (!h || h.length < 2 || !/^[a-zA-Z0-9._]{2,30}$/.test(h) || seen.has(h.toLowerCase())) continue;
      seen.add(h.toLowerCase());
      candidates.push({ handle: h, company: r.company || h, prospectId: r.id || null });
      if (candidates.length >= 24) break; // borne le coût de vérification
    }
    // Vérif d'existence en parallèle, on garde les confirmés (max 8).
    const checks = await Promise.all(candidates.map(async c => ({ c, exists: await accountExists(platform, c.handle) })));
    for (const { c, exists } of checks) {
      if (exists) realHandles.push(c);
      if (realHandles.length >= 8) break;
    }
  } catch { /* best-effort */ }

  // État "Fait" (founder) : comptes que le CLIENT a déjà marqués suivis →
  // donnée d'accomplissement (preuve qu'il applique la stratégie). Stocké dans
  // agent_logs (action 'client_follow_action', data.done=true), pas de DDL.
  const doneHandles: string[] = [];
  try {
    const { data: doneRows } = await supabase.from('agent_logs')
      .select('data').eq('agent', 'content').eq('action', 'client_follow_action').eq('user_id', user.id).limit(500);
    const latest: Record<string, boolean> = {};
    for (const d of (doneRows || []) as any[]) {
      const dd = d.data || {};
      if (dd.platform === platform && dd.handle) latest[String(dd.handle).toLowerCase()] = dd.done === true;
    }
    for (const [h, on] of Object.entries(latest)) if (on) doneHandles.push(h);
  } catch { /* best-effort */ }

  // 2) Catégories de comptes à suivre (par secteur) + liens de recherche réels.
  const sl = sectorLabel.toLowerCase();
  const categories = [
    { label: `Confrères ${sl}${city ? ' à ' + city : ' de ta région'}`, why: 'Suivre tes pairs = signal de niche claire pour l\'algo + veille concurrentielle.', url: searchUrl(platform, `${sl}${city ? ' ' + city : ''}`) },
    { label: `Comptes locaux${city ? ' de ' + city : ''}`, why: 'Ancre ton compte localement (l\'algo te montre à une audience proche).', url: searchUrl(platform, city || 'commerce local') },
    { label: `Inspiration ${sl}`, why: 'Les meilleurs de ton secteur — pour t\'inspirer des formats qui marchent.', url: searchUrl(platform, `meilleur ${sl}`) },
    { label: 'Tendances du moment', why: 'Suivre les comptes tendance te branche sur les sons/formats viraux.', url: searchUrl(platform, 'tendance 2026') },
  ];

  // Comportement / warming du compte (algo 2026) : un compte réchauffé obtient
  // une bien meilleure portée initiale. On calcule l'étape du compte (nb de
  // posts publiés) et on renvoie la routine de warming si pas encore établi.
  let warmingSteps: string[] = [];
  try {
    const { count } = await supabase.from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('platform', platform).eq('status', 'published');
    const stage = getAccountStage(count || 0);
    if (stage !== 'established' && (platform === 'tiktok' || platform === 'instagram')) warmingSteps = accountWarmingSteps(platform);
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true,
    platform,
    sector: sectorLabel,
    city: city || null,
    realHandles,
    categories,
    warmingSteps,
    doneHandles,
    accomplishment: { done: doneHandles.length, recommended: realHandles.length },
    note: 'Suivre 5-10 comptes pertinents rend ton compte actif et crédible. L\'app ne peut pas suivre à ta place (les réseaux l\'interdisent) — clique, suis sur le profil, puis "Fait".',
  });
}

/**
 * POST — marquer un compte recommandé comme SUIVI (ou annuler). Founder : le
 * client clique → arrive sur le profil → suit → met "Fait". On enregistre
 * l'accomplissement (preuve qu'il applique la stratégie) + on note dans le CRM
 * qu'on suit ce prospect (si le handle correspond à un prospect).
 * Body: { platform, handle, done, prospectId? }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const supabase = sb();
  const body = await req.json().catch(() => ({}));
  const rawP = String(body.platform || 'tiktok').toLowerCase();
  const platform = ['instagram', 'tiktok', 'linkedin'].includes(rawP) ? rawP : 'tiktok';
  const handle = String(body.handle || '').replace(/^@/, '').trim();
  if (!handle) return NextResponse.json({ ok: false, error: 'handle requis' }, { status: 400 });
  const done = body.done !== false;
  try {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'client_follow_action', status: 'ok', user_id: user.id,
      data: { platform, handle, done, prospect_id: body.prospectId || null, at: new Date().toISOString() },
      created_at: new Date().toISOString(),
    });
    // Lien CRM : on note qu'on suit ce prospect (si fourni / retrouvé par handle).
    if (done) {
      let prospectId = body.prospectId || null;
      if (!prospectId) {
        const col = platform === 'instagram' ? 'instagram' : platform === 'tiktok' ? 'tiktok_handle' : 'linkedin_url';
        try {
          const { data: p } = await supabase.from('crm_prospects').select('id').eq('user_id', user.id).ilike(col, `%${handle}%`).limit(1).maybeSingle();
          prospectId = (p as any)?.id || null;
        } catch { /* best-effort */ }
      }
      if (prospectId) {
        await supabase.from('crm_activities').insert({
          prospect_id: prospectId, type: 'client_followed',
          description: `Le client suit ce prospect sur ${platform} (@${handle})`,
          data: { platform, handle, action: 'followed_by_client' }, created_at: new Date().toISOString(),
        }).then(() => {}, () => {});
      }
    }
    return NextResponse.json({ ok: true, done });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}
