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
import { saveKnowledge } from './knowledge-rag';

// ── Service team definitions for team-level knowledge pools ──
// Each team shares learnings at a lower threshold (Signal+ = 20+) vs cross-agent (Pattern+ = 40+)
export const AGENT_TEAMS: Record<string, { name: string; agents: string[] }> = {
  direction:         { name: 'Direction',           agents: ['ceo', 'marketing'] },
  commercial:        { name: 'Commercial',          agents: ['commercial', 'email', 'ads'] },
  marketing_contenu: { name: 'Marketing & Contenu', agents: ['content', 'seo'] },
  client:            { name: 'Service Client',      agents: ['onboarding', 'retention'] },
  support:           { name: 'Support & Admin',     agents: ['rh', 'comptable'] },
};

/**
 * Resolve which team an agent belongs to. Returns team ID or null.
 */
export function getAgentTeam(agentId: string): string | null {
  for (const [teamId, team] of Object.entries(AGENT_TEAMS)) {
    if (team.agents.includes(agentId)) return teamId;
  }
  return null;
}

/**
 * Get all teammate agent IDs (excluding the given agent).
 */
export function getTeammates(agentId: string): string[] {
  const teamId = getAgentTeam(agentId);
  if (!teamId) return [];
  return AGENT_TEAMS[teamId].agents.filter(a => a !== agentId);
}

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
    orgId?: string | null; // optional org scope for multi-tenant
  },
  orgIdOverride?: string | null, // alternative: pass orgId as 3rd argument
): Promise<void> {
  // Support orgId from either the object or as a standalone parameter
  if (orgIdOverride && !learning.orgId) {
    learning.orgId = orgIdOverride;
  }
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
  let existingQuery = supabase
    .from('agent_logs')
    .select('id, data')
    .eq('agent', learning.agent)
    .eq('action', 'learning')
    .order('created_at', { ascending: false })
    .limit(50);
  if (learning.orgId) existingQuery = existingQuery.eq('org_id', learning.orgId);
  const { data: existing } = await existingQuery;

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

    // Sync to RAG knowledge pool (fire and forget)
    saveKnowledge(supabase, {
      content: currentData.learning || learning.learning,
      summary: `[${newPhase}] ${learning.category} — ${(currentData.learning || learning.learning).substring(0, 80)}`,
      agent: learning.agent,
      category: newConfidence >= 65 ? 'best_practice' : 'learning',
      source: 'learning_sync',
      confidence: newConfidence / 100,
      business_type: currentData.business_type,
      org_id: learning.orgId || undefined,
    }).catch(() => {}); // Non-blocking

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
    ...(learning.orgId ? { org_id: learning.orgId } : {}),
  });

  // Sync to RAG knowledge pool (fire and forget)
  saveKnowledge(supabase, {
    content: learning.learning,
    summary: `[${phase}] ${learning.category} — ${learning.learning.substring(0, 80)}`,
    agent: learning.agent,
    category: initialScore >= 65 ? 'best_practice' : 'learning',
    source: 'learning_sync',
    confidence: initialScore / 100,
    org_id: learning.orgId || undefined,
  }).catch(() => {}); // Non-blocking
}

/**
 * Record a contradiction — reduces confidence, can demote phase.
 * Called when a learning is proven wrong or produces bad results.
 */
export async function contradictLearning(
  supabase: SupabaseClient,
  learningId: string,
  reason: string,
  orgId?: string | null,
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

    let updateQuery = supabase.from('agent_logs').update({
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
    if (orgId) updateQuery = updateQuery.eq('org_id', orgId);
    await updateQuery;
  }
}

/**
 * Promote a learning to insight tier (called by CEO or on conversion event).
 */
export async function promoteToInsight(
  supabase: SupabaseClient,
  learningId: string,
  reason: string,
  orgId?: string | null,
): Promise<void> {
  const { data } = await supabase
    .from('agent_logs')
    .select('data')
    .eq('id', learningId)
    .single();

  if (data?.data) {
    const newConfidence = Math.max(data.data.confidence || 80, 85);
    let updateQuery = supabase.from('agent_logs').update({
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
    if (orgId) updateQuery = updateQuery.eq('org_id', orgId);
    await updateQuery;
  }
}

/**
 * Get active learnings for an agent, sorted by confidence (highest first).
 */
export async function getActiveLearnings(
  supabase: SupabaseClient,
  agentName: string,
  category?: LearningCategory,
  orgId?: string,
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
  if (orgId) {
    query = query.eq('org_id', orgId);
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
  orgId?: string,
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
  if (orgId) {
    query = query.eq('org_id', orgId);
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
 * Get learnings from the same SERVICE TEAM — shared at a lower threshold (Signal+ = 20+).
 * Team pools allow tighter knowledge sharing between closely related agents.
 * This enables future merging of agents within a team into generalists.
 */
export async function getTeamLearnings(
  supabase: SupabaseClient,
  agentName: string,
  orgId?: string,
): Promise<AgentLearning[]> {
  const teammates = getTeammates(agentName);
  if (teammates.length === 0) return [];

  const now = new Date().toISOString();

  let query = supabase
    .from('agent_logs')
    .select('id, agent, data, created_at')
    .eq('action', 'learning')
    .in('agent', teammates)
    .order('created_at', { ascending: false })
    .limit(40);

  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data } = await query;

  return (data || [])
    .filter((log: any) => {
      const expiresAt = log.data?.expires_at;
      const confidence = log.data?.confidence || 0;
      // Team pool: share at Signal+ (score >= 20) — lower than cross-agent (40+)
      return confidence >= 20 && (!expiresAt || expiresAt > now);
    })
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      learning: log.data?.learning || '',
      evidence: log.data?.evidence || '',
      confidence: log.data?.confidence || 20,
      tier: scoreToPhase(log.data?.confidence || 20),
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
  options?: { minConfidence?: number; limit?: number; agentFilter?: string; orgId?: string | null },
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
  if (options?.orgId) {
    query = query.eq('org_id', options.orgId);
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
 * Get global learnings from ALL orgs that meet confidence thresholds.
 * Used for cross-org intelligence sharing in multi-tenant mode.
 *
 * Sharing rules (by business_type match):
 * - Same business_type: shared at confidence >= 40 (Pattern+)
 * - Different business_type: shared at confidence >= 65 (Rule+)
 * - Universal (no business_type filter): shared at confidence >= 85 (Insight)
 *
 * IMPORTANT: Returns anonymized learnings — no metadata with names/emails/prospect data.
 */
export async function getGlobalLearnings(
  supabase: SupabaseClient,
  businessType?: string,
  minConfidence: number = 65,
): Promise<AgentLearning[]> {
  const now = new Date().toISOString();

  // Fetch all learnings across all orgs with sufficient confidence
  const effectiveMin = businessType ? Math.min(minConfidence, 40) : Math.max(minConfidence, 85);

  const { data } = await supabase
    .from('agent_logs')
    .select('id, agent, data, created_at')
    .eq('action', 'learning')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!data) return [];

  return data
    .filter((log: any) => {
      const confidence = log.data?.confidence || 0;
      const expiresAt = log.data?.expires_at;
      if (expiresAt && expiresAt <= now) return false;

      const logBusinessType = log.data?.business_type;

      // Same business type: Pattern+ threshold (>= 40)
      if (businessType && logBusinessType === businessType) {
        return confidence >= 40;
      }
      // Different business type: Rule+ threshold (>= 65)
      if (businessType && logBusinessType && logBusinessType !== businessType) {
        return confidence >= 65;
      }
      // Universal (no business_type on either side): Insight threshold (>= 85)
      return confidence >= 85;
    })
    .map((log: any) => ({
      id: log.id,
      agent: log.agent,
      category: log.data?.category || 'general',
      // Anonymized: only the learning text and evidence (no prospect names/emails)
      learning: log.data?.learning || '',
      evidence: anonymizeEvidence(log.data?.evidence || ''),
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
 * Strip potential PII from evidence strings (emails, names, phone numbers).
 * Keeps the insight value but removes identifying information.
 */
function anonymizeEvidence(evidence: string): string {
  return evidence
    // Remove email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    // Remove phone numbers (French and international formats)
    .replace(/(?:\+?33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g, '[phone]')
    .replace(/\+?\d{10,15}/g, '[phone]')
    // Remove common name patterns after "chez" or "de" (French business context)
    .replace(/chez\s+[A-Z][a-zéèêëàâôûùïî]+(?:\s+[A-Z][a-zéèêëàâôûùïî]+)*/g, 'chez [entreprise]')
    // Anonymize company names: capitalized words of 3+ chars that aren't common words
    .replace(/\b([A-Z][a-zA-ZéèêëàâôûùïîÉÈÊËÀÂÔÛÙÏÎ]{2,})\b/g, (match) => {
      const commonWords = new Set([
        'Les', 'Des', 'Une', 'Pour', 'Par', 'Sur', 'Avec', 'Dans', 'Pas', 'Plus',
        'Qui', 'Que', 'Est', 'Sont', 'Ont', 'Mais', 'Donc', 'Car', 'The', 'And',
        'For', 'Not', 'You', 'All', 'Can', 'Had', 'Her', 'Was', 'One', 'Our',
        'This', 'That', 'From', 'With', 'They', 'Been', 'Have', 'Many', 'Some',
        'Them', 'Than', 'Its', 'Over', 'Such', 'After', 'Most', 'Also', 'Made',
        'Email', 'Agent', 'Score', 'Client', 'Pattern', 'Signal', 'Rule', 'Insight',
        'Noise', 'Phase', 'Marketing', 'Content', 'Conversion', 'Prospection',
        'Community', 'Retention', 'General',
      ]);
      return commonWords.has(match) ? match : '[company]';
    });
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
    orgId?: string | null; // optional org scope for multi-tenant
  },
  orgIdOverride?: string | null, // alternative: pass orgId as 3rd argument
): Promise<void> {
  const orgId = feedback.orgId || orgIdOverride;
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
    ...(orgId ? { org_id: orgId } : {}),
  });
}

/**
 * Get recent feedbacks from other agents.
 */
export async function getAgentFeedbacks(
  supabase: SupabaseClient,
  agentName: string,
  limit: number = 10,
  orgId?: string,
): Promise<AgentFeedback[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  let query = supabase
    .from('agent_logs')
    .select('id, data, created_at')
    .eq('agent', agentName)
    .eq('action', 'agent_feedback')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (orgId) query = query.eq('org_id', orgId);
  const { data } = await query;

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
  orgId?: string | null,
): Promise<AgentFeedback[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('agent_logs')
    .select('id, agent, target, data, created_at')
    .eq('action', 'agent_feedback')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (orgId) query = query.eq('org_id', orgId);

  const { data } = await query;

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
  teamLearnings?: AgentLearning[],
): string {
  if (ownLearnings.length === 0 && otherLearnings.length === 0 && (!feedbacks || feedbacks.length === 0) && (!teamLearnings || teamLearnings.length === 0)) return '';

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

  // Team learnings (Signal+ = score >= 20, same service team)
  if (teamLearnings && teamLearnings.length > 0) {
    // Exclude learnings already shown in own or cross-agent sections
    const ownIds = new Set(ownLearnings.map(l => l.id));
    const teamOnly = teamLearnings.filter(l => !ownIds.has(l.id));
    if (teamOnly.length > 0) {
      const teamId = getAgentTeam(teamOnly[0].agent);
      const teamName = teamId ? AGENT_TEAMS[teamId]?.name : 'Équipe';
      text += `\n\n🏢 POOL ÉQUIPE ${teamName.toUpperCase()} (coéquipiers, Signal+ score >= 20) :`;
      for (const l of teamOnly.slice(0, 12)) {
        const icon = l.confidence >= 85 ? '💎' : l.confidence >= 65 ? '📏' : l.confidence >= 40 ? '🎯' : '📡';
        text += `\n- ${icon} [${l.agent}/${l.category}] ${l.learning} (score: ${l.confidence})`;
      }
    }
  }

  // Cross-agent learnings (Pattern+ = score >= 40, all agents outside team)
  if (otherLearnings.length > 0) {
    // Filter out teammates to avoid duplicates with team pool
    const teamAgentIds = teamLearnings ? new Set(teamLearnings.map(l => l.agent)) : new Set<string>();
    const crossOnly = otherLearnings.filter(l => !teamAgentIds.has(l.agent));
    if (crossOnly.length > 0) {
      text += `\n\n🔄 INTELLIGENCE CROSS-AGENT (hors équipe) :`;
      for (const l of crossOnly.slice(0, 10)) {
        const icon = l.confidence >= 85 ? '💎' : l.confidence >= 65 ? '📏' : '🎯';
        text += `\n- ${icon} [${l.agent}/${l.category}] ${l.learning} (score: ${l.confidence})`;
      }
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
