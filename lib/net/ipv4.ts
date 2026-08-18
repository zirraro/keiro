/**
 * Sortir en IPv4 quand le correspondant refuse notre IPv6.
 *
 * ── Ce qu'on a mesuré, le 18 août, depuis la production ──
 *
 *   IPv4 sortante            51.68.226.25
 *   IPv6 sortante            2001:41d0:305:2100::9dca
 *   Gemini, choix de Node    HTTP 400 — User location is not supported
 *   Gemini, IPv4 forcée      HTTP 200 — OK
 *
 * Google classe la plage IPv6 d'OVH comme non supportée ; l'IPv4 du MÊME
 * serveur passe sans problème. Ce n'est donc ni la clé, ni le pays, ni un
 * changement de notre code : c'est la famille d'adresses choisie au moment de
 * la connexion.
 *
 * ── Pourquoi « d'un coup » ──
 *
 * Node applique « Happy Eyeballs » et peut préférer l'IPv6 selon l'ordre de
 * résolution et l'état du réseau. Le dernier appel Gemini réussi date du 17
 * août 08 h 21 — juste avant un redémarrage de l'application. Rien n'a changé
 * chez Google ce jour-là : c'est notre processus qui s'est mis à sortir par
 * l'autre porte.
 *
 * J'avais conclu à un filtrage de plage de datacenter et demandé au fondateur
 * de créer une clé de compte de service pour Vertex AI. C'était une hypothèse
 * habillée en conclusion, et elle lui coûtait du travail inutile. Le
 * diagnostic tranche : une ligne suffit.
 *
 * ── Pourquoi ciblé et non global ──
 *
 * On ne force pas l'IPv4 sur TOUT le trafic sortant : d'autres services de ce
 * parc dépendent de l'IPv6 — la connexion directe à PostgreSQL de Supabase
 * n'existe qu'en IPv6. On l'applique donc aux appels dont on sait qu'ils sont
 * refusés, et à eux seuls.
 */

let agentIPv4: any = null;

/**
 * Le connecteur IPv4 partagé, ou `undefined` si undici n'est pas disponible.
 *
 * Réutilisé d'un appel à l'autre : ouvrir un pool par requête coûterait une
 * poignée de main TLS à chaque image jugée.
 */
export async function dispatcherIPv4(): Promise<any | undefined> {
  if (agentIPv4) return agentIPv4;
  try {
    const { Agent } = await import('undici');
    agentIPv4 = new Agent({
      connect: { family: 4 } as any,
      headersTimeout: 120_000,
      bodyTimeout: 120_000,
    });
    return agentIPv4;
  } catch {
    // Sans undici on laisse Node décider : mieux vaut un appel qui tente sa
    // chance qu'un appel qu'on refuse de faire.
    return undefined;
  }
}

/**
 * `fetch`, mais en sortant par l'IPv4.
 *
 * Signature identique à `fetch` pour qu'un appel existant se convertisse en
 * changeant un seul mot.
 */
export async function fetchIPv4(url: string, init: RequestInit = {}): Promise<Response> {
  const dispatcher = await dispatcherIPv4();
  const opts: any = { ...init };
  if (dispatcher) opts.dispatcher = dispatcher;
  return fetch(url, opts);
}
