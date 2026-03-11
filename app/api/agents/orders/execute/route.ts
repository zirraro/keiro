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

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

// Timeout for agent endpoint calls (90s) — prevents hanging when a sub-agent is slow
const AGENT_CALL_TIMEOUT_MS = 90_000;

async function callAgentEndpoint(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST',
  cronSecret: string | undefined,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; summary: string; data?: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cronSecret) headers['Authorization'] = `Bearer ${cronSecret}`;

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
  if (path.includes('/email/daily')) return `Campagne email: ${data.stats?.success || 0} envoyés, ${data.stats?.failed || 0} échoués`;
  if (path.includes('/dm-instagram')) return `DM Instagram: ${data.prepared || data.count || 0} messages préparés`;
  if (path.includes('/tiktok-comments')) return `TikTok: ${data.prepared || data.count || 0} commentaires préparés`;
  if (path.includes('/gmaps')) return `Google Maps: ${data.new_prospects || data.found || 0} nouveaux prospects`;
  if (path.includes('/commercial')) return `Commercial: ${data.enriched || 0} enrichis, ${data.advanced_to_contact || 0} prêts`;
  if (path.includes('/seo')) return `SEO: ${data.article ? `Article généré` : 'Tâche exécutée'}`;
  if (path.includes('/onboarding')) return `Onboarding: ${data.sent || data.processed || 0} messages`;
  if (path.includes('/retention')) return `Retention: ${data.actions || data.processed || 0} actions`;
  if (path.includes('/content')) return `Content: ${data.posts?.length || data.generated || 0} posts`;
  return `Exécuté: ${JSON.stringify(data).substring(0, 150)}`;
}

/**
 * POST /api/agents/orders/execute
 * Execute specific pending orders by IDs (admin only).
 * Body: { order_ids: string[] }
 */
export async function POST(request: NextRequest) {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) {
    return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
  }

  const { order_ids } = await request.json();
  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'order_ids requis (array)' }, { status: 400 });
  }

  const baseUrl = getBaseUrl(request);
  const cronSecret = process.env.CRON_SECRET;
  const now = new Date().toISOString();
  const results: Array<{ id: string; to_agent: string; status: string; result?: string; api_response?: any }> = [];

  // --- Cleanup stale orders stuck in 'in_progress' for over 1 hour ---
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: staleOrders } = await supabase
    .from('agent_orders')
    .update({
      status: 'failed',
      result: { error: 'Auto-cleanup: stuck in_progress for over 1 hour', failed_at: now },
      completed_at: now,
    })
    .eq('status', 'in_progress')
    .lt('created_at', oneHourAgo)
    .select('id');

  if (staleOrders && staleOrders.length > 0) {
    console.log(`[ExecuteNow] Cleaned up ${staleOrders.length} stale in_progress orders`);
  }

  // Also allow re-executing failed orders that the user selected
  const { data: orders, error: fetchError } = await supabase
    .from('agent_orders')
    .select('*')
    .in('id', order_ids)
    .in('status', ['pending', 'failed']);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, message: 'Aucun ordre pending trouvé', processed: 0 });
  }

  console.log(`[ExecuteNow] Admin executing ${orders.length} orders...`);

  for (const order of orders) {
    try {
      await supabase.from('agent_orders').update({
        status: 'in_progress',
        result: { started_at: now, executed_by: 'admin_manual' },
      }).eq('id', order.id);

      const executionResult = await executeOrder(supabase, order, baseUrl, cronSecret);

      await supabase.from('agent_orders').update({
        status: executionResult.ok ? 'completed' : 'failed',
        result: {
          message: executionResult.summary,
          api_response: executionResult.data,
          executed_at: now,
          executed_by: 'admin_manual',
        },
        completed_at: now,
      }).eq('id', order.id);

      results.push({
        id: order.id,
        to_agent: order.to_agent,
        status: executionResult.ok ? 'completed' : 'failed',
        result: executionResult.summary,
        api_response: executionResult.data,
      });
    } catch (e: any) {
      await supabase.from('agent_orders').update({
        status: 'failed',
        result: { error: e.message, failed_at: now },
      }).eq('id', order.id);
      results.push({ id: order.id, to_agent: order.to_agent, status: 'failed', result: e.message });
    }
  }

  const succeeded = results.filter(r => r.status === 'completed').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(`[ExecuteNow] Done: ${succeeded} succeeded, ${failed} failed`);

  return NextResponse.json({ ok: true, processed: results.length, succeeded, failed, results });
}

/**
 * Route an order to the correct agent and execute it.
 */
async function executeOrder(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  order: any,
  baseUrl: string,
  cronSecret: string | undefined
): Promise<{ ok: boolean; summary: string; data?: any }> {
  const orderType = (order.order_type || '').toLowerCase();
  const payload = order.payload || {};

  switch (order.to_agent) {
    case 'email':
      return executeEmailOrder(supabase, order, baseUrl, cronSecret);

    case 'chatbot':
      return { ok: true, summary: `Ordre chatbot noté: ${orderType}. ${payload.description || ''}`.trim() };

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

    default:
      return { ok: false, summary: `Agent inconnu: ${order.to_agent}` };
  }
}

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
    return { ok: true, summary: `Séquences email en pause: ${paused?.length ?? 0} prospects` };

  } else if (orderType.includes('resume') || orderType.includes('reprendre') || orderType.includes('relance')) {
    const { data: count } = await supabase
      .from('crm_prospects')
      .update({ email_sequence_status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('email_sequence_status', 'paused')
      .select('id');
    return { ok: true, summary: `Séquences email reprises: ${count?.length ?? 0} prospects` };

  } else if (orderType.includes('campagne') || orderType.includes('campaign') || orderType.includes('envoyer') || orderType.includes('send') || orderType.includes('lancer')) {
    const mode = orderType.includes('warm') ? '?type=warm' : '';
    return callAgentEndpoint(baseUrl, `/api/agents/email/daily${mode}`, 'GET', cronSecret);

  } else {
    // Default: trigger email campaign
    return callAgentEndpoint(baseUrl, '/api/agents/email/daily', 'GET', cronSecret);
  }
}

/**
 * DELETE /api/agents/orders/execute
 * Purge stale orders: mark all in_progress > 1h and pending > 24h as failed.
 * Admin only.
 */
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) {
    return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Purge in_progress stuck > 1 hour
  const { data: staleInProgress } = await supabase
    .from('agent_orders')
    .update({ status: 'failed', result: { error: 'Manual purge: stuck in_progress', purged_at: now }, completed_at: now })
    .eq('status', 'in_progress')
    .lt('created_at', oneHourAgo)
    .select('id');

  // Purge pending stuck > 24 hours
  const { data: stalePending } = await supabase
    .from('agent_orders')
    .update({ status: 'failed', result: { error: 'Manual purge: pending > 24h', purged_at: now }, completed_at: now })
    .eq('status', 'pending')
    .lt('created_at', twentyFourHoursAgo)
    .select('id');

  const purgedCount = (staleInProgress?.length || 0) + (stalePending?.length || 0);
  console.log(`[ExecuteNow] Purged ${purgedCount} stale orders (${staleInProgress?.length || 0} in_progress, ${stalePending?.length || 0} pending)`);

  return NextResponse.json({
    ok: true,
    purged: purgedCount,
    in_progress_purged: staleInProgress?.length || 0,
    pending_purged: stalePending?.length || 0,
  });
}
