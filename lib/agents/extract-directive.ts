/**
 * Chat → strategy directive extractor.
 *
 * When a client gives Léna (or any agent) instructions in chat
 * ("don't use red overlays", "always show people, not products"),
 * we want those to PERSIST and shape every future generation —
 * not just answer the immediate question.
 *
 * This module asks Sonnet to extract from a single user message
 * any DURABLE strategy directive that should be remembered. The
 * extracted directive is appended to:
 *   1. org_agent_configs.config.{agent}_directives  (per-client)
 *   2. global_agent_directives table tagged by business_type
 *      (cross-client knowledge — similar businesses benefit)
 *
 * Sonnet returns null when the message is just a question, an
 * acknowledgement, or short-term action ("publish now") — only
 * persistent strategy / quality / brand-direction inputs survive.
 */

import { fetchModele } from './anthropic-avec-repli';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ExtractedDirective = {
  text: string;          // the rule to persist (1-2 sentences)
  scope: 'this_client' | 'business_type';   // who should benefit
  /**
   * Permanente ou temporaire.
   *
   * Une règle temporaire posée comme permanente déforme le contenu pendant des
   * mois sans que personne ne sache pourquoi. C'est le genre de défaut qu'on ne
   * retrouve jamais, parce qu'il ressemble à une préférence assumée.
   */
  portee?: 'permanente' | 'temporaire';
  /** Date de fin d'une règle temporaire. Null quand elle est permanente. */
  valable_jusqu_au?: string | null;
  /**
   * Vrai quand la règle est temporaire mais que le client n'a pas dit jusqu'à
   * quand. On lui pose alors la question dans la réponse du chat, au lieu de
   * choisir une durée à sa place — une échéance devinée est une échéance fausse,
   * et il ne saura jamais qu'elle existe.
   */
  echeance_a_confirmer?: boolean;
  category: 'visual' | 'tone' | 'audience' | 'frequency' | 'platform' | 'overlay' | 'other';
};

/**
 * Ask Sonnet whether the message contains a persistent directive
 * worth remembering, and what it is. Returns null if not.
 */
export async function extractDirective(input: {
  agentId: string;
  message: string;
  businessType?: string;
  language?: 'fr' | 'en';
}): Promise<ExtractedDirective | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!input.message || input.message.trim().length < 10) return null;
  const lang = input.language || 'fr';

  const system = `You analyse a single message a user sent to their AI marketing agent (${input.agentId}).
Your single job: extract any DURABLE strategy directive that should permanently shape how this agent works for them.

YES — extract when the user is teaching the agent a rule:
- "Don't use red overlays — clashes with our brand"
- "Always show people in posts, not products alone"
- "Stop publishing on Sundays"
- "We're a B2B SaaS — no lifestyle posts"
- "Mention the lien-en-bio CTA on every IG post"
- "No more case studies with fake numbers"

NO — do NOT extract when the user is:
- Asking a question
- Asking for an immediate action ("publish this", "make a post about X")
- Just acknowledging or thanking
- Sharing news that doesn't translate to a rule
- Vague ("make it better")

OUTPUT — STRICT JSON:
{
  "extracted": true,
  "text": "<the rule rephrased as a clear durable instruction in ${lang === 'fr' ? 'French' : 'English'}, 1-2 sentences>",
  "scope": "this_client" | "business_type",
  "category": "visual" | "tone" | "audience" | "frequency" | "platform" | "overlay" | "other",
  "portee": "permanente" | "temporaire",
  "valable_jusqu_au": "AAAA-MM-JJ ou null"
}
OR if nothing to extract:
{ "extracted": false }

PORTÉE — LA DISTINCTION LA PLUS IMPORTANTE.
Le fondateur, 2026-08-14 : « bien faire la distinction entre il demande quelque
chose de permanent et de temporaire. »

Confondre les deux fait des dégâts dans les deux sens. Graver « mets une photo
de mon équipe » comme règle permanente parce que le client l'a dit une fois,
c'est lui imposer pour des mois ce qu'il voulait une semaine. À l'inverse,
traiter « ne montre jamais mon visage » comme une lubie passagère, c'est le
trahir au troisième post.

· "permanente" — la règle décrit comment travailler POUR TOUJOURS. Marqueurs :
  « toujours », « jamais », « à partir de maintenant », « je ne veux plus »,
  « en général », ou une préférence de fond sans échéance.
· "temporaire" — la demande vaut pour une période ou une occasion. Marqueurs :
  « cette semaine », « pour ce post », « jusqu'à dimanche », « pendant les
  travaux », « en août », « le temps que ».

Dans le doute, choisis "temporaire" : une règle temporaire qui aurait dû être
permanente se redemande en une phrase ; une règle permanente posée par erreur
se découvre des semaines plus tard, après avoir déformé tout le contenu.

"valable_jusqu_au" : la date de fin quand elle est calculable depuis
aujourd'hui (2026-08-14). Sinon null — et la règle
temporaire vaudra trente jours par défaut.

scope = "business_type" only when the rule is general enough that ALL clients of the same business type would benefit (e.g. "restaurants should always show plate composition with real ingredients"). Default to "this_client".

JSON only. No preamble.`;

  try {
    const res = await fetchModele({
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: `Agent: ${input.agentId}\nBusiness type: ${input.businessType || 'unknown'}\n\nMessage:\n"${input.message.slice(0, 600)}"\n\nExtract.` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = (data.content?.[0]?.text || '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (!parsed.extracted || typeof parsed.text !== 'string' || parsed.text.length < 10) return null;
    return {
      text: parsed.text.slice(0, 280),
      scope: parsed.scope === 'business_type' ? 'business_type' : 'this_client',
      portee: parsed.portee === 'permanente' ? 'permanente' : 'temporaire',
      // Le client a-t-il DIT jusqu à quand ? Si non, on le lui demandera plutôt
      // que de deviner. Fondateur, 2026-08-14 : « demande aussi dans le chat si
      // c est temporaire, la temporalité, et inscris-la ainsi. »
      echeance_a_confirmer: parsed.portee !== 'permanente'
        && !/^d{4}-d{2}-d{2}$/.test(String(parsed.valable_jusqu_au || '')),
      valable_jusqu_au: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.valable_jusqu_au || ''))
        ? parsed.valable_jusqu_au
        : (parsed.portee === 'permanente'
            ? null
            // Sans échéance dite, une demande temporaire vaut un mois : assez
            // pour couvrir « cette semaine » ou « pendant les travaux », assez
            // court pour ne pas devenir une règle par oubli.
            : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
      category: ['visual', 'tone', 'audience', 'frequency', 'platform', 'overlay', 'other'].includes(parsed.category)
        ? parsed.category
        : 'other',
    };
  } catch {
    return null;
  }
}

/**
 * Persist the directive into per-client config + (when scope is
 * business_type) into the global pool. Idempotent — won't add a
 * directive that's already in the list.
 */
export async function persistDirective(
  supabase: SupabaseClient,
  input: {
    userId: string;
    agentId: string;
    directive: ExtractedDirective;
    businessType?: string;
    orgId?: string | null;
  },
): Promise<void> {
  const directiveKey = `${input.agentId}_directives`;

  // 1. Per-client: append to org_agent_configs.config.<agent>_directives
  try {
    const { data: cfg } = await supabase
      .from('org_agent_configs')
      .select('id, config')
      .eq('user_id', input.userId)
      .eq('agent_id', input.agentId)
      .maybeSingle();
    const existing: string[] = (cfg?.config as any)?.[directiveKey] || [];
    if (!existing.includes(input.directive.text)) {
      const next = [...existing, input.directive.text].slice(-30);   // cap at 30

      // ── L échéance vit à côté, pour ne pas casser les lecteurs ──
      //
      // Les directives sont une simple liste de textes, lue par plusieurs
      // agents. Y glisser une date changerait ce que voit le modèle et
      // demanderait de toucher chaque lecteur. On garde donc la liste intacte
      // et on note les échéances dans une table à côté, indexée par le texte.
      //
      // Un lecteur qui ignore cette table se comporte comme avant : la règle
      // temporaire reste appliquée. Un lecteur à jour l écarte à l échéance.
      // Aucune régression possible, l amélioration est progressive.
      const cleEcheances = `${input.agentId}_directives_echeance`;
      const echeances = { ...(((cfg?.config as any) || {})[cleEcheances] || {}) };
      if (input.directive.portee === 'temporaire' && input.directive.valable_jusqu_au) {
        echeances[input.directive.text] = input.directive.valable_jusqu_au;
      }

      const newConfig = {
        ...((cfg?.config as any) || {}),
        [directiveKey]: next,
        [cleEcheances]: echeances,
      };
      if (cfg?.id) {
        await supabase
          .from('org_agent_configs')
          .update({ config: newConfig })
          .eq('id', cfg.id);
      } else {
        await supabase
          .from('org_agent_configs')
          .insert({
            user_id: input.userId,
            agent_id: input.agentId,
            config: newConfig,
            ...(input.orgId ? { org_id: input.orgId } : {}),
          });
      }
    }
  } catch (e: any) {
    console.warn('[extract-directive] per-client persist failed:', e?.message);
  }

  // 2. Cross-client: when scope is business_type, store in
  // global_agent_directives table tagged by business_type for similar
  // clients to read at generation time.
  if (input.directive.scope === 'business_type' && input.businessType) {
    try {
      // Idempotent: skip if same text already present for this
      // business_type + agent.
      const { data: existing } = await supabase
        .from('global_agent_directives')
        .select('id')
        .eq('agent_id', input.agentId)
        .eq('business_type', input.businessType)
        .eq('directive', input.directive.text)
        .limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from('global_agent_directives').insert({
          agent_id: input.agentId,
          business_type: input.businessType,
          directive: input.directive.text,
          category: input.directive.category,
          source_user_id: input.userId,
          confidence: 60,
          created_at: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      // Table may not exist yet — log but don't block.
      console.warn('[extract-directive] global persist (table may need migration):', e?.message);
    }
  }
}
