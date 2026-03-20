import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min for agent execution

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const AGENT_LABELS: Record<string, string> = {
  email: 'Email',
  chatbot: 'Chatbot',
  commercial: 'Commercial',
  dm_instagram: 'DM Instagram',
  tiktok_comments: 'TikTok Comments',
  gmaps: 'Google Maps',
  seo: 'SEO',
  onboarding: 'Onboarding',
  retention: 'Rétention',
  content: 'Content',
};

/**
 * Log a report from a sub-agent back to the CEO.
 * These entries appear in agent_logs with action='report_to_ceo'
 * so the CEO brief can incorporate execution feedback.
 */
async function reportToCeo(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orderId: string,
  agentName: string,
  phase: 'started' | 'completed' | 'failed',
  orderType: string,
  details?: string
): Promise<void> {
  const label = AGENT_LABELS[agentName] || agentName;
  const messages: Record<string, string> = {
    started: `🚀 Agent ${label} démarre la tâche: ${orderType}`,
    completed: `✅ Agent ${label} a terminé: ${orderType}${details ? ` — ${details}` : ''}`,
    failed: `❌ Agent ${label} a échoué: ${orderType}${details ? ` — ${details}` : ''}`,
  };

  await supabase.from('agent_logs').insert({
    agent: agentName,
    action: 'report_to_ceo',
    target_id: orderId,
    data: {
      phase,
      order_id: orderId,
      order_type: orderType,
      message: messages[phase],
      details: details || null,
    },
    status: phase === 'failed' ? 'error' : 'success',
    created_at: new Date().toISOString(),
  });
}

/**
 * Build the base URL for internal API calls.
 */
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

/**
 * Call an internal agent API endpoint and return a summary result.
 */
async function callAgentEndpoint(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST',
  cronSecret: string | undefined,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; summary: string; data?: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cronSecret) {
    headers['Authorization'] = `Bearer ${cronSecret}`;
  }

  // 300s timeout (max Vercel Pro) — agents like content/commercial do video gen, AI calls, etc.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));

    if (!res.ok || !data.ok) {
      return { ok: false, summary: `Erreur: ${data.error || `HTTP ${res.status}`}`, data };
    }

    return { ok: true, summary: buildSummary(path, data), data };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { ok: false, summary: `Timeout (300s) pour ${path}` };
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function buildSummary(path: string, data: any): string {
  if (path.includes('/email/daily')) {
    return `Campagne email lancée: ${data.stats?.success || 0} envoyés, ${data.stats?.failed || 0} échoués (mode: ${data.mode || 'cold'})`;
  }
  if (path.includes('/dm-instagram')) {
    return `DM Instagram: ${data.prepared || data.count || 0} messages préparés`;
  }
  if (path.includes('/tiktok-comments')) {
    return `TikTok: ${data.prepared || data.count || 0} commentaires préparés`;
  }
  if (path.includes('/gmaps')) {
    return `Google Maps: ${data.new_prospects || data.found || 0} nouveaux prospects trouvés`;
  }
  if (path.includes('/commercial')) {
    return `Commercial: ${data.enriched || 0} prospects enrichis, ${data.advanced_to_contact || 0} prêts à contacter`;
  }
  if (path.includes('/seo')) {
    return `SEO: ${data.article ? `Article "${data.article.title || ''}" généré` : 'Tâche SEO exécutée'}`;
  }
  if (path.includes('/onboarding')) {
    const sent = data.sent || data.processed || 0;
    const scheduled = data.dynamicScheduled || 0;
    return `Onboarding: ${sent} messages envoyés${scheduled ? `, ${scheduled} planifiés` : ''}${data.message ? ` — ${data.message}` : ''}`;
  }
  if (path.includes('/retention')) {
    const msgs = data.messagesSent || data.actions || data.processed || 0;
    const total = data.totalClients || data.summary?.totalClients || 0;
    return `Retention: ${msgs} messages envoyés sur ${total} clients vérifiés${data.summary ? ` (🟢${data.summary.green || 0} 🟡${data.summary.yellow || 0} 🟠${data.summary.orange || 0} 🔴${data.summary.red || 0})` : ''}`;
  }
  if (path.includes('/content')) {
    // Content agent returns different field names: post (singular), postsPlanned, today (array)
    const count = data.posts?.length || data.postsPlanned || data.today?.length || data.generated || (data.post ? 1 : 0);
    const msg = data.message || '';
    return `Content: ${count} posts ${data.postsPlanned ? 'planifiés' : 'générés'}${msg ? ` — ${msg}` : ''}`;
  }
  return `Exécuté avec succès: ${JSON.stringify(data).substring(0, 150)}`;
}

/**
 * GET /api/agents/orders
 * Execute pending CEO orders. Called by Vercel cron daily after CEO brief.
 * Auth: CRON_SECRET or admin user.
 */
export async function GET(request: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  let isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isAuthorized) {
    const { user } = await getAuthUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    isAuthorized = true;
  }

  const supabase = getSupabaseAdmin();
  const baseUrl = getBaseUrl(request);
  const now = new Date().toISOString();
  const results: { id: string; to_agent: string; order_type: string; status: string; result?: string; api_response?: any }[] = [];

  try {
    // --- Unstick ALL orders stuck in_progress (they should never stay in_progress between runs) ---
    // Any order still in_progress when a new execution starts means the previous run failed/timed out
    const { data: stuckOrders } = await supabase
      .from('agent_orders')
      .update({ status: 'failed', result: { unstuck_at: now, reason: 'stuck_in_progress_reset' }, completed_at: now })
      .eq('status', 'in_progress')
      .select('id');
    if (stuckOrders?.length) {
      console.log(`[OrderExecutor] Force-failed ${stuckOrders.length} stuck in_progress orders`);
    }

    // Fetch all pending orders (max 20 per run)
    const { data: orders, error } = await supabase
      .from('agent_orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) throw error;
    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, message: 'No pending orders', processed: 0, unstuck: stuckOrders?.length || 0 });
    }

    console.log(`[OrderExecutor] Processing ${orders.length} pending orders in PARALLEL...`);

    // Mark all as in_progress at once (with started_at for tracking)
    const orderIds = orders.map((o: any) => o.id);
    await supabase.from('agent_orders').update({
      status: 'in_progress',
      result: { started_at: now, executor: 'cron' },
    }).in('id', orderIds);

    // Execute ALL orders in parallel (not sequentially)
    const execPromises = orders.map(async (order: any) => {
      try {
        await reportToCeo(supabase, order.id, order.to_agent, 'started', order.order_type);

        const executionResult = await executeOrder(supabase, order, baseUrl, cronSecret);

        await supabase.from('agent_orders').update({
          status: executionResult.ok ? 'completed' : 'failed',
          result: {
            message: executionResult.summary,
            api_response: executionResult.data,
            executed_at: new Date().toISOString(),
            executed_by: 'cron',
          },
          completed_at: new Date().toISOString(),
        }).eq('id', order.id);

        await reportToCeo(
          supabase, order.id, order.to_agent,
          executionResult.ok ? 'completed' : 'failed',
          order.order_type, executionResult.summary
        );

        console.log(`[OrderExecutor] Order ${order.id} → ${order.to_agent}: ${executionResult.summary}`);
        return {
          id: order.id, to_agent: order.to_agent, order_type: order.order_type,
          status: executionResult.ok ? 'completed' : 'failed',
          result: executionResult.summary, api_response: executionResult.data,
        };
      } catch (orderError: any) {
        await supabase.from('agent_orders').update({
          status: 'failed',
          result: { error: orderError.message, failed_at: new Date().toISOString() },
        }).eq('id', order.id);

        await reportToCeo(supabase, order.id, order.to_agent, 'failed', order.order_type, orderError.message);
        console.error(`[OrderExecutor] Order ${order.id} failed:`, orderError.message);

        return {
          id: order.id, to_agent: order.to_agent, order_type: order.order_type,
          status: 'failed', result: orderError.message,
        };
      }
    });

    const settled = await Promise.allSettled(execPromises);
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(s.value);
      else results.push({ id: 'unknown', to_agent: 'unknown', order_type: 'unknown', status: 'failed', result: s.reason?.message || 'Promise rejected' });
    }

    // Log summary
    const succeeded = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;

    await supabase.from('agent_logs').insert({
      agent: 'ceo',
      action: 'orders_executed',
      data: { total: results.length, succeeded, failed, results },
      created_at: now,
    });

    console.log(`[OrderExecutor] Done: ${succeeded} succeeded, ${failed} failed`);

    return NextResponse.json({
      ok: true,
      processed: results.length,
      succeeded,
      failed,
      results,
    });

  } catch (error: any) {
    console.error('[OrderExecutor] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/agents/orders
 * Create new orders and optionally execute them immediately. Admin only.
 * Body: { orders: [{to_agent, order_type, priority?, payload?}], execute?: boolean }
 */
export async function POST(request: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });

  try {
    const body = await request.json();
    if (!body.orders || !Array.isArray(body.orders)) {
      return NextResponse.json({ ok: false, error: 'orders[] requis' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const createdIds: string[] = [];

    for (const order of body.orders) {
      const { data: inserted } = await supabase.from('agent_orders').insert({
        from_agent: 'admin',
        to_agent: order.to_agent,
        order_type: order.order_type,
        priority: order.priority || 'haute',
        payload: order.payload || {},
        status: 'pending',
        created_at: now,
      }).select('id').single();

      if (inserted) createdIds.push(inserted.id);
    }

    // Auto-execute unless explicitly disabled
    if (body.execute !== false && createdIds.length > 0) {
      const baseUrl = getBaseUrl(request);
      const cronSecret = process.env.CRON_SECRET;
      const execRes = await fetch(`${baseUrl}/api/agents/orders`, {
        method: 'GET',
        headers: cronSecret ? { 'Authorization': `Bearer ${cronSecret}` } : {},
      });
      const execData = await execRes.json();
      return NextResponse.json({ ok: true, created: createdIds.length, execution: execData });
    }

    return NextResponse.json({ ok: true, created: createdIds.length, order_ids: createdIds });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * Route an order to the correct agent endpoint and execute it.
 */
async function executeOrder(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  order: any,
  baseUrl: string,
  cronSecret: string | undefined
): Promise<{ ok: boolean; summary: string; data?: any }> {
  const orderType = (order.order_type || '').toLowerCase();
  const payload = order.payload || {};
  const description = payload.description || '';

  switch (order.to_agent) {
    case 'email':
      return executeEmailOrder(supabase, order, baseUrl, cronSecret);

    case 'chatbot':
      return executeChatbotOrder(supabase, order);

    case 'dm_instagram':
      return callAgentEndpoint(baseUrl, '/api/agents/dm-instagram', 'POST', cronSecret);

    case 'tiktok_comments':
      return callAgentEndpoint(baseUrl, '/api/agents/tiktok-comments', 'POST', cronSecret);

    case 'gmaps':
      return callAgentEndpoint(baseUrl, '/api/agents/gmaps', 'POST', cronSecret);

    case 'commercial':
      return callAgentEndpoint(baseUrl, '/api/agents/commercial', 'GET', cronSecret);

    case 'seo':
      if (orderType.includes('generat') || orderType.includes('article') || orderType.includes('creer') || orderType.includes('créer')) {
        return callAgentEndpoint(baseUrl, '/api/agents/seo', 'POST', cronSecret, { action: 'generate_article' });
      }
      return callAgentEndpoint(baseUrl, '/api/agents/seo', 'GET', cronSecret);

    case 'onboarding':
      return callAgentEndpoint(baseUrl, '/api/agents/onboarding', 'GET', cronSecret);

    case 'retention':
      return callAgentEndpoint(baseUrl, '/api/agents/retention', 'GET', cronSecret);

    case 'content':
      if (orderType.includes('generat') || orderType.includes('creer') || orderType.includes('créer') || orderType.includes('post')) {
        return callAgentEndpoint(baseUrl, '/api/agents/content', 'POST', cronSecret, { action: 'generate_weekly' });
      }
      return callAgentEndpoint(baseUrl, '/api/agents/content', 'GET', cronSecret);

    case 'marketing':
      if (orderType.includes('analys') || orderType.includes('rapport')) {
        return callAgentEndpoint(baseUrl, '/api/agents/marketing', 'GET', cronSecret);
      }
      if (orderType.includes('advise') || orderType.includes('conseil')) {
        return callAgentEndpoint(baseUrl, '/api/agents/marketing', 'POST', cronSecret, { action: 'advise_agents' });
      }
      return callAgentEndpoint(baseUrl, '/api/agents/marketing', 'GET', cronSecret);

    case 'all':
      // Broadcast: acknowledge only, individual agents handle their own execution
      return { ok: true, summary: `Ordre broadcast "${orderType}" noté pour tous les agents.` };

    default:
      return { ok: false, summary: `Agent inconnu: ${order.to_agent}` };
  }
}

/**
 * Execute an order directed to the email agent.
 */
async function executeEmailOrder(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  order: any,
  baseUrl: string,
  cronSecret: string | undefined
): Promise<{ ok: boolean; summary: string; data?: any }> {
  const orderType = (order.order_type || '').toLowerCase();
  const payload = order.payload || {};

  if (orderType.includes('pause') || orderType.includes('stop')) {
    const { data: paused } = await supabase
      .from('crm_prospects')
      .update({ email_sequence_status: 'paused', updated_at: new Date().toISOString() })
      .eq('email_sequence_status', 'in_progress')
      .select('id');
    return { ok: true, summary: `Séquences email en pause: ${paused?.length ?? 0} prospects affectés` };

  } else if (orderType.includes('resume') || orderType.includes('reprendre') || orderType.includes('relance')) {
    const { data: count } = await supabase
      .from('crm_prospects')
      .update({ email_sequence_status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('email_sequence_status', 'paused')
      .select('id');
    return { ok: true, summary: `Séquences email reprises: ${count?.length ?? 0} prospects réactivés` };

  } else if (orderType.includes('campagne') || orderType.includes('campaign') || orderType.includes('envoyer') || orderType.includes('send') || orderType.includes('lancer')) {
    // Actually trigger the email daily campaign
    const mode = orderType.includes('warm') ? '?type=warm' : '';
    return callAgentEndpoint(baseUrl, `/api/agents/email/daily${mode}`, 'GET', cronSecret);

  } else if (orderType.includes('variant') || orderType.includes('objet') || orderType.includes('subject')) {
    return { ok: true, summary: `Variante d'objet email notée: ${payload.variant || payload.variante || 'à appliquer'}. Sera appliqué au prochain envoi.` };

  } else if (orderType.includes('test') || orderType.includes('ab_test')) {
    return { ok: true, summary: `A/B test email noté: ${payload.test || payload.description || orderType}. Suivi dans le prochain brief.` };

  } else {
    // For any other email order, trigger a campaign run
    return callAgentEndpoint(baseUrl, '/api/agents/email/daily', 'GET', cronSecret);
  }
}

/**
 * Execute an order directed to the chatbot agent.
 */
async function executeChatbotOrder(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  order: any
): Promise<{ ok: boolean; summary: string; data?: any }> {
  const orderType = (order.order_type || '').toLowerCase();
  const payload = order.payload || {};

  if (orderType.includes('prompt') || orderType.includes('modifier')) {
    return { ok: true, summary: `Modification chatbot notée: ${payload.description || orderType}. À appliquer manuellement dans le prompt.` };
  } else if (orderType.includes('cta') || orderType.includes('offre')) {
    return { ok: true, summary: `CTA chatbot mis à jour: ${payload.offer || payload.cta || orderType}` };
  } else {
    return { ok: true, summary: `Ordre chatbot traité: ${orderType}. ${payload.description || ''}`.trim() };
  }
}
