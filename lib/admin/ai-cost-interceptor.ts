/**
 * Compteur universel des appels d'IA payants.
 *
 * ── Pourquoi un intercepteur plutôt que des appels à `logApiCost` ──
 *
 * Question du fondateur (2026-08-01) : « 37 USD consommés en 24h, il faut
 * savoir qui a consommé ». La réponse était impossible à donner : sur 59
 * fichiers qui appellent une IA payante, 4 seulement journalisaient leur
 * dépense. Le tableau de bord voyait 26 appels Anthropic en 14 jours, là où il
 * s'en fait des milliers.
 *
 * Instrumenter les 59 fichiers un par un ne règle rien durablement : deux
 * formes d'appel coexistent (SDK et fetch direct), et le prochain fichier écrit
 * oubliera la ligne de journalisation — c'est exactement comme ça qu'on en est
 * arrivé là.
 *
 * On intercepte donc `fetch` lui-même, une fois au démarrage. Le SDK Anthropic
 * s'appuie sur fetch, les appels directs aussi : les deux passent ici. Un
 * nouvel appel écrit demain est compté sans que personne y pense, et aucun ne
 * peut être oublié.
 *
 * ── Attribution ──
 *
 * On lit la pile d'appel pour retrouver le module appelant, puis on le traduit
 * en nom d'agent. C'est imparfait sur les chemins très indirects, mais ça donne
 * la réponse qui manquait : quel agent brûle le budget.
 *
 * ── Garanties ──
 *
 * Le compteur ne doit JAMAIS casser un appel : le corps de la réponse est lu
 * sur un clone, les flux (streaming) sont laissés intacts, et toute erreur est
 * avalée. Une panne de comptabilité ne doit pas devenir une panne de service.
 */

import { logApiCost } from './api-cost-logger';
import { contexteCoutActuel } from './contexte-cout';

let installe = false;

interface Tarif { entree: number; sortie: number; cacheEcriture?: number; cacheLecture?: number }

/** Coût par million de tokens, en dollars, par famille de modèle. */
const TARIFS: Array<Tarif & { test: RegExp }> = [
  { test: /opus/i,               entree: 15,   sortie: 75,   cacheEcriture: 18.75, cacheLecture: 1.5 },
  { test: /sonnet/i,             entree: 3,    sortie: 15,   cacheEcriture: 3.75,  cacheLecture: 0.3 },
  { test: /haiku/i,              entree: 0.8,  sortie: 4,    cacheEcriture: 1,     cacheLecture: 0.08 },
  { test: /gemini.*(pro)/i,      entree: 1.25, sortie: 10 },
  { test: /gemini.*(flash-lite)/i, entree: 0.1, sortie: 0.4 },
  { test: /gemini/i,             entree: 0.3,  sortie: 2.5 },
];

const USD_VERS_EUR = 0.92;

function tarifPour(modele: string): Tarif {
  return TARIFS.find(t => t.test.test(modele)) || { entree: 3, sortie: 15 };
}

/**
 * Retrouve l'agent responsable en remontant la pile d'appel.
 *
 * On saute les frames du compteur lui-même, du SDK et des internes Node, puis
 * on traduit le premier fichier du produit rencontré en nom d'agent.
 */
function attribuer(pile: string): { agent: string; source: string } {
  const lignes = pile.split('\n').slice(1);
  for (const l of lignes) {
    if (/ai-cost-interceptor|api-cost-logger|node_modules|node:internal/.test(l)) continue;
    const m = l.match(/(?:app|lib|worker)[\\/]([^\s)]+\.(?:ts|tsx|js|mjs))/);
    if (!m) continue;
    const chemin = m[0].replace(/\\/g, '/');

    // Le nom d'agent est déduit du chemin : c'est là que vit la logique métier.
    const parAgent: Array<[RegExp, string]> = [
      [/agents\/(email|hugo)|hugo-/, 'email'],
      [/agents\/(commercial|leo)|prospect/, 'commercial'],
      [/agents\/(content|lena)|visuals\/|content-prompt/, 'content'],
      [/agents\/(dm_instagram|jade)|dm-|instagram/, 'dm_instagram'],
      [/agents\/(gmaps|theo)|theo-|review/, 'gmaps'],
      [/agents\/(seo)|blog/, 'seo'],
      [/agents\/(whatsapp|stella)/, 'whatsapp'],
      [/agents\/(rh|sara)/, 'rh'],
      [/agents\/(comptable|louis)/, 'comptable'],
      [/agents\/(marketing|ami)/, 'marketing'],
      [/agents\/(onboarding|clara|chatbot)/, 'onboarding'],
      [/agents\/(ceo|noah)/, 'ceo'],
      [/agents\/(retention)/, 'retention'],
      [/client-chat|agents\/chat/, 'agent_chat'],
      [/cron\//, 'cron'],
    ];
    for (const [re, agent] of parAgent) if (re.test(chemin)) return { agent, source: chemin };
    return { agent: 'autre', source: chemin };
  }
  return { agent: 'inconnu', source: '' };
}

/** Extrait la consommation de la réponse, quel que soit le fournisseur. */
function lireUsage(corps: any): { entree: number; sortie: number; cacheEcriture: number; cacheLecture: number; modele: string } | null {
  // Anthropic
  if (corps?.usage?.input_tokens != null || corps?.usage?.output_tokens != null) {
    return {
      entree: corps.usage.input_tokens || 0,
      sortie: corps.usage.output_tokens || 0,
      cacheEcriture: corps.usage.cache_creation_input_tokens || 0,
      cacheLecture: corps.usage.cache_read_input_tokens || 0,
      modele: corps.model || '',
    };
  }
  // Gemini
  if (corps?.usageMetadata) {
    return {
      entree: corps.usageMetadata.promptTokenCount || 0,
      sortie: (corps.usageMetadata.candidatesTokenCount || 0) + (corps.usageMetadata.thoughtsTokenCount || 0),
      cacheEcriture: 0,
      cacheLecture: corps.usageMetadata.cachedContentTokenCount || 0,
      modele: corps.modelVersion || 'gemini',
    };
  }
  return null;
}

/**
 * Pose le compteur sur `fetch`. Idempotent : un second appel ne fait rien.
 */
export function installerCompteurIA(): void {
  if (installe) return;
  installe = true;

  const fetchOriginal = globalThis.fetch;

  globalThis.fetch = async function (entree: any, options?: any): Promise<Response> {
    const url = typeof entree === 'string' ? entree : entree?.url || String(entree);
    const estIA = /api\.anthropic\.com|generativelanguage\.googleapis\.com/.test(url);
    if (!estIA) return fetchOriginal(entree, options);

    // On capture la pile AVANT l'appel : après, le contexte est perdu.
    const pile = new Error().stack || '';
    const debut = Date.now();
    const reponse = await fetchOriginal(entree, options);

    try {
      // Un flux ne se lit pas deux fois sans risque de le casser : on ne
      // compte pas le streaming plutôt que de dégrader un appel client.
      const typeContenu = reponse.headers.get('content-type') || '';
      if (typeContenu.includes('text/event-stream')) return reponse;

      // Le clone permet de lire sans consommer la réponse rendue à l'appelant.
      const clone = reponse.clone();
      void (async () => {
        try {
          const corps = await clone.json().catch(() => null);
          const usage = lireUsage(corps);
          if (!usage) return;

          const fournisseur = /anthropic/.test(url) ? 'anthropic' : 'gemini';
          const modele = usage.modele || (typeof options?.body === 'string' ? (JSON.parse(options.body)?.model || '') : '');
          const t = tarifPour(modele);
          const coutUsd =
            (usage.entree * t.entree
              + usage.sortie * t.sortie
              + usage.cacheEcriture * (t.cacheEcriture ?? t.entree)
              + usage.cacheLecture * (t.cacheLecture ?? t.entree * 0.1)) / 1e6;

          const { agent, source } = attribuer(pile);
          // Le contexte d'exécution prime sur la pile d'appels : il porte le
          // CLIENT, que les noms de fichiers ne peuvent pas contenir, et un nom
          // d'agent posé explicitement plutôt que deviné.
          const ctx = contexteCoutActuel();
          await logApiCost({
            user_id: ctx.userId ?? null,
            provider: fournisseur,
            kind: modele || fournisseur,
            units: usage.entree + usage.sortie,
            cost_eur: Math.round(coutUsd * USD_VERS_EUR * 1e6) / 1e6,
            agent: ctx.agent || agent,
            metadata: {
              source: ctx.agent ? 'contexte' : source,
              origine: ctx.origine ?? null,
              modele,
              tokens_entree: usage.entree,
              tokens_sortie: usage.sortie,
              cache_lecture: usage.cacheLecture,
              cache_ecriture: usage.cacheEcriture,
              ms: Date.now() - debut,
              statut: reponse.status,
            },
          });
        } catch { /* la comptabilité ne casse jamais l'appel */ }
      })();
    } catch { /* idem */ }

    return reponse;
  } as typeof fetch;

  console.log('[compteur-ia] compteur universel posé sur fetch (Anthropic + Gemini)');
}
