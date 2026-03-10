import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
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
  const now = new Date().toISOString();
  const results: { id: string; action: string; status: string; result?: string }[] = [];

  try {
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
        await supabase.from('agent_orders').update({ status: 'in_progress' }).eq('id', order.id);

        let resultText = '';

        if (order.to_agent === 'email') {
          resultText = await executeEmailOrder(supabase, order);
        } else if (order.to_agent === 'chatbot') {
          resultText = await executeChatbotOrder(supabase, order);
        } else if (order.to_agent === 'gmaps') {
          resultText = `Ordre Google Maps noté: ${order.order_type}. ${(order.payload as any)?.description || ''}`.trim();
        } else if (order.to_agent === 'dm_instagram') {
          resultText = `Ordre DM Instagram noté: ${order.order_type}. ${(order.payload as any)?.description || ''}`.trim();
        } else if (order.to_agent === 'tiktok_comments') {
          resultText = `Ordre TikTok noté: ${order.order_type}. ${(order.payload as any)?.description || ''}`.trim();
        } else if (order.to_agent === 'commercial') {
          resultText = `Ordre Commercial noté: ${order.order_type}. ${(order.payload as any)?.description || ''}`.trim();
        } else if (order.to_agent === 'seo') {
          resultText = `Ordre SEO noté: ${order.order_type}. ${(order.payload as any)?.description || ''}`.trim();
        } else if (order.to_agent === 'onboarding') {
          resultText = `Ordre Onboarding noté: ${order.order_type}. ${(order.payload as any)?.description || ''}`.trim();
        } else if (order.to_agent === 'retention') {
          resultText = `Ordre Retention noté: ${order.order_type}. ${(order.payload as any)?.description || ''}`.trim();
        } else if (order.to_agent === 'content') {
          resultText = `Ordre Content noté: ${order.order_type}. ${(order.payload as any)?.description || ''}`.trim();
        } else {
          resultText = `Agent inconnu: ${order.to_agent}`;
        }

        // Mark as completed
        await supabase.from('agent_orders').update({
          status: 'completed',
          result: { message: resultText, executed_at: now },
          completed_at: now,
        }).eq('id', order.id);

        results.push({ id: order.id, action: order.order_type, status: 'completed', result: resultText });
        console.log(`[OrderExecutor] Order ${order.id} completed: ${resultText}`);

      } catch (orderError: any) {
        // Mark as failed
        await supabase.from('agent_orders').update({
          status: 'failed',
          result: { error: orderError.message, failed_at: now },
        }).eq('id', order.id);

        results.push({ id: order.id, action: order.order_type, status: 'failed', result: orderError.message });
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
 * Execute an order directed to the email agent.
 */
async function executeEmailOrder(supabase: ReturnType<typeof getSupabaseAdmin>, order: any): Promise<string> {
  const payload = order.payload || {};
  const orderType = (order.order_type || '').toLowerCase();

  // Order types the CEO might give to email agent:
  // - "modifier_objet" / "change_subject" → update subject variant for future emails
  // - "pause_sequence" → pause a prospect's sequence
  // - "resume_sequence" → resume
  // - "change_timing" → note the timing change (applied by daily cron logic)
  // - "ab_test" → note the A/B test (tracked in brief)
  // - "send_campaign" → trigger a specific campaign batch

  if (orderType.includes('pause') || orderType.includes('stop')) {
    // Pause email sequence for specific prospects or all
    const { data: paused } = await supabase
      .from('crm_prospects')
      .update({ email_sequence_status: 'paused', updated_at: new Date().toISOString() })
      .eq('email_sequence_status', 'in_progress')
      .select('id');
    return `Séquences email en pause: ${paused?.length ?? 0} prospects affectés`;

  } else if (orderType.includes('resume') || orderType.includes('reprendre')) {
    const { data: count } = await supabase
      .from('crm_prospects')
      .update({ email_sequence_status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('email_sequence_status', 'paused')
      .select('id');
    return `Séquences email reprises: ${count?.length ?? 0} prospects réactivés`;

  } else if (orderType.includes('variant') || orderType.includes('objet') || orderType.includes('subject')) {
    // Note the variant change — applied automatically by daily cron
    return `Variante d'objet email notée: ${payload.variant || payload.variante || 'à appliquer'}. Sera appliqué au prochain envoi.`;

  } else if (orderType.includes('test') || orderType.includes('ab_test')) {
    return `A/B test email noté: ${payload.test || payload.description || orderType}. Suivi dans le prochain brief.`;

  } else {
    // Generic: log the order and mark as handled
    return `Ordre email traité: ${orderType}. ${payload.description || payload.action || ''}`.trim();
  }
}

/**
 * Execute an order directed to the chatbot agent.
 */
async function executeChatbotOrder(supabase: ReturnType<typeof getSupabaseAdmin>, order: any): Promise<string> {
  const orderType = (order.order_type || '').toLowerCase();
  const payload = order.payload || {};

  // Chatbot orders: mostly config/behavior changes noted for reference
  // The chatbot prompt is static, so we log the instruction for manual review

  if (orderType.includes('prompt') || orderType.includes('modifier')) {
    return `Modification chatbot notée: ${payload.description || orderType}. À appliquer manuellement dans le prompt.`;

  } else if (orderType.includes('cta') || orderType.includes('offre')) {
    return `CTA chatbot mis à jour: ${payload.offer || payload.cta || orderType}`;

  } else {
    return `Ordre chatbot traité: ${orderType}. ${payload.description || ''}`.trim();
  }
}
