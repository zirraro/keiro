/**
 * Structured agent learning system with confidence and expiration.
 *
 * Learnings are stored in agent_logs with action='learning' and structured data.
 * Each learning has:
 * - A category (email, dm, content, prospection, conversion, general)
 * - A confidence score (0-100) that increases when evidence confirms it
 * - An expiration date (default 30 days) so stale learnings get pruned
 * - Evidence: what data supports this learning
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type LearningCategory = 'email' | 'dm' | 'content' | 'prospection' | 'conversion' | 'general';

export interface AgentLearning {
  id?: string;
  agent: string;
  category: LearningCategory;
  learning: string;
  evidence: string;
  confidence: number; // 0-100
  created_at?: string;
  expires_at: string;
}

/**
 * Save a new learning or update existing one if similar learning exists.
 * If a similar learning already exists (same agent + category + similar text),
 * boost its confidence instead of creating a duplicate.
 */
export async function saveLearning(
  supabase: SupabaseClient,
  learning: Omit<AgentLearning, 'id' | 'created_at'>,
): Promise<void> {
  // Check for existing similar learning to boost confidence
  const { data: existing } = await supabase
    .from('agent_logs')
    .select('id, data')
    .eq('agent', learning.agent)
    .eq('action', 'learning')
    .order('created_at', { ascending: false })
    .limit(50);

  const similar = (existing || []).find((log: any) => {
    const d = log.data;
    return d?.category === learning.category &&
      d?.learning && learning.learning &&
      (d.learning.includes(learning.learning.substring(0, 30)) ||
       learning.learning.includes(d.learning?.substring(0, 30)));
  });

  if (similar) {
    // Boost confidence of existing learning (cap at 95)
    const currentConfidence = similar.data?.confidence || 50;
    const newConfidence = Math.min(95, currentConfidence + 10);
    await supabase
      .from('agent_logs')
      .update({
        data: {
          ...similar.data,
          confidence: newConfidence,
          evidence: `${similar.data?.evidence || ''} | ${learning.evidence}`,
          expires_at: learning.expires_at,
          updated_at: new Date().toISOString(),
        },
      })
      .eq('id', similar.id);
    return;
  }

  // Create new learning
  await supabase.from('agent_logs').insert({
    agent: learning.agent,
    action: 'learning',
    status: 'ok',
    target: learning.category,
    data: {
      learning: learning.learning,
      evidence: learning.evidence,
      confidence: learning.confidence,
      category: learning.category,
      expires_at: learning.expires_at,
    },
    created_at: new Date().toISOString(),
  });
}

/**
 * Get active (non-expired) learnings for an agent, sorted by confidence.
 */
export async function getActiveLearnings(
  supabase: SupabaseClient,
  agentName: string,
  category?: LearningCategory,
): Promise<AgentLearning[]> {
  const now = new Date().toISOString();

  let query = supabase
    .from('agent_logs')
    .select('id, agent, data, created_at')
    .eq('agent', agentName)
    .eq('action', 'learning')
    .order('created_at', { ascending: false })
    .limit(30);

  if (category) {
    query = query.eq('target', category);
  }

  const { data } = await query;

  return (data || [])
    .filter((log: any) => {
      const expiresAt = log.data?.expires_at;
      return !expiresAt || expiresAt > now;
    })
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      learning: log.data?.learning || '',
      evidence: log.data?.evidence || '',
      confidence: log.data?.confidence || 50,
      created_at: log.created_at,
      expires_at: log.data?.expires_at || '',
    }))
    .sort((a: AgentLearning, b: AgentLearning) => b.confidence - a.confidence);
}

/**
 * Get ALL agents' active learnings for cross-pollination.
 */
export async function getAllAgentLearnings(
  supabase: SupabaseClient,
  excludeAgent?: string,
): Promise<AgentLearning[]> {
  const now = new Date().toISOString();

  let query = supabase
    .from('agent_logs')
    .select('id, agent, data, created_at')
    .eq('action', 'learning')
    .order('created_at', { ascending: false })
    .limit(30);

  if (excludeAgent) {
    query = query.neq('agent', excludeAgent);
  }

  const { data } = await query;

  return (data || [])
    .filter((log: any) => {
      const expiresAt = log.data?.expires_at;
      const confidence = log.data?.confidence || 0;
      return (!expiresAt || expiresAt > now) && confidence >= 40;
    })
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      learning: log.data?.learning || '',
      evidence: log.data?.evidence || '',
      confidence: log.data?.confidence || 50,
      created_at: log.created_at,
      expires_at: log.data?.expires_at || '',
    }))
    .sort((a: AgentLearning, b: AgentLearning) => b.confidence - a.confidence);
}

/**
 * Format learnings for prompt injection.
 * High confidence learnings are marked as "validated directives".
 */
export function formatLearningsForPrompt(
  ownLearnings: AgentLearning[],
  otherLearnings: AgentLearning[],
): string {
  if (ownLearnings.length === 0 && otherLearnings.length === 0) return '';

  let text = '';

  // Validated directives (confidence >= 70)
  const validated = ownLearnings.filter(l => l.confidence >= 70);
  if (validated.length > 0) {
    text += `\n\n🎯 DIRECTIVES VALIDÉES (confiance élevée, applique systématiquement) :`;
    for (const l of validated) {
      text += `\n- [${l.category}] ${l.learning} (confiance: ${l.confidence}%, preuve: ${l.evidence.substring(0, 100)})`;
    }
  }

  // Hypotheses (confidence 40-69)
  const hypotheses = ownLearnings.filter(l => l.confidence >= 40 && l.confidence < 70);
  if (hypotheses.length > 0) {
    text += `\n\n📊 HYPOTHÈSES EN COURS (à tester/confirmer) :`;
    for (const l of hypotheses) {
      text += `\n- [${l.category}] ${l.learning} (confiance: ${l.confidence}%)`;
    }
  }

  // Cross-agent learnings
  if (otherLearnings.length > 0) {
    text += `\n\n🔄 APPRENTISSAGES DES AUTRES AGENTS :`;
    for (const l of otherLearnings.slice(0, 10)) {
      text += `\n- [${l.agent}/${l.category}] ${l.learning} (confiance: ${l.confidence}%)`;
    }
  }

  return text;
}

/**
 * Helper to create expiration date (default 30 days from now).
 */
export function learningExpiresIn(days: number = 30): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
