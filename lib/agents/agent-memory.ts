/**
 * Agent Memory & Learning System
 *
 * Enables:
 * 1. CEO → Agent directives (persistent strategic instructions)
 * 2. Agent → CEO learnings (what worked, what didn't)
 * 3. Agent self-improvement via performance tracking
 *
 * Uses agent_logs table with specific action types:
 * - 'directive': CEO instruction to an agent (persists until replaced)
 * - 'learning': Agent self-reported insight from execution results
 * - 'performance': Agent performance summary (auto-generated)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin(): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ─── CEO → Agent Directives ───────────────────────────────────────────────

export interface AgentDirective {
  agent: string;
  instruction: string;
  context: string;
  created_at: string;
}

/**
 * Get the latest active directive for an agent.
 * The CEO writes directives; agents read them at the start of every run.
 */
export async function getDirectiveForAgent(agentName: string): Promise<AgentDirective | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('agent_logs')
    .select('agent, data, created_at')
    .eq('agent', 'ceo')
    .eq('action', 'directive')
    .eq('target_id', agentName)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    agent: agentName,
    instruction: data.data?.instruction || '',
    context: data.data?.context || '',
    created_at: data.created_at,
  };
}

/**
 * CEO writes a directive for an agent.
 * This replaces the previous directive (only latest counts).
 */
export async function setDirectiveForAgent(
  agentName: string,
  instruction: string,
  context: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('agent_logs').insert({
    agent: 'ceo',
    action: 'directive',
    target_id: agentName,
    data: { instruction, context, for_agent: agentName },
    status: 'success',
    created_at: new Date().toISOString(),
  });
}

/**
 * Get all active directives (one per agent).
 * Used by CEO brief to review what instructions are currently active.
 */
export async function getAllDirectives(): Promise<AgentDirective[]> {
  const supabase = getSupabaseAdmin();
  const agents = [
    'email', 'chatbot', 'commercial', 'dm_instagram',
    'tiktok_comments', 'gmaps', 'seo', 'onboarding',
    'retention', 'content',
  ];

  const directives: AgentDirective[] = [];
  for (const agent of agents) {
    const d = await getDirectiveForAgent(agent);
    if (d) directives.push(d);
  }
  return directives;
}

// ─── Agent Learnings (self-reported) ──────────────────────────────────────

export interface AgentLearning {
  agent: string;
  insight: string;
  metric_name: string;
  metric_before: number | null;
  metric_after: number | null;
  recommendation: string;
  created_at: string;
}

/**
 * An agent reports a learning from its execution results.
 * Example: "Step 1 emails with variant 2 have 40% open rate vs 20% for variant 0"
 */
export async function reportLearning(
  agentName: string,
  learning: {
    insight: string;
    metric_name: string;
    metric_before?: number;
    metric_after?: number;
    recommendation: string;
  }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('agent_logs').insert({
    agent: agentName,
    action: 'learning',
    data: {
      insight: learning.insight,
      metric_name: learning.metric_name,
      metric_before: learning.metric_before ?? null,
      metric_after: learning.metric_after ?? null,
      recommendation: learning.recommendation,
    },
    status: 'success',
    created_at: new Date().toISOString(),
  });
}

/**
 * Get recent learnings for an agent (last 7 days).
 */
export async function getRecentLearnings(agentName: string, days: number = 7): Promise<AgentLearning[]> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('agent_logs')
    .select('agent, data, created_at')
    .eq('agent', agentName)
    .eq('action', 'learning')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);

  return (data || []).map((row: any) => ({
    agent: row.agent,
    insight: row.data?.insight || '',
    metric_name: row.data?.metric_name || '',
    metric_before: row.data?.metric_before ?? null,
    metric_after: row.data?.metric_after ?? null,
    recommendation: row.data?.recommendation || '',
    created_at: row.created_at,
  }));
}

/**
 * Get all recent learnings across all agents.
 * Used by CEO brief to understand what agents have discovered.
 */
export async function getAllRecentLearnings(days: number = 7): Promise<AgentLearning[]> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('agent_logs')
    .select('agent, data, created_at')
    .eq('action', 'learning')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data || []).map((row: any) => ({
    agent: row.agent,
    insight: row.data?.insight || '',
    metric_name: row.data?.metric_name || '',
    metric_before: row.data?.metric_before ?? null,
    metric_after: row.data?.metric_after ?? null,
    recommendation: row.data?.recommendation || '',
    created_at: row.created_at,
  }));
}

// ─── Agent Context Builder ────────────────────────────────────────────────

/**
 * Build the full context string for an agent to read at execution start.
 * Includes: active directive + recent learnings + performance hints.
 */
export async function getAgentContext(agentName: string): Promise<string> {
  const [directive, learnings] = await Promise.all([
    getDirectiveForAgent(agentName),
    getRecentLearnings(agentName, 7),
  ]);

  const parts: string[] = [];

  if (directive) {
    parts.push(`DIRECTIVE CEO ACTIVE (${directive.created_at.split('T')[0]}):\n${directive.instruction}`);
    if (directive.context) {
      parts.push(`Contexte: ${directive.context}`);
    }
  }

  if (learnings.length > 0) {
    parts.push(`\nLEARNINGS RECENTS (${learnings.length}):`);
    for (const l of learnings.slice(0, 5)) {
      const metric = l.metric_after !== null
        ? ` [${l.metric_name}: ${l.metric_before ?? '?'} → ${l.metric_after}]`
        : '';
      parts.push(`- ${l.insight}${metric}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

// ─── CEO Summary Builder ──────────────────────────────────────────────────

/**
 * Build the full agent intelligence summary for the CEO brief.
 * Shows: active directives + agent learnings + what needs attention.
 */
export async function getCeoIntelligenceSummary(): Promise<string> {
  const [directives, learnings] = await Promise.all([
    getAllDirectives(),
    getAllRecentLearnings(7),
  ]);

  const parts: string[] = [];

  if (directives.length > 0) {
    parts.push('DIRECTIVES ACTIVES:');
    for (const d of directives) {
      parts.push(`- [${d.agent}] ${d.instruction.substring(0, 100)} (${d.created_at.split('T')[0]})`);
    }
  }

  if (learnings.length > 0) {
    parts.push('\nLEARNINGS AGENTS (7 derniers jours):');
    for (const l of learnings.slice(0, 10)) {
      const metric = l.metric_after !== null
        ? ` [${l.metric_name}: ${l.metric_before ?? '?'} → ${l.metric_after}]`
        : '';
      parts.push(`- [${l.agent}] ${l.insight}${metric}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'Aucune directive active, aucun learning recent.';
}
