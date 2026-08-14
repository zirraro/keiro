import { contexteCoutActuel } from '../admin/contexte-cout';

/**
 * L'étage « qualité » quand Claude n'est pas là — sans nouvelle facture à avancer.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Fondateur, 2026-08-14 : « Anthropic Claude n'a pas de crédit, c'est pour ça.
 * Et en plus c'est très cher, et il faut mettre les sous en avance pour la
 * gestion des frais, c'est compliqué je trouve. »
 *
 * Ce n'est pas une panne, c'est une décision de trésorerie. Le problème à
 * résoudre change donc : il ne s'agit plus de recharger Anthropic, mais de
 * rendre le repli acceptable.
 *
 * ── Ce que le repli actuel coûte en qualité ──
 *
 * Le routeur applique une décision du fondateur de juin : Hugo (email froid),
 * Jade (DM), Ami et Noah tournent TOUJOURS sur Sonnet, parce que « la nuance
 * ferme la vente ». Léna y passe dès qu'un brief touche à l'actualité. Sans
 * Claude, tout ce monde tombe sur Gemini Flash — le modèle rapide, choisi à
 * l'origine pour les tâches simples, pas pour la vente ni la stratégie.
 *
 * Deux semaines de contenu et de prospection ont été produites comme ça.
 *
 * ── Pourquoi DeepSeek, et pourquoi ici ──
 *
 * Testé le 14 août sur notre vraie tâche (légende d'un post, boulangerie
 * lyonnaise, nos règles de style), deepseek-v3-2 rend 99 tokens en 4,2 s :
 *
 *   « Il est 12h45, la file d'attente s'allonge déjà derrière toi. On a sorti
 *     les derniers sandwichs frais du matin, et ils vont filer vite. »
 *
 * Deuxième personne, tension concrète, zéro registre marketing, trois hashtags
 * français. C'est le niveau qu'on attend, et c'est mieux que ce que Flash rend
 * sur la même consigne.
 *
 * Le point décisif est ailleurs : DeepSeek passe par ByteDance ARK, le MÊME
 * compte qui paie déjà Seedream et Seedance. Pas de nouveau fournisseur, pas de
 * nouvelle avance de trésorerie, une seule facture. C'est exactement la
 * contrainte que le fondateur a posée.
 *
 * ── Ce que ça ne fait pas ──
 *
 * Ça ne remplace pas Claude par décret. L'ordre reste : Claude s'il est
 * joignable, DeepSeek sinon, Gemini en dernier recours. Le jour où le crédit
 * Anthropic revient, les agents le retrouvent sans qu'on touche au code.
 */

const ARK_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions';

/**
 * Vérifié au catalogue du fournisseur le 14 août, pas écrit de mémoire.
 *
 * Un identifiant de modèle inventé ne lève pas d'erreur visible : l'appel
 * échoue, le repli prend la main, et on livre du contenu dégradé sans le
 * savoir. C'est arrivé cette semaine même, sur le modèle vidéo.
 *
 * v3-2 plutôt que v4 : à qualité comparable sur nos briefs, v3-2 rend 99 tokens
 * quand v4-pro en dépense 1 378 en raisonnement pour un résultat équivalent, et
 * répond en 4 s au lieu de 28. On paie le résultat, pas la réflexion.
 */
export const MODELE_DEEPSEEK = process.env.DEEPSEEK_MODEL || 'deepseek-v3-2-251201';

export function deepseekDisponible(): boolean {
  return !!(process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY);
}

export async function callDeepSeek(opts: {
  system: string;
  message: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  // La clé est celle d'ARK, déjà en place pour les images et les vidéos.
  const cle = process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY;
  if (!cle) throw new Error('Clé ARK absente — DeepSeek indisponible');

  const debut = Date.now();
  const r = await fetch(ARK_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELE_DEEPSEEK,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.message },
      ],
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.8,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const data = await r.json().catch(() => null);
  if (!r.ok || data?.error) {
    throw new Error(`DeepSeek ${r.status} — ${String(data?.error?.message || '').slice(0, 200)}`);
  }

  let texte = data?.choices?.[0]?.message?.content?.trim() || '';

  /**
   * La clôture markdown, retirée quand elle enveloppe TOUTE la réponse.
   *
   * Nos appelants demandent souvent du JSON strict. Les deux modèles répondent
   * volontiers ```json { … } ``` — Gemini le faisait déjà, et vingt-cinq
   * endroits du code retirent la clôture chacun de leur côté. Ceux qui ne le
   * font pas plantent au JSON.parse.
   *
   * On le fait une fois ici plutôt que d'attendre de découvrir lequel des
   * appelants avait oublié. Condition stricte : la réponse ENTIÈRE doit être un
   * seul bloc clôturé — sinon on abîmerait un article de blog qui contient
   * légitimement un extrait de code.
   */
  const bloc = texte.match(/^```(?:json|javascript|js)?\s*\n([\s\S]*?)\n?```$/);
  if (bloc) texte = bloc[1].trim();

  // On trace la dépense comme les autres, avec le client et l'agent : une ligne
  // de coût sans attribution finit en « inconnu » et ne sert à personne.
  try {
    const { logApiCost } = await import('@/lib/admin/api-cost-logger');
    const usage = data?.usage || {};
    const ctx = contexteCoutActuel();
    // Tarif à confirmer dans la console ARK : on journalise les tokens même
    // sans prix certain, plutôt que de ne rien journaliser. Un coût approché
    // et visible vaut mieux qu'un coût exact et absent.
    const PRIX_M_USD = Number(process.env.DEEPSEEK_PRIX_M_USD || 0.4);
    const coutUsd = ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0)) / 1e6 * PRIX_M_USD;
    await logApiCost({
      provider: 'ark',
      kind: MODELE_DEEPSEEK,
      units: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
      cost_eur: Math.round(coutUsd * 0.92 * 1e6) / 1e6,
      user_id: ctx.userId ?? null,
      agent: ctx.agent ?? null,
      metadata: {
        modele: MODELE_DEEPSEEK,
        tokens_entree: usage.prompt_tokens ?? 0,
        tokens_sortie: usage.completion_tokens ?? 0,
        ms: Date.now() - debut,
        prix_estime: true,
        origine: ctx.origine ?? null,
      },
    }).catch(() => {});
  } catch { /* la journalisation ne fait jamais échouer un appel */ }

  if (!texte) throw new Error('DeepSeek a répondu vide');
  return texte;
}
