/**
 * Résolution du compte Instagram depuis le SITE du commerce.
 *
 * Extrait de `app/api/agents/gmaps/route.ts` où la fonction était enterrée, et
 * complété selon la spec : robots.txt respecté, User-Agent identifiable, un
 * seul aller-retour par domaine.
 *
 * ── Pourquoi passer par le site et pas par Instagram ──
 *
 * Chercher un compte en interrogeant Instagram, c'est du scraping : ça se fait
 * bloquer, ça viole leurs conditions, et ça expose le compte qui sert à
 * publier pour nos clients. Le lien social figure presque toujours dans le pied
 * de page du site — information publique, que le commerce a lui-même choisi de
 * publier. Aucun compte sans site n'est pénalisé : il reste scorable, le
 * barème prévoit même des points pour l'absence de présence en ligne.
 */

/** Identifiable, avec un contact : un site qui veut nous bloquer doit pouvoir. */
const UA = 'KeiroAI-Bot/1.0 (+https://keiroai.com/bot; contact@keiroai.com)';

const TIMEOUT_MS = 5000;

/** Chemins Instagram qui ne sont pas des comptes. */
const NON_COMPTES = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'tv', 'direct', 'about', 'developer', 'legal']);

/** Un domaine n'est visité qu'une fois par exécution. */
const domainesVus = new Map<string, ResultatSocial>();

export interface ResultatSocial {
  instagram: string | null;
  /** Autres réseaux trouvés au passage : ils enrichissent la fiche CRM. */
  tiktok: string | null;
  facebook: string | null;
  linkedin: string | null;
  /** Pourquoi on n'a rien : utile pour distinguer « pas de compte » de « site injoignable ». */
  raison?: 'ok' | 'robots_interdit' | 'injoignable' | 'aucun_lien';
}

const VIDE: ResultatSocial = { instagram: null, tiktok: null, facebook: null, linkedin: null };

/**
 * robots.txt autorise-t-il la lecture de la page d'accueil ?
 *
 * On ne lit que la racine, donc un contrôle sommaire suffit : un `Disallow: /`
 * s'appliquant à tous les agents, ou à nous nommément. En cas de doute ou
 * d'erreur, on considère que c'est autorisé — un robots.txt illisible ne vaut
 * pas interdiction, et refuser par défaut nous priverait de la majorité des
 * sites, dont beaucoup n'en ont simplement pas.
 */
async function robotsAutorise(origine: string): Promise<boolean> {
  try {
    const res = await fetch(`${origine}/robots.txt`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return true;
    const texte = (await res.text()).slice(0, 20_000);

    // On isole les blocs qui nous concernent : « * » et notre nom.
    const lignes = texte.split('\n').map(l => l.trim().toLowerCase());
    let concerne = false;
    for (const ligne of lignes) {
      if (ligne.startsWith('user-agent:')) {
        const cible = ligne.slice('user-agent:'.length).trim();
        concerne = cible === '*' || cible.includes('keiroai');
        continue;
      }
      if (!concerne) continue;
      if (ligne.startsWith('disallow:')) {
        const chemin = ligne.slice('disallow:'.length).trim();
        if (chemin === '/') return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

function nettoyerHandle(brut: string): string | null {
  const h = brut.replace(/\/+$/, '').replace(/^@+/, '').split('?')[0].split('#')[0].trim();
  if (!h || h.length < 2 || h.length > 30) return null;
  if (NON_COMPTES.has(h.toLowerCase())) return null;
  if (!/^[A-Za-z0-9_.]+$/.test(h)) return null;
  return h.toLowerCase();
}

function extraire(html: string, motif: RegExp): string | null {
  const vus = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(motif.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    const h = nettoyerHandle(m[1] || '');
    if (h && !vus.has(h)) {
      vus.add(h);
      return h;
    }
  }
  return null;
}

/**
 * Lit la page d'accueil et en extrait les comptes sociaux.
 *
 * Renvoie toujours un objet : un site injoignable n'est pas une erreur, c'est
 * une information (le prospect reste scorable, et l'absence de site vaut même
 * des points au barème).
 */
export async function comptesDepuisSite(website?: string | null): Promise<ResultatSocial> {
  if (!website) return { ...VIDE, raison: 'aucun_lien' };

  let origine: string;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    origine = u.origin;
  } catch {
    return { ...VIDE, raison: 'injoignable' };
  }

  const cache = domainesVus.get(origine);
  if (cache) return cache;

  let resultat: ResultatSocial;
  if (!(await robotsAutorise(origine))) {
    resultat = { ...VIDE, raison: 'robots_interdit' };
  } else {
    try {
      const res = await fetch(origine, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!res.ok) {
        resultat = { ...VIDE, raison: 'injoignable' };
      } else {
        // Un pied de page suffit largement ; lire 500 ko d'une page lourde ne
        // rapporterait rien de plus et coûterait de la mémoire sur un gros lot.
        const html = (await res.text()).slice(0, 500_000);
        const instagram = extraire(html, /(?:instagram\.com|instagr\.am)\/([A-Za-z0-9_.]{2,30})/);
        const tiktok = extraire(html, /tiktok\.com\/@([A-Za-z0-9_.]{2,30})/);
        const facebook = extraire(html, /facebook\.com\/([A-Za-z0-9_.]{2,50})/);
        const linkedin = extraire(html, /linkedin\.com\/(?:company|in)\/([A-Za-z0-9_.-]{2,60})/);
        resultat = {
          instagram, tiktok, facebook, linkedin,
          raison: instagram || tiktok || facebook || linkedin ? 'ok' : 'aucun_lien',
        };
      }
    } catch {
      resultat = { ...VIDE, raison: 'injoignable' };
    }
  }

  domainesVus.set(origine, resultat);
  return resultat;
}

/** Vide le cache de domaines — à appeler entre deux lots. */
export function reinitialiserCacheDomaines(): void {
  domainesVus.clear();
}
