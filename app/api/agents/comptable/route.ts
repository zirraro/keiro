import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getComptableSystemPrompt, getComptableMessagePrompt } from '@/lib/agents/comptable-prompt';
import { callGemini } from '@/lib/agents/gemini';
import { saveLearning, saveAgentFeedback } from '@/lib/agents/learning';
import { getAvatarPromptBlock } from '@/lib/agents/avatar';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function verifyAuth(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { authorized: true, isCron: true };
  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false };
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    if (profile?.is_admin) return { authorized: true, isAdmin: true };
  } catch {}
  return { authorized: false };
}

// ─── GET: Daily financial summary (cron or manual) ─────────────

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();

  try {
    // 1. Count paying clients and calculate MRR
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, plan, first_name, business_type, created_at')
      .not('plan', 'in', '("gratuit","free","")');

    const planPrices: Record<string, number> = {
      sprint: 4.99, solo: 49, solo_promo: 49, pro: 89, fondateurs: 149,
      standard: 199, business: 349, elite: 999,
    };

    let mrr = 0;
    const clientsByPlan: Record<string, number> = {};
    for (const p of profiles || []) {
      const price = planPrices[p.plan] || 0;
      mrr += price;
      clientsByPlan[p.plan] = (clientsByPlan[p.plan] || 0) + 1;
    }

    const totalClients = profiles?.length || 0;

    // 2. Calculate API costs (from agent_logs last 24h)
    const since24h = new Date(Date.now() - 86400000).toISOString();
    const { data: recentLogs } = await supabase
      .from('agent_logs')
      .select('agent, action, data, created_at')
      .gte('created_at', since24h);

    // Estimate API costs from logs
    const apiCosts: Record<string, number> = {
      seedream: 0, kling: 0, claude: 0, elevenlabs: 0, resend: 0, brevo: 0,
    };
    for (const log of recentLogs || []) {
      if (log.action?.includes('email') || log.agent === 'email') apiCosts.brevo += 0.005;
      if (log.action?.includes('generate') || log.action?.includes('image')) apiCosts.seedream += 0.02;
      if (log.action?.includes('video')) apiCosts.kling += 0.15;
      if (log.action?.includes('chat') || log.action?.includes('brief') || log.action?.includes('analysis')) apiCosts.claude += 0.001;
    }

    // 3. Estimate burn rate (monthly extrapolation from daily costs)
    const dailyApiCost = Object.values(apiCosts).reduce((a, b) => a + b, 0);
    const monthlyApiCost = dailyApiCost * 30;
    const fixedCosts = 50; // Vercel + Supabase estimates
    const burnRate = monthlyApiCost + fixedCosts;
    const runway = burnRate > 0 ? Math.round((mrr > 0 ? mrr / burnRate : 0) * 10) / 10 : 0;

    // 4. Get credit consumption stats
    const { count: creditsUsed24h } = await supabase
      .from('credit_transactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since24h)
      .lt('amount', 0);

    // 5. Generate financial summary via AI
    const avatarBlock = await getAvatarPromptBlock(supabase, 'comptable');
    const systemPrompt = avatarBlock + '\n\n' + getComptableSystemPrompt();

    const messagePrompt = getComptableMessagePrompt('daily_summary', {
      mrr,
      totalClients,
      burnRate,
      apiCosts,
      runway,
      period: new Date().toLocaleDateString('fr-FR'),
    });

    const summary = await callGemini({ system: systemPrompt, message: messagePrompt, maxTokens: 1500 });

    // 6. Log the execution
    await supabase.from('agent_logs').insert({
      agent: 'comptable',
      action: 'daily_summary',
      status: 'success',
      data: {
        mrr,
        totalClients,
        clientsByPlan,
        burnRate: Math.round(burnRate * 100) / 100,
        runway,
        apiCosts24h: apiCosts,
        creditsUsed24h: creditsUsed24h || 0,
        summary: summary?.substring(0, 500),
      },
    });

    // 7. Save learning if interesting pattern
    if (mrr > 0 && burnRate > 0) {
      const marginPercent = ((mrr - burnRate) / mrr) * 100;
      if (marginPercent < 30) {
        await saveLearning(supabase, {
          agent: 'comptable',
          category: 'general',
          learning: `Marge brute à ${marginPercent.toFixed(1)}% — sous le seuil de 30%. Burn rate ${burnRate.toFixed(0)}€ vs MRR ${mrr.toFixed(0)}€.`,
          evidence: `Calcul du ${new Date().toLocaleDateString('fr-FR')}`,
          confidence: 45,
          revenue_linked: true,
        });
      }
    }

    // 8. Send feedback to CEO
    await saveAgentFeedback(supabase, {
      from_agent: 'comptable',
      to_agent: 'ceo',
      feedback: `Résumé financier : MRR ${mrr.toFixed(0)}€, ${totalClients} clients, burn rate ${burnRate.toFixed(0)}€/mois, runway ${runway} mois.`,
      category: 'general',
    });

    return NextResponse.json({
      success: true,
      data: {
        mrr,
        totalClients,
        clientsByPlan,
        burnRate: Math.round(burnRate * 100) / 100,
        runway,
        apiCosts,
        creditsUsed24h: creditsUsed24h || 0,
        summary,
      },
    });
  } catch (err: any) {
    console.error('[comptable] Error:', err);
    await supabase.from('agent_logs').insert({
      agent: 'comptable',
      action: 'daily_summary',
      status: 'error',
      data: { error: err.message },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: Manual actions (stats, forecast, invoice review) ────

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { action } = body;
  const supabase = getSupabaseAdmin();

  if (action === 'stats') {
    // Return current financial stats
    const { data: profiles } = await supabase
      .from('profiles')
      .select('plan')
      .not('plan', 'in', '("gratuit","free","")');

    const planPrices: Record<string, number> = {
      sprint: 4.99, solo: 49, solo_promo: 49, pro: 89, fondateurs: 149,
      standard: 199, business: 349, elite: 999,
    };

    let mrr = 0;
    const clientsByPlan: Record<string, number> = {};
    for (const p of profiles || []) {
      const price = planPrices[p.plan] || 0;
      mrr += price;
      clientsByPlan[p.plan] = (clientsByPlan[p.plan] || 0) + 1;
    }

    return NextResponse.json({
      mrr,
      totalClients: profiles?.length || 0,
      clientsByPlan,
    });
  }

  if (action === 'forecast') {
    const avatarBlock = await getAvatarPromptBlock(supabase, 'comptable');
    const systemPrompt = avatarBlock + '\n\n' + getComptableSystemPrompt();
    const messagePrompt = getComptableMessagePrompt('forecast', {
      mrr: body.mrr,
      totalClients: body.totalClients,
      burnRate: body.burnRate,
      runway: body.runway,
    });
    const result = await callGemini({ system: systemPrompt, message: messagePrompt, maxTokens: 2000 });
    return NextResponse.json({ success: true, forecast: result });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
