/**
 * Knowledge applier — quand un agent tourne pour un client, on consulte
 * le pool agent_knowledge pour récupérer les patterns/résolutions
 * applicables AVANT l'exécution. Cela ferme la boucle entre supervision
 * et exécution : un problème résolu pour un client se traduit en garde
 * automatique pour TOUS les clients similaires.
 *
 * Fonction principale : applicableKnowledge(supabase, agent, client_id)
 *   → renvoie la liste des knowledge rows à injecter dans le prompt /
 *     respecter dans la logique d'exécution. Filtré par business_type
 *     du client + global, ordonné par confidence DESC.
 *
 * Le caller est responsable de :
 *   - rendre les apprentissages disponibles dans son prompt (LLM-driven)
 *   - OU implémenter les checks bloquants déterministes (code-driven)
 *   - incrémenter usage_count quand un apprentissage a été consulté
 *
 * Founder rule 2026-06-09 : "si ca arrive a client ca n'arrive pas a un
 * autre ou ca soit regler en auto". Cette fonction = pilier de la
 * mutualisation effective (audit → knowledge → tous les clients).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AppliedKnowledge {
  id: string;
  category: string;
  summary: string;
  content: string;
  confidence: number;
  business_type: string | null;
  source: string;
  usage_count: number;
}

/**
 * Returns knowledge rows the agent should respect for THIS client.
 * Combines global learnings + learnings scoped to the client's
 * business_type. Excludes low-confidence patterns by default.
 */
export async function applicableKnowledge(
  supabase: SupabaseClient,
  agent: string,
  clientUserId: string,
  opts: { minConfidence?: number; categories?: string[]; limit?: number } = {},
): Promise<AppliedKnowledge[]> {
  const minConfidence = opts.minConfidence ?? 0.5;
  const limit = opts.limit ?? 20;

  // 1. Resolve client business_type
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_type')
    .eq('id', clientUserId)
    .maybeSingle();
  const businessType = (profile as any)?.business_type || null;

  // 2. Fetch knowledge: agent-scoped, business_type ∈ {client's bt, 'global', null}
  const scopes = ['global'];
  if (businessType) scopes.push(businessType);

  let q = supabase
    .from('agent_knowledge')
    .select('id, category, summary, content, confidence, business_type, source, usage_count')
    .eq('agent', agent)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })
    .order('usage_count', { ascending: false })
    .limit(limit);

  if (opts.categories && opts.categories.length > 0) {
    q = q.in('category', opts.categories);
  }

  const { data } = await q;
  if (!data) return [];

  // Filter to relevant scopes (global + client's bt) + null bt
  const relevant = data.filter((k: any) => k.business_type === null || scopes.includes(k.business_type));

  return relevant as AppliedKnowledge[];
}

/**
 * Increments usage_count + last_used_at when a knowledge entry has been
 * consulted. Best-effort, fire-and-forget.
 */
export async function recordKnowledgeUsage(
  supabase: SupabaseClient,
  knowledgeIds: string[],
): Promise<void> {
  if (!knowledgeIds.length) return;
  try {
    // Bump usage_count via raw SQL since Supabase doesn't expose increment ops.
    // Best-effort — failures don't block the agent.
    for (const id of knowledgeIds) {
      await supabase.rpc('increment_knowledge_usage', { knowledge_id: id }).then(() => {}, () => {});
    }
  } catch { /* swallow */ }
}

/**
 * Renders a prompt block for LLM-driven agents to inject the
 * mutualised learnings into their system message.
 */
export function knowledgeAsPromptBlock(rows: AppliedKnowledge[]): string {
  if (rows.length === 0) return '';
  const lines = rows.map((r, i) => `${i + 1}. [${r.category}${r.business_type ? `·${r.business_type}` : ''}] ${r.summary}${r.content ? `\n   → ${r.content.substring(0, 280)}` : ''}`);
  return `\n## SAVOIR MUTUALISÉ (issu d'audits superviseur)\n\nApplique les règles suivantes — elles ont été extraites de problèmes résolus chez d'autres clients du même type business :\n\n${lines.join('\n\n')}\n`;
}
