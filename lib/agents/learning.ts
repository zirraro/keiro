/**
 * Elite Hybrid Intelligence System — Continuous Score + 5 Lifecycle Phases
 *
 * SCORE CONTINU 0-100 (granularité fine, pas de buckets rigides)
 * Le score détermine automatiquement la phase de vie :
 *
 * PHASE 1: NOISE (0-19) — 7 jours
 *   → Bruit de fond, observations non confirmées
 *   → Disparaît vite si pas confirmé
 *   → Jamais partagé cross-agent
 *
 * PHASE 2: SIGNAL (20-39) — 30 jours
 *   → Observation intéressante, à surveiller
 *   → Commence à influencer les décisions mineures
 *   → Jamais partagé cross-agent
 *
 * PHASE 3: PATTERN (40-64) — 90 jours
 *   → Tendance confirmée par plusieurs observations
 *   → Appliqué avec prudence, partagé entre agents similaires
 *   → Influence les stratégies
 *
 * PHASE 4: RULE (65-84) — 180 jours
 *   → Règle fiable, confirmée par résultats concrets
 *   → Appliqué systématiquement, partagé à tous les agents
 *   → Visible dans les briefs CEO
 *
 * PHASE 5: INSIGHT (85-100) — Permanent
 *   → Or validé, lié au CA réel
 *   → Jamais expiré, appliqué TOUJOURS
 *   → Fondation de la stratégie globale
 *
 * SCORING RULES:
 * - Nouvelle observation: commence à confidence initiale (10-30 selon source)
 * - Chaque confirmation: +boost (diminishing returns)
 * - Revenue event (reply, demo, client): +30 boost
 * - CEO validation: set to min 85
 * - Contradiction/échec: -15 (peut rétrograder)
 * - Phase = f(score), pas besoin de promotion manuelle
 *
 * CROSS-AGENT:
 * - Pattern+ (score >= 40) partagé entre agents similaires
 * - Rule+ (score >= 65) partagé à tous
 * - Feedbacks = suggestions inter-agents (pas des ordres)
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type LearningCategory = 'email' | 'dm' | 'content' | 'prospection' | 'conversion' | 'general' | 'community' | 'retention' | 'seo';
export type LearningPhase = 'noise' | 'signal' | 'pattern' | 'rule' | 'insight';

// Backward compat — old code may reference LearningTier
export type LearningTier = LearningPhase;

export interface AgentLearning {
  id?: string;
  agent: string;
  category: LearningCategory;
  learning: string;
  evidence: string;
  confidence: number; // 0-100 continuous score
  tier: LearningPhase; // auto-derived from confidence
  confirmations: number;
  contradictions: number; // times this was contradicted
  revenue_linked: boolean;
  last_confirmed_at?: string;
  created_at?: string;
  expires_at: string | null;
}

export interface AgentFeedback {
  id?: string;
  from_agent: string;
  to_agent: string;
  feedback: string;
  category: LearningCategory;
  created_at?: string;
}

// ── Phase thresholds and expiration ──
const PHASE_CONFIG: Record<LearningPhase, { min: number; max: number; expiryDays: number | null }> = {
  noise:   { min: 0,  max: 19, expiryDays: 7 },
  signal:  { min: 20, max: 39, expiryDays: 30 },
  pattern: { min: 40, max: 64, expiryDays: 90 },
  rule:    { min: 65, max: 84, expiryDays: 180 },
  insight: { min: 85, max: 100, expiryDays: null }, // permanent
};

/**
 * Derive phase from continuous confidence score.
 */
export function scoreToPhase(confidence: number): LearningPhase {
  if (confidence >= 85) return 'insight';
  if (confidence >= 65) return 'rule';
  if (confidence >= 40) return 'pattern';
  if (confidence >= 20) return 'signal';
  return 'noise';
}

/**
 * Calculate expiry date based on confidence score.
 */
function expiryFromScore(confidence: number): string | null {
  const phase = scoreToPhase(confidence);
  const days = PHASE_CONFIG[phase].expiryDays;
  return days ? new Date(Date.now() + days * 86400000).toISOString() : null;
}

/**
 * Calculate confirmation boost (diminishing returns).
 * Early confirmations boost more, later ones less.
 */
function confirmationBoost(currentConfirmations: number): number {
  // 1st: +12, 2nd: +10, 3rd: +8, ... min +3
  return Math.max(3, 14 - currentConfirmations * 2);
}

/**
 * Save a learning with automatic phase detection via continuous scoring.
 */
export async function saveLearning(
  supabase: SupabaseClient,
  learning: {
    agent: string;
    category: LearningCategory;
    learning: string;
    evidence: string;
    confidence: number; // initial score (10-30 typically)
    tier?: LearningPhase; // optional override
    revenue_linked?: boolean;
  },
): Promise<void> {
  // Revenue events get massive boost
  let initialScore = learning.confidence;
  if (learning.revenue_linked) {
    initialScore = Math.max(initialScore, 85); // Direct to insight
  }
  if (learning.tier === 'insight') {
    initialScore = Math.max(initialScore, 85);
  } else if (learning.tier === 'rule') {
    initialScore = Math.max(initialScore, 65);
  } else if (learning.tier === 'pattern') {
    initialScore = Math.max(initialScore, 40);
  }

  const phase = scoreToPhase(initialScore);
  const expires_at = expiryFromScore(initialScore);

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
    const currentConfidence = currentData.confidence || 15;
    const currentConfirmations = (currentData.confirmations || 1) + 1;

    // Calculate new confidence with diminishing returns
    const boost = confirmationBoost(currentConfirmations);
    let newConfidence = Math.min(98, currentConfidence + boost);

    // Revenue boost
    if (learning.revenue_linked && !currentData.revenue_linked) {
      newConfidence = Math.min(98, newConfidence + 30);
    }

    const newPhase = scoreToPhase(newConfidence);
    const newExpiry = expiryFromScore(newConfidence);

    await supabase
      .from('agent_logs')
      .update({
        data: {
          ...currentData,
          confidence: newConfidence,
          tier: newPhase,
          confirmations: currentConfirmations,
          contradictions: currentData.contradictions || 0,
          revenue_linked: currentData.revenue_linked || learning.revenue_linked || false,
          evidence: `${currentData.evidence || ''} | ${learning.evidence}`.substring(0, 500),
          expires_at: newExpiry,
          last_confirmed_at: new Date().toISOString(),
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
      confidence: initialScore,
      category: learning.category,
      tier: phase,
      confirmations: 1,
      contradictions: 0,
      revenue_linked: learning.revenue_linked || false,
      expires_at,
      last_confirmed_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
  });
}

/**
 * Record a contradiction — reduces confidence, can demote phase.
 * Called when a learning is proven wrong or produces bad results.
 */
export async function contradictLearning(
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
    const currentConfidence = data.data.confidence || 50;
    const newConfidence = Math.max(0, currentConfidence - 15);
    const contradictions = (data.data.contradictions || 0) + 1;
    const newPhase = scoreToPhase(newConfidence);
    const newExpiry = expiryFromScore(newConfidence);

    await supabase.from('agent_logs').update({
      data: {
        ...data.data,
        confidence: newConfidence,
        tier: newPhase,
        contradictions,
        expires_at: newExpiry,
        last_contradiction: reason,
        last_contradiction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }).eq('id', learningId);
  }
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
    const newConfidence = Math.max(data.data.confidence || 80, 85);
    await supabase.from('agent_logs').update({
      data: {
        ...data.data,
        tier: 'insight',
        confidence: newConfidence,
        expires_at: null,
        revenue_linked: true,
        promotion_reason: reason,
        promoted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }).eq('id', learningId);
  }
}

/**
 * Get active learnings for an agent, sorted by confidence (highest first).
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
      return !expiresAt || expiresAt > now;
    })
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      learning: log.data?.learning || '',
      evidence: log.data?.evidence || '',
      confidence: log.data?.confidence || 15,
      tier: scoreToPhase(log.data?.confidence || 15),
      confirmations: log.data?.confirmations || 1,
      contradictions: log.data?.contradictions || 0,
      revenue_linked: log.data?.revenue_linked || false,
      last_confirmed_at: log.data?.last_confirmed_at,
      created_at: log.created_at,
      expires_at: log.data?.expires_at || null,
    }))
    .sort((a: AgentLearning, b: AgentLearning) => b.confidence - a.confidence);
}

/**
 * Get ALL agents' active learnings for cross-pollination.
 * Pattern+ (score >= 40) shared between similar agents.
 * Rule+ (score >= 65) shared to all agents.
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
      const confidence = log.data?.confidence || 0;
      // Cross-agent: only share Pattern+ (score >= 40)
      return confidence >= 40 && (!expiresAt || expiresAt > now);
    })
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      learning: log.data?.learning || '',
      evidence: log.data?.evidence || '',
      confidence: log.data?.confidence || 40,
      tier: scoreToPhase(log.data?.confidence || 40),
      confirmations: log.data?.confirmations || 1,
      contradictions: log.data?.contradictions || 0,
      revenue_linked: log.data?.revenue_linked || false,
      last_confirmed_at: log.data?.last_confirmed_at,
      created_at: log.created_at,
      expires_at: log.data?.expires_at || null,
    }))
    .sort((a: AgentLearning, b: AgentLearning) => b.confidence - a.confidence);
}

/**
 * Get ALL historical learnings (including expired) for AMIT deep analysis.
 * Unlike getActiveLearnings, this does NOT filter by expiry — all data is preserved.
 * AMIT uses this to detect long-term patterns across the full history.
 */
export async function getAllHistoricalLearnings(
  supabase: SupabaseClient,
  options?: { minConfidence?: number; limit?: number; agentFilter?: string },
): Promise<AgentLearning[]> {
  const minConf = options?.minConfidence ?? 0;
  const maxResults = options?.limit ?? 200;

  let query = supabase
    .from('agent_logs')
    .select('id, agent, data, created_at')
    .eq('action', 'learning')
    .order('created_at', { ascending: false })
    .limit(maxResults);

  if (options?.agentFilter) {
    query = query.eq('agent', options.agentFilter);
  }

  const { data } = await query;

  return (data || [])
    .filter((log: any) => (log.data?.confidence || 0) >= minConf)
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      learning: log.data?.learning || '',
      evidence: log.data?.evidence || '',
      confidence: log.data?.confidence || 0,
      tier: scoreToPhase(log.data?.confidence || 0),
      confirmations: log.data?.confirmations || 1,
      contradictions: log.data?.contradictions || 0,
      revenue_linked: log.data?.revenue_linked || false,
      last_confirmed_at: log.data?.last_confirmed_at,
      created_at: log.created_at,
      expires_at: log.data?.expires_at || null,
    }))
    .sort((a: AgentLearning, b: AgentLearning) => b.confidence - a.confidence);
}

/**
 * Save cross-agent feedback (suggestion, not order).
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
 * Get ALL recent feedbacks across all agents (for AMIT analysis).
 */
export async function getAllFeedbacks(
  supabase: SupabaseClient,
  days: number = 7,
  limit: number = 50,
): Promise<AgentFeedback[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data } = await supabase
    .from('agent_logs')
    .select('id, agent, target, data, created_at')
    .eq('action', 'agent_feedback')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map((log: any) => ({
    id: log.id,
    from_agent: log.data?.from_agent || log.target || 'unknown',
    to_agent: log.agent,
    feedback: log.data?.feedback || '',
    category: log.data?.category || 'general',
    created_at: log.created_at,
  }));
}

/**
 * Format learnings for prompt injection — 5-phase hierarchy with scores.
 */
export function formatLearningsForPrompt(
  ownLearnings: AgentLearning[],
  otherLearnings: AgentLearning[],
  feedbacks?: AgentFeedback[],
): string {
  if (ownLearnings.length === 0 && otherLearnings.length === 0 && (!feedbacks || feedbacks.length === 0)) return '';

  let text = '';

  // INSIGHTS (85-100) — permanent gold, always apply
  const insights = ownLearnings.filter(l => l.confidence >= 85);
  if (insights.length > 0) {
    text += `\n\n💎 INSIGHTS VALIDÉS (score 85-100, permanents, applique TOUJOURS) :`;
    for (const l of insights) {
      text += `\n- [${l.category}] ${l.learning} (score: ${l.confidence}${l.revenue_linked ? ', CA réel' : ''}, ${l.confirmations} conf.)`;
    }
  }

  // RULES (65-84) — reliable, apply systematically
  const rules = ownLearnings.filter(l => l.confidence >= 65 && l.confidence < 85);
  if (rules.length > 0) {
    text += `\n\n📏 RÈGLES FIABLES (score 65-84, applique systématiquement) :`;
    for (const l of rules) {
      text += `\n- [${l.category}] ${l.learning} (score: ${l.confidence}, ${l.confirmations} conf.)`;
    }
  }

  // PATTERNS (40-64) — confirmed trends, apply with care
  const patterns = ownLearnings.filter(l => l.confidence >= 40 && l.confidence < 65);
  if (patterns.length > 0) {
    text += `\n\n🎯 PATTERNS (score 40-64, applique avec prudence) :`;
    for (const l of patterns) {
      text += `\n- [${l.category}] ${l.learning} (score: ${l.confidence}, ${l.confirmations} conf.)`;
    }
  }

  // SIGNALS (20-39) — interesting observations
  const signals = ownLearnings.filter(l => l.confidence >= 20 && l.confidence < 40);
  if (signals.length > 0) {
    text += `\n\n📡 SIGNAUX (score 20-39, à tester/confirmer) :`;
    for (const l of signals.slice(0, 8)) {
      text += `\n- [${l.category}] ${l.learning} (score: ${l.confidence})`;
    }
  }

  // NOISE (0-19) — not shown in prompts, too unreliable

  // Cross-agent learnings (Pattern+ = score >= 40)
  if (otherLearnings.length > 0) {
    text += `\n\n🔄 INTELLIGENCE CROSS-AGENT :`;
    for (const l of otherLearnings.slice(0, 10)) {
      const icon = l.confidence >= 85 ? '💎' : l.confidence >= 65 ? '📏' : '🎯';
      text += `\n- ${icon} [${l.agent}/${l.category}] ${l.learning} (score: ${l.confidence})`;
    }
  }

  // Feedbacks from other agents
  if (feedbacks && feedbacks.length > 0) {
    text += `\n\n💬 FEEDBACKS INTER-AGENTS (conseils, pas des ordres) :`;
    for (const f of feedbacks.slice(0, 5)) {
      text += `\n- [${f.from_agent} → toi] ${f.feedback}`;
    }
  }

  return text;
}

/**
 * Helper to create expiration date by phase/score.
 */
export function learningExpiresIn(days?: number, tier?: LearningPhase): string | null {
  if (tier === 'insight') return null;
  const phase = tier || 'noise';
  const d = days ?? PHASE_CONFIG[phase].expiryDays ?? 7;
  return new Date(Date.now() + d * 86400000).toISOString();
}
