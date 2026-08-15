/**
 * Passerelle Anthropic → Gemini, à la forme exacte de l'API Anthropic.
 *
 * ── Pourquoi ──
 *
 * 2026-08-10, le fondateur : « il doit y avoir systématiquement sur tous nos
 * services un repli fonctionnel — on ne s'arrête jamais de délivrer aux
 * clients. »
 *
 * Le recensement du jour : 34 fichiers appellent Anthropic, 2 ont un repli.
 * `callLlmWithFallback` existe pourtant depuis le 2 juin — quatre modules
 * l'utilisent. Les trente autres appellent `fetch('https://api.anthropic.com…')`
 * en direct et s'arrêtent là. Le crédit épuisé ce jour-là a donc dégradé la
 * majorité du produit d'un coup, sans que rien ne bascule.
 *
 * ── Pourquoi une passerelle plutôt qu'une migration ──
 *
 * Les trente appels n'ont pas la même forme : certains passent des outils,
 * d'autres des images, d'autres du texte simple, et chacun analyse la réponse
 * à sa façon. Les réécrire un par un, c'est trente occasions de casser quelque
 * chose qui marche.
 *
 * Cette fonction prend le MÊME corps de requête et rend la MÊME forme de
 * réponse qu'Anthropic. Le remplacement se fait donc en une ligne par fichier,
 * et le code qui lit la réponse en dessous n'est pas touché. Quand Gemini
 * répond, sa réponse est retraduite dans la forme d'Anthropic : les appelants
 * ne savent pas — et n'ont pas à savoir — quel modèle a répondu.
 *
 * ── Ce qui déclenche le repli ──
 *
 * Ce qui empêche VRAIMENT d'obtenir une réponse : crédit épuisé (la panne du
 * jour, un 400 qui parle de « credit balance »), authentification, limite de
 * débit, surcharge, panne serveur, réseau injoignable. Pas une erreur de notre
 * part : un 400 pour requête malformée doit remonter, pas être masqué par un
 * second fournisseur qui échouera pareil.
 */

import { logApiCost } from '../admin/api-cost-logger';

/** Horodatage jusqu'auquel on n'essaie plus Anthropic. */
let indisponibleJusqua = 0;

/**
 * Coupe-circuit. Quand le crédit est épuisé, l'erreur se répète à l'identique
 * sur chaque appel : sans ce garde-fou, un balayage de 500 posts fait 500
 * aller-retours inutiles avant de basculer à chaque fois.
 */
const REPOS_MS = 10 * 60 * 1000;

export interface ReponseAnthropic {
  content: Array<{ type: string; text?: string; name?: string; input?: any }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  /** Qui a effectivement répondu — pour les journaux, jamais pour la logique. */
  /** 'ark' = DeepSeek, l'étage texte intercalé quand Claude n'est pas là. */
  __fournisseur?: 'anthropic' | 'gemini' | 'ark';
  __motifRepli?: string;
}

function replicable(status: number, corps: string): string | null {
  const bas = String(corps || '').toLowerCase();
  if (bas.includes('credit balance') || bas.includes('insufficient_credit') || bas.includes('billing')) return 'credit_epuise';
  if (status === 401 || status === 403) return `auth_${status}`;
  if (status === 429) return 'limite_debit';
  if (status >= 500) return `panne_${status}`;
  if (bas.includes('overloaded')) return 'surcharge';
  return null;
}

/** Traduit un schéma JSON d'outil Anthropic en schéma de réponse Gemini. */
function versSchemaGemini(schema: any): any {
  const conv = (s: any): any => {
    if (!s || typeof s !== 'object') return s;
    const out: any = {};
    if (s.type) out.type = String(s.type).toUpperCase();
    if (s.description) out.description = s.description;
    if (s.enum) out.enum = s.enum;
    if (s.items) out.items = conv(s.items);
    if (s.properties) {
      out.properties = {};
      for (const [k, v] of Object.entries(s.properties)) out.properties[k] = conv(v);
    }
    if (Array.isArray(s.required)) out.required = s.required;
    return out;
  };
  return conv(schema);
}

/** Traduit les messages Anthropic en `contents` Gemini. */
function versContenusGemini(messages: any[]): any[] {
  return (messages || []).map((m) => {
    const parts: any[] = [];
    const contenu = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }];
    for (const c of contenu) {
      if (c.type === 'text' && c.text) parts.push({ text: c.text });
      else if (c.type === 'image' && c.source?.type === 'base64') {
        parts.push({ inline_data: { mime_type: c.source.media_type, data: c.source.data } });
      }
      // Une image passée par URL n'est pas transmissible à Gemini en l'état ;
      // l'appelant doit fournir du base64 s'il veut le repli sur les images.
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
}

function texteSysteme(system: any): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) return system.map((s: any) => s?.text || '').join('\n');
  return String(system);
}

/**
 * Appelle Anthropic, et Gemini si Anthropic ne peut pas répondre.
 *
 * `corps` est le corps de requête de l'API Anthropic, inchangé. La valeur
 * rendue a la forme d'une réponse Anthropic — `content[]`, `usage` — quel que
 * soit le modèle qui a répondu.
 *
 * Renvoie `null` seulement si AUCUN des deux n'a pu répondre. Jamais une
 * réponse vide déguisée en succès : c'est la confusion qui a laissé passer des
 * images non contrôlées pendant des jours.
 */
export async function appelerModele(
  corps: any,
  options: { etiquette?: string; agent?: string } = {},
): Promise<ReponseAnthropic | null> {
  const etiquette = options.etiquette || 'llm';

  // ── 1. Anthropic ──
  const cleA = process.env.ANTHROPIC_API_KEY;
  if (cleA && Date.now() > indisponibleJusqua) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
      // Cet appel est compté juste en dessous, avec son étiquette et son agent.
      // Sans ce marqueur, le compteur global l'enregistre une SECONDE fois —
      // 62 doublons relevés sur une seule vague le 15 août.
      __keiroDejaCompte: true,
        headers: { 'x-api-key': cleA, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      } as any);
      if (res.ok) {
        const j = await res.json();
        void logApiCost({
          provider: 'anthropic', kind: etiquette, agent: options.agent || 'system',
          units: (j.usage?.input_tokens || 0) + (j.usage?.output_tokens || 0),
          cost_eur: ((j.usage?.input_tokens || 0) * 3 + (j.usage?.output_tokens || 0) * 15) / 1e6 * 0.92,
        });
        return { ...j, __fournisseur: 'anthropic' };
      }
      const texte = await res.text().catch(() => '');
      const motif = replicable(res.status, texte);
      if (!motif) {
        // Erreur de NOTRE côté (requête malformée) : la remonter, pas la
        // masquer derrière un second fournisseur qui échouera pareil.
        console.error(`[modele] ${etiquette} — Anthropic refuse (${res.status}) : ${texte.slice(0, 200)}`);
        return null;
      }
      if (motif === 'credit_epuise') {
        indisponibleJusqua = Date.now() + REPOS_MS;
        console.warn(`[modele] crédit Anthropic épuisé — repli Gemini pendant ${REPOS_MS / 60000} min`);
      } else {
        console.warn(`[modele] ${etiquette} — Anthropic indisponible (${motif}) — repli Gemini`);
      }
    } catch (e: any) {
      console.warn(`[modele] ${etiquette} — Anthropic injoignable (${e?.message}) — repli Gemini`);
    }
  }

  const outil = Array.isArray(corps.tools) && corps.tools.length ? corps.tools[0] : null;

  // ══════════════════════════════════════════════════════════════════════════
  // ── 2. DeepSeek, mais seulement quand la demande est du TEXTE PUR ──
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Ce chemin de repli était le dernier à échapper au basculement : 43 appels
  // en une journée, tous rangés sous « system / llm », tous partis chez Gemini
  // alors qu'ils auraient pu bénéficier du meilleur suivi de consigne.
  //
  // ── L'arbitrage, et ce qui le fonde ──
  //
  // · TEXTE SEUL → DeepSeek. Mesuré sur sept tâches réelles : 14/14 conformes
  //   contre 10/14, à coût inférieur. Les échecs de Gemini sont des refus
  //   d'obéir (trois phrases là où deux sont demandées, une formule bannie),
  //   pas des maladresses.
  //
  // · IMAGE dans la demande → Gemini, sans discussion. DeepSeek v3.2 est
  //   texte seul : il ne verrait rien et noterait au hasard. Et parmi les
  //   modèles de vision de ByteDance, Gemini reste le plus discriminant au
  //   banc (notes de 6 à 10, quand seed-2-0-lite ne descend jamais sous 8) et
  //   cinq fois plus rapide.
  //
  // · JSON IMPOSÉ PAR SCHÉMA → Gemini. Le catalogue du fournisseur est formel
  //   pour deepseek-v3-2 : `structured_outputs: { json_object: false,
  //   json_schema: false }`. Lui confier un verdict au format imposé, c'est
  //   accepter qu'il rende parfois autre chose — et un contrôle qualité dont
  //   la réponse ne se lit pas est pire qu'un contrôle absent.
  //
  // Autrement dit : on ne bascule pas là où le modèle « pourrait passer », on
  // bascule là où il est objectivement meilleur.
  const contientImage = (corps.messages || []).some((m: any) =>
    Array.isArray(m.content) && m.content.some((c: any) => c?.type === 'image'));

  if (!contientImage && !outil) {
    try {
      const { callDeepSeek, deepseekDisponible } = await import('./deepseek');
      if (deepseekDisponible()) {
        const texte = await callDeepSeek({
          system: texteSysteme(corps.system),
          message: (corps.messages || [])
            .map((m: any) => (Array.isArray(m.content)
              ? m.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n')
              : String(m.content ?? '')))
            .join('\n\n'),
          maxTokens: corps.max_tokens || 2000,
        });
        // On rend la forme Anthropic que les appelants savent lire : le repli
        // ne doit rien changer pour eux.
        return { content: [{ type: 'text', text: texte }], __fournisseur: 'ark' };
      }
    } catch (e: any) {
      console.warn(`[modele] ${etiquette} — DeepSeek indisponible (${e?.message?.slice(0, 120)}) — repli Gemini`);
    }
  }

  // ── 3. Gemini ──
  const cleG = process.env.GEMINI_API_KEY;
  if (!cleG) {
    console.error(`[modele] ${etiquette} — aucun modèle disponible`);
    return null;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cleG}`,
      {
        method: 'POST',
      // Cet appel est compté juste en dessous, avec son étiquette et son agent.
      // Sans ce marqueur, le compteur global l'enregistre une SECONDE fois —
      // 62 doublons relevés sur une seule vague le 15 août.
      __keiroDejaCompte: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: texteSysteme(corps.system) ? { parts: [{ text: texteSysteme(corps.system) }] } : undefined,
          contents: versContenusGemini(corps.messages),
          generationConfig: {
            // Gemini 2.5 consomme son budget de sortie en raisonnement interne
            // avant d'écrire : avec une marge serrée il rend une réponse vide,
            // et l'appelant croit à un résultat sans contenu. On coupe le
            // raisonnement et on double la marge.
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: Math.max(1024, (corps.max_tokens || 1024) * 2),
            ...(outil
              ? { responseMimeType: 'application/json', responseSchema: versSchemaGemini(outil.input_schema) }
              : {}),
          },
        }),
      } as any,
    );
    if (!res.ok) {
      console.error(`[modele] ${etiquette} — Gemini refuse aussi (${res.status})`);
      return null;
    }
    const j = await res.json();
    void logApiCost({
      provider: 'gemini', kind: etiquette, agent: options.agent || 'system',
      units: j.usageMetadata?.totalTokenCount || 0,
      cost_eur: ((j.usageMetadata?.promptTokenCount || 0) * 0.3 + (j.usageMetadata?.candidatesTokenCount || 0) * 2.5) / 1e6 * 0.92,
    } as any);

    const txt = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text).filter(Boolean).join('');
    if (!txt) {
      console.error(`[modele] ${etiquette} — Gemini a répondu sans contenu`);
      return null;
    }

    // Retraduction dans la forme d'Anthropic : l'appelant n'a rien à changer.
    const content = outil
      ? [{ type: 'tool_use', name: outil.name, input: JSON.parse(txt) }]
      : [{ type: 'text', text: txt }];

    return {
      content,
      usage: {
        input_tokens: j.usageMetadata?.promptTokenCount || 0,
        output_tokens: j.usageMetadata?.candidatesTokenCount || 0,
      },
      __fournisseur: 'gemini',
      __motifRepli: 'anthropic indisponible',
    };
  } catch (e: any) {
    console.error(`[modele] ${etiquette} — Gemini en échec : ${e?.message}`);
    return null;
  }
}

/**
 * La même passerelle, à la forme d'un `fetch`.
 *
 * ── Pourquoi cette variante ──
 *
 * Les trente appels directs ne se contentent pas d'envoyer une requête : ils
 * lisent `res.ok`, appellent `await res.json()`, testent `res.status`. Passer
 * par `appelerModele` demanderait de réécrire ce code de lecture partout —
 * trente occasions de casser quelque chose qui fonctionne.
 *
 * En rendant un objet `Response`, la migration devient le remplacement d'un
 * seul mot :
 *
 *     fetch('https://api.anthropic.com/v1/messages', { ... })
 *     fetchModele({ ... })
 *
 * Tout le code qui suit reste identique, et il reçoit une réponse à la forme
 * d'Anthropic que Claude ait répondu ou que Gemini ait pris le relais.
 *
 * En cas d'échec des deux, on rend une réponse 503 explicite plutôt qu'un
 * contenu vide : l'appelant garde son test `if (!res.ok)` et son comportement
 * de repli propre.
 */
export async function fetchModele(
  init: { method?: string; headers?: any; body?: any } | any,
  options: { etiquette?: string; agent?: string } = {},
): Promise<Response> {
  let corps: any;
  try {
    corps = typeof init?.body === 'string' ? JSON.parse(init.body) : (init?.body ?? init);
  } catch {
    corps = init;
  }

  const r = await appelerModele(corps, options);
  if (!r) {
    return new Response(
      JSON.stringify({ error: { type: 'modele_indisponible', message: 'aucun modèle de langage disponible' } }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }
  return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
}
