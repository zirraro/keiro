/**
 * Hybrid Intelligence System — 3-tier learning with cross-agent feedback
 *
 * TIER 1: SIGNAL (7 days) — ephemeral observations, auto-expire if not confirmed
 *   → "Open rate restaurants bas aujourd'hui"
 *   → Disappears after 7 days unless promoted
 *
 * TIER 2: PATTERN (90 days) — confirmed recurring insights, needs 3+ evidence points
 *   → "Restaurants ouvrent mieux le mardi matin"
 *   → Survives longer, requires repeated confirmation
 *
 * TIER 3: INSIGHT (permanent) — validated gold, never expires
 *   → "Les DMs vidéo personnalisés convertissent 4x plus"
 *   → Promoted by CEO validation OR real conversion/revenue event
 *   → Rare exceptions that generate CA live here forever
 *
 * PROMOTION RULES:
 * - Signal → Pattern: 3+ confirmations OR confidence >= 60
 * - Pattern → Insight: CEO validates OR linked to real conversion event
 * - Revenue event (reply, demo, client) → auto-promote to Insight
 *
 * CROSS-AGENT FEEDBACK:
 * - Any agent can write feedback to another agent
 * - Feedbacks are suggestions, not orders (only CEO writes orders)
 * - Agents read feedbacks from others in their prompt context
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type LearningCategory = 'email' | 'dm' | 'content' | 'prospection' | 'conversion' | 'general' | 'community' | 'retention' | 'seo';
export type LearningTier = 'signal' | 'pattern' | 'insight';

export interface AgentLearning {
  id?: string;
  agent: string;
  category: LearningCategory;
  learning: string;
  evidence: string;
  confidence: number; // 0-100
  tier: LearningTier;
  confirmations: number;
  revenue_linked: boolean; // true if linked to actual conversion/sale
  created_at?: string;
  expires_at: string | null; // null = permanent (insight)
}

export interface AgentFeedback {
  id?: string;
  from_agent: string;
  to_agent: string;
  feedback: string;
  category: LearningCategory;
  created_at?: string;
}

// ── Tier expiration defaults ──
// Signal 30j: survit un cycle commercial complet (2-4 semaines B2B local)
// Pattern 180j: survit aux variations saisonnières (été/hiver, fêtes)
// Insight: permanent — validé par du CA réel, jamais expiré
const TIER_EXPIRY_DAYS: Record<LearningTier, number | null> = {
  signal: 30,
  pattern: 180,
  insight: null, // permanent
};

/**
 * Save a learning with automatic tier detection and promotion.
 */
export async function saveLearning(
  supabase: SupabaseClient,
  learning: {
    agent: string;
    category: LearningCategory;
    learning: string;
    evidence: string;
    confidence: number;
    tier?: LearningTier;
    revenue_linked?: boolean;
  },
): Promise<void> {
  const tier = learning.tier || (learning.revenue_linked ? 'insight' : 'signal');
  const expiryDays = TIER_EXPIRY_DAYS[tier];
  const expires_at = expiryDays ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null;

  // Check for existing similar learning to boost
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
    const currentData = similar.data || {};
    const currentConfidence = currentData.confidence || 50;
    const currentConfirmations = (currentData.confirmations || 1) + 1;
    const currentTier: LearningTier = currentData.tier || 'signal';

    // Calculate new confidence (diminishing returns)
    const boost = Math.max(5, 15 - currentConfirmations);
    const newConfidence = Math.min(98, currentConfidence + boost);

    // Auto-promote tier based on confirmations and confidence
    let newTier = currentTier;
    if (currentTier === 'signal' && (currentConfirmations >= 3 || newConfidence >= 60)) {
      newTier = 'pattern';
    }
    if (learning.revenue_linked || currentData.revenue_linked) {
      newTier = 'insight'; // Revenue events always promote to insight
    }

    // Recalculate expiry based on new tier
    const newExpiryDays = TIER_EXPIRY_DAYS[newTier];
    const newExpiry = newExpiryDays ? new Date(Date.now() + newExpiryDays * 86400000).toISOString() : null;

    await supabase
      .from('agent_logs')
      .update({
        data: {
          ...currentData,
          confidence: newConfidence,
          confirmations: currentConfirmations,
          tier: newTier,
          revenue_linked: currentData.revenue_linked || learning.revenue_linked || false,
          evidence: `${currentData.evidence || ''} | ${learning.evidence}`.substring(0, 500),
          expires_at: newExpiry,
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
      tier,
      confirmations: 1,
      revenue_linked: learning.revenue_linked || false,
      expires_at,
    },
    created_at: new Date().toISOString(),
  });
}

/**
 * Promote a learning to insight tier (called by CEO or on conversion event).
 */
export async function promoteToInsight(
  supabase: SupabaseClient,
  learningId: string,
  reason: string,
): Promise<void> {
  const { data } = await supabase
    .from('agent_logs')
    .select('data')
    .eq('id', learningId)
    .single();

  if (data?.data) {
    await supabase.from('agent_logs').update({
      data: {
        ...data.data,
        tier: 'insight',
        expires_at: null,
        revenue_linked: true,
        confidence: Math.max(data.data.confidence || 80, 80),
        promotion_reason: reason,
        promoted_at: new Date().toISOString(),
      },
    }).eq('id', learningId);
  }
}

/**
 * Get active learnings for an agent, sorted by tier then confidence.
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
    .limit(50);

  if (category) {
    query = query.eq('target', category);
  }

  const { data } = await query;

  return (data || [])
    .filter((log: any) => {
      const expiresAt = log.data?.expires_at;
      return !expiresAt || expiresAt > now; // null expires_at = permanent insight
    })
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      learning: log.data?.learning || '',
      evidence: log.data?.evidence || '',
      confidence: log.data?.confidence || 50,
      tier: log.data?.tier || 'signal',
      confirmations: log.data?.confirmations || 1,
      revenue_linked: log.data?.revenue_linked || false,
      created_at: log.created_at,
      expires_at: log.data?.expires_at || null,
    }))
    .sort((a: AgentLearning, b: AgentLearning) => {
      // Sort: insight > pattern > signal, then by confidence
      const tierOrder: Record<LearningTier, number> = { insight: 3, pattern: 2, signal: 1 };
      const tierDiff = (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0);
      return tierDiff !== 0 ? tierDiff : b.confidence - a.confidence;
    });
}

/**
 * Get ALL agents' active learnings for cross-pollination.
 * Only returns patterns and insights (signals are too noisy for cross-agent).
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
    .limit(50);

  if (excludeAgent) {
    query = query.neq('agent', excludeAgent);
  }

  const { data } = await query;

  return (data || [])
    .filter((log: any) => {
      const expiresAt = log.data?.expires_at;
      const tier = log.data?.tier || 'signal';
      // Cross-agent: only share patterns and insights (not noisy signals)
      return (tier === 'pattern' || tier === 'insight') &&
        (!expiresAt || expiresAt > now);
    })
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      learning: log.data?.learning || '',
      evidence: log.data?.evidence || '',
      confidence: log.data?.confidence || 50,
      tier: log.data?.tier || 'signal',
      confirmations: log.data?.confirmations || 1,
      revenue_linked: log.data?.revenue_linked || false,
      created_at: log.created_at,
      expires_at: log.data?.expires_at || null,
    }))
    .sort((a: AgentLearning, b: AgentLearning) => {
      const tierOrder: Record<LearningTier, number> = { insight: 3, pattern: 2, signal: 1 };
      const tierDiff = (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0);
      return tierDiff !== 0 ? tierDiff : b.confidence - a.confidence;
    });
}

/**
 * Save cross-agent feedback (suggestion, not order).
 * Only CEO writes orders. Agents write feedbacks to help each other improve.
 */
export async function saveAgentFeedback(
  supabase: SupabaseClient,
  feedback: {
    from_agent: string;
    to_agent: string;
    feedback: string;
    category: LearningCategory;
  },
): Promise<void> {
  await supabase.from('agent_logs').insert({
    agent: feedback.to_agent,
    action: 'agent_feedback',
    status: 'ok',
    target: feedback.from_agent,
    data: {
      from_agent: feedback.from_agent,
      feedback: feedback.feedback,
      category: feedback.category,
    },
    created_at: new Date().toISOString(),
  });
}

/**
 * Get recent feedbacks from other agents.
 */
export async function getAgentFeedbacks(
  supabase: SupabaseClient,
  agentName: string,
  limit: number = 10,
): Promise<AgentFeedback[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data } = await supabase
    .from('agent_logs')
    .select('id, data, created_at')
    .eq('agent', agentName)
    .eq('action', 'agent_feedback')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map((log: any) => ({
    id: log.id,
    from_agent: log.data?.from_agent || 'unknown',
    to_agent: agentName,
    feedback: log.data?.feedback || '',
    category: log.data?.category || 'general',
    created_at: log.created_at,
  }));
}

/**
 * Format learnings for prompt injection — 3-tier hierarchy.
 */
export function formatLearningsForPrompt(
  ownLearnings: AgentLearning[],
  otherLearnings: AgentLearning[],
  feedbacks?: AgentFeedback[],
): string {
  if (ownLearnings.length === 0 && otherLearnings.length === 0 && (!feedbacks || feedbacks.length === 0)) return '';

  let text = '';

  // INSIGHTS — permanent gold, always apply
  const insights = ownLearnings.filter(l => l.tier === 'insight');
  if (insights.length > 0) {
    text += `\n\n💎 INSIGHTS VALIDÉS (permanents, applique TOUJOURS) :`;
    for (const l of insights) {
      text += `\n- [${l.category}] ${l.learning} (confiance: ${l.confidence}%${l.revenue_linked ? ', lié au CA' : ''})`;
    }
  }

  // PATTERNS — confirmed, apply with confidence
  const patterns = ownLearnings.filter(l => l.tier === 'pattern');
  if (patterns.length > 0) {
    text += `\n\n🎯 PATTERNS CONFIRMÉS (${patterns.length}x confirmés, applique systématiquement) :`;
    for (const l of patterns) {
      text += `\n- [${l.category}] ${l.learning} (confiance: ${l.confidence}%, ${l.confirmations} confirmations)`;
    }
  }

  // SIGNALS — recent observations, test/explore
  const signals = ownLearnings.filter(l => l.tier === 'signal');
  if (signals.length > 0) {
    text += `\n\n📡 SIGNAUX RÉCENTS (à tester/confirmer) :`;
    for (const l of signals.slice(0, 8)) {
      text += `\n- [${l.category}] ${l.learning} (confiance: ${l.confidence}%)`;
    }
  }

  // Cross-agent learnings (only patterns + insights)
  if (otherLearnings.length > 0) {
    text += `\n\n🔄 INTELLIGENCE DES AUTRES AGENTS :`;
    for (const l of otherLearnings.slice(0, 10)) {
      const tierIcon = l.tier === 'insight' ? '💎' : '🎯';
      text += `\n- ${tierIcon} [${l.agent}/${l.category}] ${l.learning} (confiance: ${l.confidence}%)`;
    }
  }

  // Feedbacks from other agents
  if (feedbacks && feedbacks.length > 0) {
    text += `\n\n💬 FEEDBACKS DES AUTRES AGENTS (conseils, pas des ordres) :`;
    for (const f of feedbacks.slice(0, 5)) {
      text += `\n- [${f.from_agent} → toi] ${f.feedback}`;
    }
  }

  return text;
}

/**
 * Helper to create expiration date by tier.
 */
export function learningExpiresIn(days?: number, tier?: LearningTier): string | null {
  if (tier === 'insight') return null; // permanent
  const d = days ?? TIER_EXPIRY_DAYS[tier || 'signal'] ?? 7;
  return new Date(Date.now() + d * 86400000).toISOString();
}
