/**
 * Agent Event Bus + CEO Decision Engine + Action Dispatcher
 *
 * Architecture:
 *   Agent action → emitEvent() → Event Bus (DB)
 *   CEO cron checks events → analyzes with Claude → dispatches actions
 *   Action Dispatcher → calls target agent endpoint
 *
 * Hierarchy:
 *   NOAH (CEO) → supreme decision, global strategy
 *   AMI (Marketing) → marketing decisions, agent coordination
 *   All agents → emit events, receive orders
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────────

export type EventPriority = 'critical' | 'high' | 'medium' | 'low';

export interface AgentEvent {
  agent: string;          // who emitted
  type: string;           // event type (email_reply_positive, prospect_hot, content_published, etc.)
  data: Record<string, any>;
  priority: EventPriority;
  requires_action: boolean;
  org_id?: string;
}

export interface DispatchAction {
  target_agent: string;
  action: string;
  payload: Record<string, any>;
  reason: string;         // why CEO/AMI decided this
  priority: EventPriority;
  ordered_by: 'ceo' | 'ami';
}

// ─── Event Types ────────────────────────────────────────────

export const EVENT_TYPES = {
  // Commercial
  PROSPECT_HOT: 'prospect_hot',
  PROSPECT_REPLIED: 'prospect_replied',
  PROSPECT_LOST: 'prospect_lost',
  CLIENT_CONVERTED: 'client_converted',
  // Email
  EMAIL_REPLY_POSITIVE: 'email_reply_positive',
  EMAIL_REPLY_NEGATIVE: 'email_reply_negative',
  EMAIL_CLICKED: 'email_clicked',
  EMAIL_BOUNCED: 'email_bounced',
  // Content
  CONTENT_PUBLISHED: 'content_published',
  CONTENT_HIGH_ENGAGEMENT: 'content_high_engagement',
  CONTENT_FAILED: 'content_failed',
  // DM
  DM_RECEIVED: 'dm_received',
  DM_RESPONSE_POSITIVE: 'dm_response_positive',
  // WhatsApp
  WHATSAPP_RECEIVED: 'whatsapp_received',
  WHATSAPP_LEAD: 'whatsapp_lead',
  // Chatbot
  CHATBOT_LEAD_CAPTURED: 'chatbot_lead_captured',
  // SEO
  SEO_ARTICLE_PUBLISHED: 'seo_article_published',
  SEO_RANKING_DROP: 'seo_ranking_drop',
  // System
  AGENT_FAILED: 'agent_failed',
  AGENT_TIMEOUT: 'agent_timeout',
  DAILY_SUMMARY: 'daily_summary',
} as const;

// ─── Emit Event ─────────────────────────────────────────────

/**
 * Any agent can emit an event. Events are stored in agent_logs with
 * action='event' for the CEO to process.
 */
export async function emitEvent(
  supabase: SupabaseClient,
  event: AgentEvent
): Promise<void> {
  await supabase.from('agent_logs').insert({
    agent: event.agent,
    action: 'event',
    status: 'pending', // CEO hasn't processed yet
    data: {
      event_type: event.type,
      priority: event.priority,
      requires_action: event.requires_action,
      ...event.data,
    },
    created_at: new Date().toISOString(),
    ...(event.org_id ? { org_id: event.org_id } : {}),
  });
}

// ─── CEO Decision Engine ────────────────────────────────────

/**
 * CEO (Noah) processes pending events and decides what actions to take.
 * Called by the CEO cron job.
 *
 * Returns actions to dispatch.
 */
export async function ceoProcessEvents(
  supabase: SupabaseClient,
  orgId?: string,
): Promise<DispatchAction[]> {
  // 1. Fetch unprocessed events (last 2h, pending)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('agent_logs')
    .select('*')
    .eq('action', 'event')
    .eq('status', 'pending')
    .gte('created_at', twoHoursAgo)
    .order('created_at', { ascending: true })
    .limit(50);

  if (orgId) query = query.eq('org_id', orgId);

  const { data: events } = await query;

  if (!events || events.length === 0) return [];

  // 2. Format events for CEO analysis
  const eventSummary = events.map(e => {
    const d = e.data || {};
    return `[${d.priority || 'medium'}] ${e.agent}: ${d.event_type} — ${JSON.stringify(d).substring(0, 200)}`;
  }).join('\n');

  // 3. CEO analyzes with Claude
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    // Mark all as processed without actions
    await markEventsProcessed(supabase, events.map(e => e.id));
    return [];
  }

  let actions: DispatchAction[] = [];

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
        max_tokens: 2000,
        system: `Tu es Noah, le CEO IA de KeiroAI. Tu supervises TOUS les agents.

Tu recois des events emis par les agents. Pour chaque event qui necessite une action, tu decides quel agent doit reagir et comment.

HIERARCHIE:
- Toi (Noah/CEO) : decisions strategiques globales
- Ami (marketing) : decisions marketing, coordination agents
- Agents operationnels : executent les ordres

REGLES DE DECISION:
- prospect_replied + positif → Hugo (email relance rapide) + Jade (DM renfort) + Leo (qualifier dans CRM)
- prospect_hot → Leo (priorite contact) + Hugo (email personnalise)
- email_clicked → Hugo (relance J+1) + Jade (DM si Instagram dispo)
- content_high_engagement → Lena (dupliquer le format) + Ami (analyser pourquoi)
- chatbot_lead_captured → Hugo (email welcome) + Jade (DM si IG) + Stella (WhatsApp si phone)
- whatsapp_lead → Leo (qualifier) + Hugo (sequence email)
- agent_failed → Ops (diagnostic) + toi (alerte)
- client_converted → Hugo (email bienvenue) + Lena (contenu celebratory)

Reponds UNIQUEMENT en JSON (array d'actions):
[
  {
    "target_agent": "agent_id",
    "action": "description courte de l'action",
    "payload": { "prospect_id": "...", "context": "..." },
    "reason": "pourquoi cette action",
    "priority": "critical|high|medium|low",
    "ordered_by": "ceo"
  }
]

Si aucune action necessaire, retourne [].
IMPORTANT: Sois selectif. Ne genere PAS d'action pour les events low priority ou informatifs.`,
        messages: [{
          role: 'user',
          content: `${events.length} events a traiter:\n\n${eventSummary}`,
        }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.content?.[0]?.text || '[]';
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          actions = parsed;
        }
      } catch {
        console.warn('[EventBus] CEO failed to parse actions');
      }
    }
  } catch (err: any) {
    console.error('[EventBus] CEO analysis error:', err.message?.substring(0, 200));
  }

  // 4. Mark events as processed
  await markEventsProcessed(supabase, events.map(e => e.id));

  // 5. Log CEO decisions
  if (actions.length > 0) {
    await supabase.from('agent_logs').insert({
      agent: 'ceo',
      action: 'event_decisions',
      status: 'ok',
      data: {
        events_processed: events.length,
        actions_dispatched: actions.length,
        actions: actions.map(a => `${a.target_agent}: ${a.action} (${a.priority})`),
      },
      created_at: new Date().toISOString(),
    });
  }

  return actions;
}

// ─── Action Dispatcher ──────────────────────────────────────

/**
 * Dispatch actions decided by CEO/AMI to target agents.
 * Creates agent_orders that the agents will pick up.
 */
export async function dispatchActions(
  supabase: SupabaseClient,
  actions: DispatchAction[],
): Promise<{ dispatched: number; failed: number }> {
  let dispatched = 0;
  let failed = 0;

  for (const action of actions) {
    try {
      await supabase.from('agent_orders').insert({
        from_agent: action.ordered_by,
        to_agent: action.target_agent,
        action: action.action,
        priority: action.priority === 'critical' ? 1 : action.priority === 'high' ? 2 : action.priority === 'medium' ? 3 : 4,
        status: 'pending',
        data: {
          ...action.payload,
          reason: action.reason,
          dispatched_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
      dispatched++;
    } catch (err: any) {
      console.error(`[EventBus] Failed to dispatch to ${action.target_agent}:`, err.message?.substring(0, 100));
      failed++;
    }
  }

  return { dispatched, failed };
}

// ─── Full Pipeline ──────────────────────────────────────────

/**
 * Run the complete event processing pipeline:
 * 1. CEO reads events
 * 2. CEO decides actions
 * 3. Dispatcher sends orders to agents
 *
 * Called by CEO cron job.
 */
export async function processEventPipeline(
  supabase: SupabaseClient,
  orgId?: string,
): Promise<{ events: number; actions: number; dispatched: number }> {
  const actions = await ceoProcessEvents(supabase, orgId);

  if (actions.length === 0) {
    return { events: 0, actions: 0, dispatched: 0 };
  }

  const { dispatched } = await dispatchActions(supabase, actions);

  return {
    events: actions.length,
    actions: actions.length,
    dispatched,
  };
}

// ─── Helpers ────────────────────────────────────────────────

async function markEventsProcessed(supabase: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await supabase
    .from('agent_logs')
    .update({ status: 'processed' })
    .in('id', ids);
}

// ─── Convenience emitters for common events ─────────────────

export const Events = {
  prospectHot: (supabase: SupabaseClient, prospectId: string, company: string, source: string, orgId?: string) =>
    emitEvent(supabase, { agent: source, type: EVENT_TYPES.PROSPECT_HOT, data: { prospect_id: prospectId, company }, priority: 'high', requires_action: true, org_id: orgId }),

  prospectReplied: (supabase: SupabaseClient, prospectId: string, company: string, intent: string, source: string, orgId?: string) =>
    emitEvent(supabase, { agent: source, type: EVENT_TYPES.PROSPECT_REPLIED, data: { prospect_id: prospectId, company, intent }, priority: intent === 'interested' ? 'critical' : 'medium', requires_action: intent !== 'negative', org_id: orgId }),

  emailClicked: (supabase: SupabaseClient, prospectId: string, company: string, url: string, orgId?: string) =>
    emitEvent(supabase, { agent: 'email', type: EVENT_TYPES.EMAIL_CLICKED, data: { prospect_id: prospectId, company, url }, priority: 'high', requires_action: true, org_id: orgId }),

  chatbotLead: (supabase: SupabaseClient, prospectId: string, email: string, type: string, orgId?: string) =>
    emitEvent(supabase, { agent: 'chatbot', type: EVENT_TYPES.CHATBOT_LEAD_CAPTURED, data: { prospect_id: prospectId, email, business_type: type }, priority: 'high', requires_action: true, org_id: orgId }),

  whatsappLead: (supabase: SupabaseClient, prospectId: string, phone: string, orgId?: string) =>
    emitEvent(supabase, { agent: 'whatsapp', type: EVENT_TYPES.WHATSAPP_LEAD, data: { prospect_id: prospectId, phone }, priority: 'high', requires_action: true, org_id: orgId }),

  contentPublished: (supabase: SupabaseClient, platform: string, format: string, postId: string, orgId?: string) =>
    emitEvent(supabase, { agent: 'content', type: EVENT_TYPES.CONTENT_PUBLISHED, data: { platform, format, post_id: postId }, priority: 'low', requires_action: false, org_id: orgId }),

  agentFailed: (supabase: SupabaseClient, agent: string, error: string, orgId?: string) =>
    emitEvent(supabase, { agent, type: EVENT_TYPES.AGENT_FAILED, data: { error: error.substring(0, 500) }, priority: 'critical', requires_action: true, org_id: orgId }),

  clientConverted: (supabase: SupabaseClient, prospectId: string, company: string, plan: string, orgId?: string) =>
    emitEvent(supabase, { agent: 'commercial', type: EVENT_TYPES.CLIENT_CONVERTED, data: { prospect_id: prospectId, company, plan }, priority: 'critical', requires_action: true, org_id: orgId }),
};
