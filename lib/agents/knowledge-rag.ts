/**
 * Agent Knowledge RAG System
 *
 * Provides vector-based semantic search over the shared agent knowledge pool.
 * Each agent queries this before taking action to benefit from collective intelligence.
 *
 * Architecture:
 * - Embeddings via OpenAI ada-002 (1536 dims)
 * - Storage: Supabase pgvector (agent_knowledge table)
 * - Search: cosine similarity with threshold
 * - Auto-learning: agents save insights after actions
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────────

export interface KnowledgeEntry {
  id?: string;
  content: string;
  summary?: string;
  agent?: string;
  category: 'learning' | 'insight' | 'pattern' | 'rule' | 'feedback' | 'best_practice';
  source?: string;
  confidence?: number;
  business_type?: string;
  org_id?: string;
}

export interface KnowledgeSearchResult {
  id: string;
  content: string;
  summary: string;
  agent: string;
  category: string;
  confidence: number;
  business_type: string;
  similarity: number;
}

// ─── Embedding ──────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[RAG] No OPENAI_API_KEY — falling back to text search');
    return null;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000), // Ada-002 max ~8K tokens
      }),
    });

    if (!res.ok) {
      console.error('[RAG] Embedding API error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch (err: any) {
    console.error('[RAG] Embedding error:', err.message?.substring(0, 200));
    return null;
  }
}

// ─── Search Knowledge ───────────────────────────────────────

/**
 * Search the knowledge pool for relevant context.
 * Called by agents before taking action.
 */
export async function searchKnowledge(
  supabase: SupabaseClient,
  query: string,
  options: {
    agent?: string;
    category?: string;
    businessType?: string;
    orgId?: string;
    threshold?: number;
    limit?: number;
  } = {}
): Promise<KnowledgeSearchResult[]> {
  const { agent, category, businessType, orgId, threshold = 0.7, limit = 10 } = options;

  // Try vector search first
  const embedding = await getEmbedding(query);

  if (embedding) {
    try {
      const { data, error } = await supabase.rpc('search_agent_knowledge', {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit,
        filter_agent: agent || null,
        filter_category: category || null,
        filter_business_type: businessType || null,
        filter_org_id: orgId || null,
      });

      if (!error && data && data.length > 0) {
        // Update usage stats
        const ids = data.map((d: any) => d.id);
        await supabase.from('agent_knowledge')
          .update({ usage_count: supabase.rpc('increment_usage', {}), last_used_at: new Date().toISOString() })
          .in('id', ids)
          .then(() => {}); // Fire and forget

        return data;
      }
    } catch (rpcErr: any) {
      console.warn('[RAG] Vector search failed, falling back to text:', rpcErr.message?.substring(0, 100));
    }
  }

  // Fallback: text-based search (with proper org_id filtering)
  let query_builder = supabase
    .from('agent_knowledge')
    .select('id, content, summary, agent, category, confidence, business_type')
    .ilike('content', `%${query.substring(0, 100)}%`)
    .order('confidence', { ascending: false })
    .limit(limit);

  if (agent) query_builder = query_builder.or(`agent.eq.${agent},agent.is.null`);
  if (category) query_builder = query_builder.eq('category', category);
  if (businessType) query_builder = query_builder.or(`business_type.eq.${businessType},business_type.is.null`);
  if (orgId) query_builder = query_builder.or(`org_id.eq.${orgId},org_id.is.null`);

  const { data: textResults } = await query_builder;

  return (textResults || []).map((r: any) => ({ ...r, similarity: 0.5 }));
}

// ─── Save Knowledge ─────────────────────────────────────────

/**
 * Save a new knowledge entry to the pool.
 * Called by agents after learning something new.
 */
export async function saveKnowledge(
  supabase: SupabaseClient,
  entry: KnowledgeEntry
): Promise<string | null> {
  const embedding = await getEmbedding(entry.content);

  const { data, error } = await supabase
    .from('agent_knowledge')
    .insert({
      content: entry.content,
      summary: entry.summary || entry.content.substring(0, 100),
      agent: entry.agent || null,
      category: entry.category,
      source: entry.source || 'agent_auto',
      confidence: entry.confidence ?? 0.5,
      business_type: entry.business_type || null,
      embedding: embedding || null,
      org_id: entry.org_id || null,
      created_by: entry.agent || 'system',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[RAG] Save knowledge error:', error.message);
    return null;
  }

  return data?.id || null;
}

// ─── Build Context for Agent ────────────────────────────────

/**
 * Build a knowledge context string for an agent before it takes action.
 * This is the main entry point — call this before generating any agent response.
 *
 * Returns a formatted string to inject into the agent's system prompt.
 */
export async function getAgentKnowledgeContext(
  supabase: SupabaseClient,
  agentId: string,
  taskDescription: string,
  options: {
    businessType?: string;
    orgId?: string;
  } = {}
): Promise<string> {
  const results = await searchKnowledge(supabase, taskDescription, {
    agent: agentId,
    businessType: options.businessType,
    orgId: options.orgId,
    threshold: 0.6,
    limit: 5,
  });

  if (results.length === 0) return '';

  const lines = results.map((r, i) =>
    `${i + 1}. [${r.category}${r.business_type ? `, ${r.business_type}` : ''}, confiance ${Math.round(r.confidence * 100)}%] ${r.content.substring(0, 300)}`
  );

  return `\n\n--- CONNAISSANCES DU POOL (${results.length} pertinentes) ---\n${lines.join('\n')}\n--- FIN CONNAISSANCES ---\n\nUtilise ces connaissances pour optimiser ta reponse. Ne les cite pas directement.`;
}

// ─── Auto-Learning Loop ─────────────────────────────────────

/**
 * After an agent completes an action, analyze the result and save learnings.
 * This creates the feedback loop for continuous improvement.
 */
export async function learnFromAction(
  supabase: SupabaseClient,
  agentId: string,
  action: {
    type: string;
    description: string;
    result: 'success' | 'failure' | 'neutral';
    details?: string;
    businessType?: string;
    orgId?: string;
  }
): Promise<void> {
  // Only save learnings from meaningful outcomes
  if (action.result === 'neutral') return;

  const confidence = action.result === 'success' ? 0.7 : 0.4;
  const prefix = action.result === 'success'
    ? `BEST PRACTICE: `
    : `AVOID: `;

  const content = `${prefix}Agent ${agentId}, action ${action.type}: ${action.description}${action.details ? `. Detail: ${action.details}` : ''}`;

  await saveKnowledge(supabase, {
    content,
    summary: `${action.result === 'success' ? 'Succes' : 'Echec'} — ${action.type} par ${agentId}`,
    agent: agentId,
    category: action.result === 'success' ? 'best_practice' : 'learning',
    source: 'auto_learning',
    confidence,
    business_type: action.businessType,
    org_id: action.orgId,
  });
}
