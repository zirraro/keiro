/**
 * Scraping poli — monter le volume sans se faire bloquer.
 *
 * ── La consigne ──
 *
 * 2026-08-10, le fondateur : « scraping gratuit à fond, sans prendre de risque
 * de sécurité ou de ban, attention. »
 *
 * L'avertissement vise le bon endroit. Le volume qu'on veut atteindre — 200
 * prospects par passage, trois passages par jour — n'est dangereux que si les
 * requêtes tombent au mauvais endroit.
 *
 * ── Où est le risque, mesuré ──
 *
 * Sur les 6 665 prospects sans adresse mail :
 *   · 6 125 ont un SITE WEB — un hôte différent à chaque fois, une requête par
 *     domaine, avec notre propre nom dans l'en-tête. Aucun risque : c'est ce
 *     que fait n'importe quel lecteur de flux ;
 *   · 540 n'ont qu'un Instagram — un seul hôte, très surveillé, qui bloque à
 *     l'adresse IP ;
 *   · 0 n'ont que TikTok.
 *
 * Autrement dit : 92 % du gisement se traite par le chemin sans risque. Le
 * volume peut donc monter à fond côté web, à condition que le trafic vers les
 * réseaux sociaux, lui, reste un filet.
 *
 * C'est important au-delà du scraping : l'adresse IP du serveur est celle qui
 * porte aussi les appels API Meta de nos clients. Se faire signaler par
 * Instagram pour du scraping serait payé par les publications des clients.
 *
 * ── Ce que ce module impose ──
 *
 * Un espacement minimum entre deux requêtes vers un MÊME hôte, et un plafond
 * quotidien par hôte pour les réseaux sociaux. Des hôtes différents ne
 * s'attendent pas entre eux : deux sites de commerçants sans rapport peuvent
 * être lus en même temps, c'est le même hôte martelé qui pose problème.
 *
 * Et un en-tête honnête partout. Un robot qui se présente se fait éconduire
 * poliment ; un robot qui se déguise en navigateur se fait bannir, et donne
 * raison à celui qui bannit.
 */

/** Notre en-tête, le même partout. On dit qui on est et où nous joindre. */
export const AGENT_HTTP = 'Mozilla/5.0 (compatible; KeiroAI/1.0; +https://keiroai.com/bot)';

/** Hôtes à traiter avec parcimonie : un seul serveur, qui bloque par IP. */
const HOTES_SENSIBLES = new Set([
  'instagram.com', 'www.instagram.com', 'i.instagram.com',
  'tiktok.com', 'www.tiktok.com',
  'facebook.com', 'www.facebook.com',
  'linkedin.com', 'www.linkedin.com',
]);

/** Espacement minimum entre deux requêtes vers le même hôte. */
const ESPACEMENT_MS = { sensible: 20_000, ordinaire: 1_500 };

/**
 * Plafond quotidien par hôte sensible.
 *
 * 60 profils par jour couvre largement les 540 prospects qui n'ont qu'un
 * Instagram — neuf jours pour tout traiter — tout en restant à un rythme
 * qu'aucun serveur ne remarque.
 */
const PLAFOND_QUOTIDIEN_SENSIBLE = 60;

const dernierAppel = new Map<string, number>();
const compteurDuJour = new Map<string, { jour: string; n: number }>();

function hoteDe(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

export function estHoteSensible(url: string): boolean {
  const h = hoteDe(url);
  return HOTES_SENSIBLES.has(h) || [...HOTES_SENSIBLES].some((s) => h.endsWith('.' + s));
}

/**
 * Le plafond quotidien de cet hôte est-il atteint ?
 *
 * Consultation seule — n'incrémente rien, pour qu'un appelant puisse décider
 * de sauter un prospect sans consommer son quota.
 */
export function plafondAtteint(url: string): boolean {
  if (!estHoteSensible(url)) return false;
  const h = hoteDe(url);
  const jour = new Date().toISOString().slice(0, 10);
  const c = compteurDuJour.get(h);
  if (!c || c.jour !== jour) return false;
  return c.n >= PLAFOND_QUOTIDIEN_SENSIBLE;
}

function compter(url: string): void {
  const h = hoteDe(url);
  const jour = new Date().toISOString().slice(0, 10);
  const c = compteurDuJour.get(h);
  if (!c || c.jour !== jour) compteurDuJour.set(h, { jour, n: 1 });
  else c.n++;
}

/**
 * Attend le temps qu'il faut avant d'interroger cet hôte, puis marque le
 * passage. Deux hôtes différents ne s'attendent jamais.
 */
export async function attendreSonTour(url: string): Promise<void> {
  const h = hoteDe(url);
  if (!h) return;
  const espacement = estHoteSensible(url) ? ESPACEMENT_MS.sensible : ESPACEMENT_MS.ordinaire;
  const precedent = dernierAppel.get(h) || 0;
  const attente = precedent + espacement - Date.now();
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
  dernierAppel.set(h, Date.now());
  compter(url);
}

/**
 * Requête polie : espacement respecté, en-tête honnête, délai borné.
 *
 * Renvoie `null` plutôt que de lever, et `null` aussi quand le plafond du jour
 * est atteint — l'appelant enchaîne sur le prospect suivant au lieu de
 * s'arrêter. Un enrichissement manqué est sans gravité ; une adresse IP
 * bloquée coûte les publications de tous les clients.
 */
export async function requetePolie(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<Response | null> {
  if (plafondAtteint(url)) return null;
  await attendreSonTour(url);
  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 7000),
      headers: {
        'User-Agent': AGENT_HTTP,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        ...(options.headers || {}),
      },
      redirect: 'follow',
    });
  } catch {
    return null;
  }
}

/**
 * Le fichier robots.txt du site autorise-t-il notre lecture ?
 *
 * Contrôle volontairement simple : on ne cherche que l'interdiction générale
 * (`Disallow: /` sous `User-agent: *`), la seule qui dise clairement « ne
 * venez pas ». Une analyse fine des règles par chemin serait plus juste mais
 * plus fragile, et refuserait des lectures parfaitement admises.
 *
 * En cas de doute — fichier absent, illisible, serveur muet — on lit : c'est
 * le comportement de tous les robots, et l'absence de robots.txt vaut
 * autorisation.
 */
const robotsConnus = new Map<string, boolean>();

export async function lectureAutorisee(url: string): Promise<boolean> {
  const h = hoteDe(url);
  if (!h) return false;
  if (robotsConnus.has(h)) return robotsConnus.get(h)!;

  let autorise = true;
  try {
    const res = await requetePolie(`https://${h}/robots.txt`, { timeoutMs: 4000 });
    if (res && res.ok) {
      const txt = (await res.text()).slice(0, 20_000);
      const bloc = txt.split(/user-agent:/i).find((b) => /^\s*\*/.test(b));
      if (bloc && /^\s*disallow:\s*\/\s*$/im.test(bloc)) autorise = false;
    }
  } catch { /* doute : on lit */ }

  robotsConnus.set(h, autorise);
  return autorise;
}
