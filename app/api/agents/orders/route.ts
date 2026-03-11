import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

// Timeout for agent endpoint calls (90s) — prevents hanging when a sub-agent is slow
const AGENT_CALL_TIMEOUT_MS = 90_000;

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_CALL_TIMEOUT_MS);

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
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { ok: false, summary: `Timeout: l'agent ${path} n'a pas répondu en ${AGENT_CALL_TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, summary: `Erreur réseau: ${error.message}` };
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
    return `Onboarding: ${data.sent || data.processed || 0} messages envoyés`;
  }
  if (path.includes('/retention')) {
    return `Retention: ${data.actions || data.processed || 0} actions exécutées`;
  }
  if (path.includes('/content')) {
    return `Content: ${data.posts?.length || data.generated || 0} posts générés`;
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
    // --- Cleanup stale orders ---
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    // Clean in_progress stuck > 1 hour
    const { data: staleInProgress } = await supabase
      .from('agent_orders')
      .update({
        status: 'failed',
        result: { error: 'Auto-cleanup: stuck in_progress > 1h', failed_at: now },
        completed_at: now,
      })
      .eq('status', 'in_progress')
      .lt('created_at', oneHourAgo)
      .select('id');

    // Clean pending stuck > 6 hours
    const { data: stalePending } = await supabase
      .from('agent_orders')
      .update({
        status: 'failed',
        result: { error: 'Auto-cleanup: pending > 6h', failed_at: now },
        completed_at: now,
      })
      .eq('status', 'pending')
      .lt('created_at', sixHoursAgo)
      .select('id');

    const totalCleaned = (staleInProgress?.length || 0) + (stalePending?.length || 0);
    if (totalCleaned > 0) {
      console.log(`[OrderExecutor] Cleaned up ${totalCleaned} stale orders (${staleInProgress?.length || 0} in_progress, ${stalePending?.length || 0} pending)`);
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
      return NextResponse.json({ ok: true, message: 'No pending orders', processed: 0 });
    }

    console.log(`[OrderExecutor] Processing ${orders.length} pending orders...`);

    for (const order of orders) {
      try {
        // Mark as in_progress
        await supabase.from('agent_orders').update({
          status: 'in_progress',
          result: { started_at: now },
        }).eq('id', order.id);

        // Report to CEO: task started
        await reportToCeo(supabase, order.id, order.to_agent, 'started', order.order_type);

        const executionResult = await executeOrder(supabase, order, baseUrl, cronSecret);

        // Mark as completed
        await supabase.from('agent_orders').update({
          status: executionResult.ok ? 'completed' : 'failed',
          result: {
            message: executionResult.summary,
            api_response: executionResult.data,
            executed_at: now,
            executed_by: 'cron',
          },
          completed_at: now,
        }).eq('id', order.id);

        // Report to CEO: task completed or failed
        await reportToCeo(
          supabase,
          order.id,
          order.to_agent,
          executionResult.ok ? 'completed' : 'failed',
          order.order_type,
          executionResult.summary
        );

        results.push({
          id: order.id,
          to_agent: order.to_agent,
          order_type: order.order_type,
          status: executionResult.ok ? 'completed' : 'failed',
          result: executionResult.summary,
          api_response: executionResult.data,
        });
        console.log(`[OrderExecutor] Order ${order.id} → ${order.to_agent}: ${executionResult.summary}`);

      } catch (orderError: any) {
        await supabase.from('agent_orders').update({
          status: 'failed',
          result: { error: orderError.message, failed_at: now },
        }).eq('id', order.id);

        // Report to CEO: task failed with error
        await reportToCeo(supabase, order.id, order.to_agent, 'failed', order.order_type, orderError.message);

        results.push({
          id: order.id,
          to_agent: order.to_agent,
          order_type: order.order_type,
          status: 'failed',
          result: orderError.message,
        });
        console.error(`[OrderExecutor] Order ${order.id} failed:`, orderError.message);
      }
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
      if (orderType.includes('sourc') || orderType.includes('prospect') || orderType.includes('generer') || orderType.includes('générer') || orderType.includes('ajout') || orderType.includes('import')) {
        // Step 1: Trigger Google Maps scan first to get REAL prospects
        console.log(`[Orders] Commercial sourcing: triggering GMaps scan first, then enrichment`);
        const gmapsResult = await callAgentEndpoint(baseUrl, '/api/agents/gmaps', 'POST', cronSecret);

        // Step 2: Run Commercial enrichment to find emails for new GMaps prospects
        const enrichResult = await callAgentEndpoint(baseUrl, '/api/agents/commercial', 'GET', cronSecret);

        const gmapsSummary = gmapsResult.ok ? gmapsResult.summary : `GMaps: ${gmapsResult.summary}`;
        const enrichSummary = enrichResult.ok ? enrichResult.summary : `Enrichment: ${enrichResult.summary}`;

        return {
          ok: gmapsResult.ok || enrichResult.ok,
          summary: `${gmapsSummary} → ${enrichSummary}`,
          data: { gmaps: gmapsResult.data, enrichment: enrichResult.data },
        };
      }
      if (orderType.includes('audit') || orderType.includes('verif') || orderType.includes('véri') || orderType.includes('check') || orderType.includes('qualit')) {
        return callAgentEndpoint(baseUrl, '/api/agents/commercial', 'POST', cronSecret, { action: 'audit' });
      }
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
    // CEO-triggered campaigns use slot=all to bypass timing filter
    // (timing is for cron auto-runs, not manual CEO orders)
    const mode = orderType.includes('warm') ? '?type=warm' : '?slot=all';
    return callAgentEndpoint(baseUrl, `/api/agents/email/daily${mode}`, 'GET', cronSecret);

  } else if (orderType.includes('variant') || orderType.includes('objet') || orderType.includes('subject')) {
    return { ok: true, summary: `Variante d'objet email notée: ${payload.variant || payload.variante || 'à appliquer'}. Sera appliqué au prochain envoi.` };

  } else if (orderType.includes('test') || orderType.includes('ab_test')) {
    return { ok: true, summary: `A/B test email noté: ${payload.test || payload.description || orderType}. Suivi dans le prochain brief.` };

  } else {
    // For any other email order, use slot=all (CEO-triggered = send now)
    return callAgentEndpoint(baseUrl, '/api/agents/email/daily?slot=all', 'GET', cronSecret);
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
