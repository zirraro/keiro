/**
 * Auto-Improvement System for Agents
 *
 * When an agent fails or succeeds, this system:
 * 1. Analyzes WHY (via Claude Haiku)
 * 2. Extracts a learning
 * 3. Saves to both SQL + RAG
 * 4. All agents benefit immediately
 *
 * Called automatically after each agent execution.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { saveLearning } from './learning';
import { learnFromAction } from './knowledge-rag';
import { Events } from './event-bus';

interface AgentResult {
  agent: string;
  action: string;
  success: boolean;
  error?: string;
  details?: string;
  metrics?: Record<string, any>;
  orgId?: string;
}

/**
 * Analyze an agent's execution result and auto-generate learnings.
 * Called after each agent completes (success or failure).
 */
export async function autoImprove(
  supabase: SupabaseClient,
  result: AgentResult
): Promise<void> {
  try {
    // ─── 1. Always log the result ────────────────────────
    await supabase.from('agent_logs').insert({
      agent: result.agent,
      action: result.success ? 'execution_success' : 'execution_failure',
      status: result.success ? 'ok' : 'error',
      data: {
        action: result.action,
        error: result.error || null,
        details: result.details || null,
        metrics: result.metrics || null,
        auto_improve: true,
      },
      created_at: new Date().toISOString(),
      ...(result.orgId ? { org_id: result.orgId } : {}),
    });

    // ─── 2. On failure: analyze + create learning ────────
    if (!result.success && result.error) {
      // Use Claude Haiku to analyze the failure
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      let analysis = '';

      if (ANTHROPIC_KEY) {
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': ANTHROPIC_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 500,
              system: `Tu es un expert en debugging d'agents IA. Analyse cette erreur et donne:
1. La cause probable (1 phrase)
2. La solution/prevention (1 phrase)
3. Le learning a retenir pour les autres agents (1 phrase)

Reponds en JSON: {"cause": "...", "solution": "...", "learning": "..."}`,
              messages: [{
                role: 'user',
                content: `Agent: ${result.agent}\nAction: ${result.action}\nErreur: ${result.error}\nDetails: ${result.details || 'aucun'}`,
              }],
            }),
          });

          if (res.ok) {
            const data = await res.json();
            analysis = data.content?.[0]?.text || '';
          }
        } catch { /* silent */ }
      }

      // Parse analysis and save learning
      let learningText = `ECHEC agent ${result.agent}, action ${result.action}: ${result.error}`;
      let evidence = result.details || result.error;

      if (analysis) {
        try {
          const parsed = JSON.parse(analysis);
          learningText = `AVOID: ${parsed.learning || learningText}`;
          evidence = `Cause: ${parsed.cause || 'inconnue'}. Solution: ${parsed.solution || 'a investiguer'}`;
        } catch {
          learningText = `AVOID: ${result.agent}/${result.action} — ${result.error.substring(0, 200)}`;
        }
      }

      // Save to SQL learnings
      await saveLearning(supabase, {
        agent: result.agent,
        category: 'execution',
        learning: learningText,
        evidence,
        confidence: 30, // Low confidence initially, grows with confirmations
        orgId: result.orgId,
      });

      // Save to RAG
      await learnFromAction(supabase, result.agent, {
        type: result.action,
        description: learningText,
        result: 'failure',
        details: evidence,
        orgId: result.orgId,
      });
    }

    // ─── 3. On success with metrics: extract best practices ─
    if (result.success && result.metrics) {
      const metricsStr = Object.entries(result.metrics)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');

      // Only save if there are notable metrics
      const hasNotableMetric = Object.values(result.metrics).some(v =>
        (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.length > 0)
      );

      if (hasNotableMetric) {
        await saveLearning(supabase, {
          agent: result.agent,
          category: 'execution',
          learning: `SUCCESS: ${result.agent}/${result.action} — ${metricsStr}`,
          evidence: result.details || `Metrics: ${metricsStr}`,
          confidence: 20, // Will grow with repeated success
          orgId: result.orgId,
        });

        await learnFromAction(supabase, result.agent, {
          type: result.action,
          description: `${result.action} reussi: ${metricsStr}`,
          result: 'success',
          details: result.details,
          orgId: result.orgId,
        });
      }
    }
    // ─── 4. On repeated failure: notify client + mark as adjusting ──
    if (!result.success && result.error) {
      // Check if this agent has failed 3+ times in last 24h
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recentFailures } = await supabase
        .from('agent_logs')
        .select('id', { count: 'exact', head: true })
        .eq('agent', result.agent)
        .eq('action', 'execution_failure')
        .gte('created_at', twentyFourHoursAgo);

      if (recentFailures && recentFailures >= 3) {
        // Check if we already notified for this agent today
        const { data: alreadyNotified } = await supabase
          .from('agent_logs')
          .select('id')
          .eq('agent', result.agent)
          .eq('action', 'client_bug_notification')
          .gte('created_at', twentyFourHoursAgo)
          .limit(1)
          .maybeSingle();

        if (!alreadyNotified) {
          // Log the notification
          await supabase.from('agent_logs').insert({
            agent: result.agent,
            action: 'client_bug_notification',
            status: 'ok',
            data: {
              message: `L'agent ${result.agent} rencontre un probleme temporaire. Nos equipes sont notifiees et travaillent a le resoudre. Cette fonctionnalite sera retablie automatiquement.`,
              failures: recentFailures,
              last_error: result.error?.substring(0, 200),
            },
            created_at: new Date().toISOString(),
          });

          // Emit event for CEO to handle
          await Events.agentFailed(supabase, result.agent, result.error || 'Unknown', result.orgId).catch(() => {});

          console.log(`[AutoImprove] Client notified: ${result.agent} has ${recentFailures} failures in 24h`);
        }
      }
    }
  } catch (err: any) {
    // Auto-improve must NEVER break the agent
    console.error(`[AutoImprove] Error for ${result.agent}:`, err.message?.substring(0, 200));
  }
}

/**
 * Wrapper to run an agent function with auto-improvement.
 * Usage:
 *   const result = await withAutoImprove(supabase, 'email', 'send_cold', async () => {
 *     // agent logic here
 *     return { sent: 5, opened: 2 };
 *   });
 */
export async function withAutoImprove<T>(
  supabase: SupabaseClient,
  agent: string,
  action: string,
  fn: () => Promise<T>,
  orgId?: string,
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    // Auto-log success
    await autoImprove(supabase, {
      agent,
      action,
      success: true,
      details: `Completed in ${duration}ms`,
      metrics: typeof result === 'object' && result !== null ? result as Record<string, any> : { duration },
      orgId,
    });

    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;

    // Auto-log failure
    await autoImprove(supabase, {
      agent,
      action,
      success: false,
      error: err.message || 'Unknown error',
      details: `Failed after ${duration}ms`,
      orgId,
    });

    throw err; // Re-throw so the caller can handle it
  }
}
