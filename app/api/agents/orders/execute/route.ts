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
 * POST /api/agents/orders/execute
 * Execute specific pending orders by IDs (admin only, no cron).
 * Body: { order_ids: string[] }
 */
export async function POST(request: NextRequest) {
  // Admin auth only
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

  const now = new Date().toISOString();
  const results: Array<{ id: string; status: string; result?: string }> = [];

  // Fetch the orders
  const { data: orders, error: fetchError } = await supabase
    .from('agent_orders')
    .select('*')
    .in('id', order_ids)
    .eq('status', 'pending');

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, message: 'Aucun ordre pending trouvé', processed: 0 });
  }

  console.log(`[ExecuteNow] Admin executing ${orders.length} orders...`);

  for (const order of orders) {
    try {
      await supabase.from('agent_orders').update({ status: 'in_progress' }).eq('id', order.id);

      let resultText = '';
      const payload = order.payload || {};
      const orderType = (order.order_type || '').toLowerCase();

      if (order.to_agent === 'email') {
        if (orderType.includes('pause') || orderType.includes('stop')) {
          const { data: paused } = await supabase
            .from('crm_prospects')
            .update({ email_sequence_status: 'paused', updated_at: now })
            .eq('email_sequence_status', 'in_progress')
            .select('id');
          resultText = `Séquences email en pause: ${paused?.length ?? 0} prospects`;
        } else if (orderType.includes('resume') || orderType.includes('reprendre')) {
          const { data: resumed } = await supabase
            .from('crm_prospects')
            .update({ email_sequence_status: 'in_progress', updated_at: now })
            .eq('email_sequence_status', 'paused')
            .select('id');
          resultText = `Séquences email reprises: ${resumed?.length ?? 0} prospects`;
        } else {
          resultText = `Ordre email traité: ${orderType}. ${payload.description || ''}`.trim();
        }
      } else if (order.to_agent === 'chatbot') {
        resultText = `Ordre chatbot traité: ${orderType}. ${payload.description || ''}`.trim();
      } else if (order.to_agent === 'gmaps') {
        resultText = `Ordre Google Maps noté: ${orderType}. ${payload.description || ''}`.trim();
      } else if (order.to_agent === 'dm_instagram') {
        resultText = `Ordre DM Instagram noté: ${orderType}. ${payload.description || ''}`.trim();
      } else if (order.to_agent === 'tiktok_comments') {
        resultText = `Ordre TikTok noté: ${orderType}. ${payload.description || ''}`.trim();
      } else if (order.to_agent === 'seo') {
        resultText = `Ordre SEO noté: ${orderType}. ${payload.description || ''}`.trim();
      } else if (order.to_agent === 'onboarding') {
        resultText = `Ordre Onboarding noté: ${orderType}. ${payload.description || ''}`.trim();
      } else if (order.to_agent === 'retention') {
        resultText = `Ordre Retention noté: ${orderType}. ${payload.description || ''}`.trim();
      } else if (order.to_agent === 'content') {
        resultText = `Ordre Content noté: ${orderType}. ${payload.description || ''}`.trim();
      } else {
        resultText = `Agent inconnu: ${order.to_agent}`;
      }

      await supabase.from('agent_orders').update({
        status: 'completed',
        result: { message: resultText, executed_at: now, executed_by: 'admin_manual' },
        completed_at: now,
      }).eq('id', order.id);

      results.push({ id: order.id, status: 'completed', result: resultText });
    } catch (e: any) {
      await supabase.from('agent_orders').update({
        status: 'failed',
        result: { error: e.message, failed_at: now },
      }).eq('id', order.id);
      results.push({ id: order.id, status: 'failed', result: e.message });
    }
  }

  const succeeded = results.filter(r => r.status === 'completed').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(`[ExecuteNow] Done: ${succeeded} succeeded, ${failed} failed`);

  return NextResponse.json({ ok: true, processed: results.length, succeeded, failed, results });
}
