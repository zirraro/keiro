import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/agents/monthly-recap
 * Cron job: runs on the 1st of each month
 * Sends a personalized monthly recap email to all active paying users
 * Includes: performance summary, best posts, recommendations for next month
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !request.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const results: { userId: string; status: string; error?: string }[] = [];

  try {
    // Get all active users with paid plans
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name, email, subscription_plan, company_name, business_type, credits_balance')
      .not('subscription_plan', 'eq', 'free')
      .not('subscription_plan', 'is', null);

    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, message: 'No active users', results: [] });
    }

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const monthName = lastMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    for (const user of users) {
      try {
        // Gather user's monthly data
        const [chatStats, agentLogs, contentStats] = await Promise.all([
          // Chat messages count this month
          supabase
            .from('client_agent_chats')
            .select('agent_id, updated_at', { count: 'exact' })
            .eq('user_id', user.id)
            .gte('updated_at', lastMonth.toISOString())
            .lte('updated_at', lastMonthEnd.toISOString()),

          // Agent activity logs
          supabase
            .from('agent_logs')
            .select('agent_name, action, details, created_at')
            .eq('target_user_id', user.id)
            .gte('created_at', lastMonth.toISOString())
            .lte('created_at', lastMonthEnd.toISOString())
            .order('created_at', { ascending: false })
            .limit(50),

          // Generated content count
          supabase
            .from('user_visuals')
            .select('id, type, created_at', { count: 'exact' })
            .eq('user_id', user.id)
            .gte('created_at', lastMonth.toISOString())
            .lte('created_at', lastMonthEnd.toISOString()),
        ]);

        const totalChats = chatStats.count || 0;
        const totalContent = contentStats.count || 0;
        const agentActivities = agentLogs.data || [];

        // Group agent activities by agent
        const agentSummary: Record<string, number> = {};
        for (const log of agentActivities) {
          agentSummary[log.agent_name] = (agentSummary[log.agent_name] || 0) + 1;
        }

        // Generate AI-powered recap with recommendations
        const recapPrompt = `Tu es Ami, Directrice Strategie Marketing chez KeiroAI. Genere un recap mensuel personnalise pour ce client.

CLIENT: ${user.full_name || 'Client'}
ENTREPRISE: ${user.company_name || 'Non renseigne'} (${user.business_type || 'Non renseigne'})
PLAN: ${user.subscription_plan}
CREDITS RESTANTS: ${user.credits_balance || 0}

ACTIVITE DU MOIS (${monthName}):
- Messages agents: ${totalChats}
- Contenus generes: ${totalContent}
- Agents les plus utilises: ${Object.entries(agentSummary).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `${name} (${count}x)`).join(', ') || 'Aucun'}

GENERE UN EMAIL HTML PROFESSIONNEL avec:
1. Salutation personnalisee
2. Resume des performances du mois (chiffres cles)
3. Top 3 moments forts du mois
4. 3 recommandations concretes pour le mois suivant (specifiques au type de business)
5. Encouragement et motivation
6. CTA vers /assistant pour continuer

FORMAT: HTML inline styles, couleurs KeiroAI (#0c1a3a primary, #7c3aed purple accent), responsive, professionnel.
Tutoie le client. Sois enthousiaste mais pro. Max 400 mots.`;

        let emailHtml: string;

        if (process.env.ANTHROPIC_API_KEY) {
          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            messages: [{ role: 'user', content: recapPrompt }],
          });
          emailHtml = response.content[0].type === 'text' ? response.content[0].text : '';
        } else {
          emailHtml = `<h1>Recap ${monthName}</h1><p>${totalChats} interactions, ${totalContent} contenus generes.</p>`;
        }

        // Send via Resend
        if (process.env.RESEND_API_KEY && user.email) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'Ami - KeiroAI <contact@keiroai.com>',
              to: [user.email],
              subject: `📊 Ton recap ${monthName} — KeiroAI`,
              html: emailHtml,
            }),
          });
        }

        // Log the recap
        await supabase.from('agent_logs').insert({
          agent_name: 'marketing',
          action: 'monthly_recap',
          status: 'success',
          target_user_id: user.id,
          details: {
            month: monthName,
            totalChats,
            totalContent,
            agentSummary,
          },
          created_at: new Date().toISOString(),
        });

        results.push({ userId: user.id, status: 'sent' });
      } catch (e: any) {
        results.push({ userId: user.id, status: 'error', error: e.message });
      }

      // Rate limit: 1s between emails
      await new Promise(r => setTimeout(r, 1000));
    }

    return NextResponse.json({
      ok: true,
      message: `Monthly recap sent to ${results.filter(r => r.status === 'sent').length}/${results.length} users`,
      results,
    });
  } catch (error: any) {
    console.error('[MonthlyRecap] Error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
