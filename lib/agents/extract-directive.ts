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

import type { SupabaseClient } from '@supabase/supabase-js';

export type ExtractedDirective = {
  text: string;          // the rule to persist (1-2 sentences)
  scope: 'this_client' | 'business_type';   // who should benefit
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
  "category": "visual" | "tone" | "audience" | "frequency" | "platform" | "overlay" | "other"
}
OR if nothing to extract:
{ "extracted": false }

scope = "business_type" only when the rule is general enough that ALL clients of the same business type would benefit (e.g. "restaurants should always show plate composition with real ingredients"). Default to "this_client".

JSON only. No preamble.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
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
      const newConfig = {
        ...((cfg?.config as any) || {}),
        [directiveKey]: next,
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
