/**
 * Enrichissement Instagram d'un prospect via `business_discovery`.
 *
 * Étend `dm-verify.ts`, qui fait déjà l'appel mais ne demande que les
 * identifiants des 3 derniers médias. Le scoring a besoin des HORODATAGES pour
 * calculer l'ancienneté du dernier post — le signal le plus lourd du barème —
 * et des médias eux-mêmes si l'analyse visuelle est un jour activée.
 *
 * ── Ce qu'il faut savoir avant de lire ──
 *
 * `business_discovery` n'est exposé que sur `graph.facebook.com`, avec un
 * token de PAGE Facebook. Sur `graph.instagram.com` le champ n'existe pas, et
 * l'erreur renvoyée (« Tried accessing nonexisting field ») ne le dit pas
 * clairement. Ce piège a déjà coûté des jours ; il est reproduit ici pour ne
 * pas avoir à le redécouvrir.
 *
 * Il ne résout QUE les comptes Professionnels (business ou créateur). Un
 * compte personnel est indiscernable d'un compte inexistant : c'est une limite
 * de l'API, pas une erreur. On prévoit 30 à 40 % de non-résolutions et on les
 * range dans un statut explicite plutôt que de les traiter comme des échecs.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { SEUILS } from './scoring-config';

export type StatutIg = 'professional' | 'not_found' | 'private_or_personal' | 'error';

export interface EnrichissementIg {
  statut: StatutIg;
  handle: string;
  followers?: number;
  mediaCount?: number;
  dernierPostLe?: string | null;
  joursDepuisDernierPost?: number | null;
  /** Les 6 derniers médias, pour l'analyse visuelle optionnelle. */
  medias?: Array<{ id: string; timestamp?: string; media_type?: string; media_url?: string; caption?: string }>;
  erreur?: string;
}

function nettoyer(handle: string): string {
  return (handle || '')
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\s/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Distingue « compte introuvable » de « compte non professionnel ».
 *
 * La distinction compte pour le pilotage : un taux élevé de comptes personnels
 * est normal et n'appelle aucune action, alors qu'un taux élevé d'erreurs
 * signale un problème de token ou de quota. Les confondre reviendrait à
 * s'alarmer d'un fonctionnement nominal, ou à ignorer une panne réelle.
 */
function classerErreur(message: string): StatutIg {
  const m = (message || '').toLowerCase();
  if (m.includes('does not exist') || m.includes('cannot be loaded') || m.includes('code: 24')) return 'not_found';
  if (m.includes('no_business_discovery') || m.includes('nonexisting field')) return 'private_or_personal';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('#4') || m.includes('#17')) return 'error';
  if (m.includes('token') || m.includes('oauth') || m.includes('session')) return 'error';
  return 'private_or_personal';
}

export async function enrichirInstagram(
  handle: string,
  igBusinessId: string,
  pageAccessToken: string,
): Promise<EnrichissementIg> {
  const propre = nettoyer(handle);
  if (!propre || propre.length < 2) {
    return { statut: 'not_found', handle: propre, erreur: 'handle vide' };
  }

  const champs =
    `business_discovery.username(${encodeURIComponent(propre)})` +
    `{id,username,followers_count,media_count,media.limit(6){id,timestamp,media_type,media_url,caption}}`;
  const url = `https://graph.facebook.com/v21.0/${igBusinessId}?fields=${champs}` +
    `&access_token=${encodeURIComponent(pageAccessToken)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const bd = data?.business_discovery;

    if (!bd?.id) {
      const msg = data?.error?.message || 'no_business_discovery';
      return { statut: classerErreur(String(msg)), handle: propre, erreur: String(msg).slice(0, 200) };
    }

    const medias = (bd.media?.data || []).filter(Boolean);
    const horodatages = medias
      .map((m: any) => m?.timestamp)
      .filter(Boolean)
      .map((t: string) => new Date(t).getTime())
      .filter((t: number) => Number.isFinite(t));

    const dernier = horodatages.length ? Math.max(...horodatages) : null;

    return {
      statut: 'professional',
      handle: bd.username || propre,
      followers: typeof bd.followers_count === 'number' ? bd.followers_count : undefined,
      mediaCount: typeof bd.media_count === 'number' ? bd.media_count : undefined,
      dernierPostLe: dernier ? new Date(dernier).toISOString() : null,
      joursDepuisDernierPost: dernier ? Math.floor((Date.now() - dernier) / 86400000) : null,
      medias,
    };
  } catch (e: any) {
    return { statut: 'error', handle: propre, erreur: String(e?.message || e).slice(0, 200) };
  }
}

/**
 * Le compte a-t-il été enrichi assez récemment pour qu'on s'en dispense ?
 *
 * Le quota Graph est la ressource rare du pipeline. Réinterroger un handle vu
 * il y a trois jours consomme un appel pour une information qui n'aura pas
 * bougé : le signal qu'on lit est l'ancienneté du dernier post, qui se
 * recalcule sans appel tant qu'on connaît la date.
 */
export function enrichissementFrais(enrichiLe?: string | null): boolean {
  if (!enrichiLe) return false;
  const age = Date.now() - new Date(enrichiLe).getTime();
  return Number.isFinite(age) && age < SEUILS.IG_CACHE_JOURS * 86400000;
}

/**
 * Le compte du client qui sert à interroger l'API.
 *
 * Chaque client interroge avec SON propre compte : le quota est ainsi réparti
 * au lieu d'être concentré sur un seul, et un client dont le token expire ne
 * bloque que son propre enrichissement. On retombe sur le compte administrateur
 * uniquement pour les clients qui n'ont pas encore connecté Instagram — sans
 * quoi ils n'auraient aucun enrichissement du tout.
 */
export async function comptePourInterroger(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ igId: string; token: string; emprunte: boolean } | null> {
  const { data: profil } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, facebook_page_access_token')
    .eq('id', userId)
    .maybeSingle();

  if ((profil as any)?.instagram_business_account_id && (profil as any)?.facebook_page_access_token) {
    return {
      igId: (profil as any).instagram_business_account_id,
      token: (profil as any).facebook_page_access_token,
      emprunte: false,
    };
  }

  // Repli : d'abord un compte administrateur, sinon n'importe quel compte
  // connecté de la plateforme.
  //
  // Le premier lot réel a montré la limite du repli « admin uniquement » :
  // le compte fondateur n'a pas d'identifiant business, donc DEUX clients sur
  // trois n'ont eu aucun enrichissement — et leurs prospects ont été scorés
  // comme s'ils n'avaient pas de compte Instagram, ce qui est faux.
  //
  // `business_discovery` ne lit que des données publiques et n'expose rien du
  // compte qui interroge ; l'emprunt ne coûte qu'un peu de quota, et il est
  // tracé (`emprunte`) pour rester visible en supervision.
  for (const filtre of [true, false]) {
    let q = supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token')
      .not('instagram_business_account_id', 'is', null)
      .not('facebook_page_access_token', 'is', null)
      .limit(1);
    if (filtre) q = q.eq('is_admin', true);
    const { data } = await q.maybeSingle();
    if ((data as any)?.instagram_business_account_id) {
      return {
        igId: (data as any).instagram_business_account_id,
        token: (data as any).facebook_page_access_token,
        emprunte: true,
      };
    }
  }
  return null;
}
