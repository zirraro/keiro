import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getRetentionSystemPrompt, getRetentionMessagePrompt } from '@/lib/agents/retention-prompt';
import { callGemini } from '@/lib/agents/gemini';
import { canSendEmail } from '@/lib/agents/email-dedup';

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

// Health score calculation
function calculateHealthScore(profile: any, weeklyGen: number, prevWeekGen: number, weeklyVideos: number): { score: number; level: string } {
  let score = 100;

  // Days since last login
  const lastLogin = profile.last_sign_in_at || profile.updated_at || profile.created_at;
  const daysSinceLogin = lastLogin ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / 86400000) : 30;

  if (daysSinceLogin >= 14) score -= 50;
  else if (daysSinceLogin >= 10) score -= 35;
  else if (daysSinceLogin >= 5) score -= 25;
  else if (daysSinceLogin >= 3) score -= 15;

  // Weekly generations (images + videos)
  const weeklyTotal = weeklyGen + weeklyVideos;
  if (weeklyTotal === 0) score -= 30;
  else if (weeklyTotal === 1) score -= 15;
  else if (weeklyTotal < 3) score -= 5;

  // Trend: compare with previous week
  if (prevWeekGen > 0 && weeklyGen < prevWeekGen * 0.5) score -= 10;

  // Client age (newer = more fragile)
  const clientAge = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000);
  if (clientAge < 14) score -= 10;
  else if (clientAge < 30) score -= 5;

  // Renewal proximity with low activity
  if (profile.next_renewal_at) {
    const daysToRenewal = Math.floor((new Date(profile.next_renewal_at).getTime() - Date.now()) / 86400000);
    if (daysToRenewal <= 5 && score < 70) score -= 15;
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 70 ? 'green' : score >= 50 ? 'yellow' : score >= 30 ? 'orange' : 'red';

  return { score, level };
}

// ──────────────────────────────────────
// GET: Cron — daily retention check
// ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();

  try {
    // Get all paying users (have a plan that's not 'gratuit')
    const { data: clients } = await supabase
      .from('profiles')
      .select('id, email, first_name, business_type, business_name, plan, credits_balance, created_at, updated_at, next_renewal_at, health_score, health_level, phone, quartier')
      .not('plan', 'is', null)
      .not('plan', 'eq', 'gratuit')
      .not('plan', 'eq', 'free');

    if (!clients || clients.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: 'No paying clients found' });
    }

    let greenCount = 0, yellowCount = 0, orangeCount = 0, redCount = 0;
    let messagesSent = 0;

    for (const client of clients) {
      try {
        // Get auth user for last_sign_in_at
        const { data: authData } = await supabase.auth.admin.getUserById(client.id);
        const lastSignIn = authData?.user?.last_sign_in_at;

        // Count generations this week and previous week
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

        const { count: weeklyGen } = await supabase
          .from('saved_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('created_at', sevenDaysAgo);

        const { count: prevWeekGen } = await supabase
          .from('saved_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('created_at', fourteenDaysAgo)
          .lt('created_at', sevenDaysAgo);

        const { count: weeklyVideos } = await supabase
          .from('my_videos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id)
          .gte('created_at', sevenDaysAgo);

        const { count: totalGen } = await supabase
          .from('saved_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', client.id);

        const profileWithAuth = { ...client, last_sign_in_at: lastSignIn };
        const { score, level } = calculateHealthScore(profileWithAuth, weeklyGen || 0, prevWeekGen || 0, weeklyVideos || 0);

        // Update profile health
        await supabase.from('profiles').update({ health_score: score, health_level: level }).eq('id', client.id);

        // Upsert retention_scores
        await supabase.from('retention_scores').upsert({
          user_id: client.id,
          health_score: score,
          health_level: level,
          days_since_login: lastSignIn ? Math.floor((Date.now() - new Date(lastSignIn).getTime()) / 86400000) : 30,
          weekly_generations: (weeklyGen || 0) + (weeklyVideos || 0),
          prev_week_generations: prevWeekGen || 0,
          plan: client.plan,
          monthly_revenue: client.plan === 'fondateurs' ? 149 : client.plan === 'elite' ? 999 : client.plan === 'business' ? 349 : 89,
          days_to_renewal: client.next_renewal_at ? Math.floor((new Date(client.next_renewal_at).getTime() - Date.now()) / 86400000) : null,
          updated_at: nowISO,
        }, { onConflict: 'user_id' });

        // Count by level
        if (level === 'green') greenCount++;
        else if (level === 'yellow') yellowCount++;
        else if (level === 'orange') orangeCount++;
        else redCount++;

        // Check if we should send a message (max 1/week)
        const { data: lastMsg } = await supabase
          .from('retention_scores')
          .select('last_message_sent_at')
          .eq('user_id', client.id)
          .single();

        const daysSinceLastMsg = lastMsg?.last_message_sent_at
          ? Math.floor((Date.now() - new Date(lastMsg.last_message_sent_at).getTime()) / 86400000)
          : 999;

        if (daysSinceLastMsg < 7 && level !== 'red') continue; // Max 1/week unless red

        // Cross-agent dedup: check if any agent (email, onboarding) emailed this user in last 3 days
        const dedupEmail = authData?.user?.email || client.email;
        if (dedupEmail) {
          const dedupCheck = await canSendEmail(supabase, dedupEmail, {
            minDays: 3,
            userId: client.id,
          });
          if (!dedupCheck.allowed) {
            console.log(`[Retention] Dedup skip: ${client.first_name} — ${dedupCheck.reason}`);
            continue;
          }
        }

        const daysSinceLogin = lastSignIn ? Math.floor((Date.now() - new Date(lastSignIn).getTime()) / 86400000) : 30;
        const daysToRenewal = client.next_renewal_at ? Math.floor((new Date(client.next_renewal_at).getTime() - Date.now()) / 86400000) : undefined;

        const msgContext = {
          firstName: client.first_name || 'Client',
          businessType: client.business_type || 'commerce',
          businessName: client.business_name || undefined,
          plan: client.plan || 'pro',
          daysSinceLogin,
          weeklyGenerations: (weeklyGen || 0) + (weeklyVideos || 0),
          totalGenerations: totalGen || 0,
          daysToRenewal,
          healthScore: score,
        };

        let messageType: 'celebration' | 'nudge' | 'reactivation' | 'red_alert' | null = null;

        if (level === 'red') {
          messageType = 'red_alert';
        } else if (level === 'orange') {
          messageType = 'reactivation';
        } else if (level === 'yellow') {
          messageType = 'nudge';
        } else if (level === 'green' && daysSinceLastMsg >= 30) {
          messageType = 'celebration';
        }

        if (!messageType) continue;

        // Red alert → send to founder, not to client
        if (messageType === 'red_alert') {
          const alertText = getRetentionMessagePrompt('red_alert', msgContext);

          if (process.env.RESEND_API_KEY) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'KeiroAI Retention <contact@keiroai.com>',
                to: ['mrzirraro@gmail.com'],
                subject: `🔴 Client en danger : ${client.first_name || 'Client'} (${client.plan}) — Score ${score}/100`,
                text: alertText,
              }),
            });
          }

          await supabase.from('retention_scores').update({
            last_message_sent_at: nowISO,
            last_message_type: 'red_alert',
          }).eq('user_id', client.id);

          await supabase.from('agent_logs').insert({
            agent: 'retention', action: 'red_alert', target_id: client.id,
            data: { score, level, daysSinceLogin, weeklyGen: weeklyGen || 0, plan: client.plan, daysToRenewal },
            status: 'success', created_at: nowISO,
          });

          messagesSent++;
          continue;
        }

        // Generate message via Claude
        const prompt = getRetentionMessagePrompt(messageType, msgContext);
        const messageText = (await callGemini({
          system: getRetentionSystemPrompt(),
          message: prompt,
          maxTokens: 300,
        })).trim();
        if (!messageText) continue;

        // Send to client
        const userEmail = authData?.user?.email || client.email;
        if (userEmail && process.env.RESEND_API_KEY) {
          const subjectMap: Record<string, string> = {
            celebration: `Bravo ${client.first_name || ''} ! Tes résultats sur KeiroAI`,
            nudge: `Une idée de post pour ${client.business_type || 'ton commerce'}`,
            reactivation: `${client.first_name || 'Hey'}, on t'aide à relancer ta com ?`,
          };

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Victor de KeiroAI <contact@keiroai.com>',
              to: [userEmail],
              subject: subjectMap[messageType] || 'KeiroAI — On pense à toi',
              text: messageText,
            }),
          });
        }

        // Update retention record
        await supabase.from('retention_scores').update({
          last_message_sent_at: nowISO,
          last_message_type: messageType,
        }).eq('user_id', client.id);

        await supabase.from('agent_logs').insert({
          agent: 'retention', action: `${messageType}_sent`, target_id: client.id,
          data: { score, level, messageType, daysSinceLogin, plan: client.plan },
          status: 'success', created_at: nowISO,
        });

        messagesSent++;
        console.log(`[Retention] ✓ ${messageType} sent to ${client.first_name} (score: ${score}, ${client.plan})`);

      } catch (clientError: any) {
        console.error(`[Retention] Error for client ${client.id}:`, clientError.message);
      }
    }

    // Summary log
    const summary = { green: greenCount, yellow: yellowCount, orange: orangeCount, red: redCount, messagesSent, totalClients: clients.length };

    await supabase.from('agent_logs').insert({
      agent: 'retention', action: 'daily_check',
      data: summary,
      status: 'success', created_at: nowISO,
    });

    // Email summary to founder
    if (process.env.RESEND_API_KEY && (orangeCount > 0 || redCount > 0)) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'KeiroAI Retention <contact@keiroai.com>',
          to: ['mrzirraro@gmail.com'],
          subject: `Rétention : 🟢${greenCount} 🟡${yellowCount} 🟠${orangeCount} 🔴${redCount} — ${messagesSent} messages`,
          text: `Rapport rétention quotidien\n\n🟢 Actifs : ${greenCount}\n🟡 Baisse : ${yellowCount}\n🟠 Inactifs : ${orangeCount}\n🔴 Danger : ${redCount}\n\nMessages envoyés : ${messagesSent}\nClients payants : ${clients.length}`,
        }),
      });
    }

    console.log(`[Retention] Daily check: 🟢${greenCount} 🟡${yellowCount} 🟠${orangeCount} 🔴${redCount} — ${messagesSent} msgs`);

    return NextResponse.json({ ok: true, ...summary });
  } catch (error: any) {
    console.error('[Retention] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ──────────────────────────────────────
// POST: Manual actions
// ──────────────────────────────────────
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();

  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === 'stats') {
      const { data: scores } = await supabase
        .from('retention_scores')
        .select('health_level, plan, monthly_revenue')
        .order('health_score', { ascending: true });

      const levels = { green: 0, yellow: 0, orange: 0, red: 0 };
      let mrrAtRisk = 0;
      for (const s of scores || []) {
        levels[s.health_level as keyof typeof levels]++;
        if (s.health_level === 'orange' || s.health_level === 'red') {
          mrrAtRisk += Number(s.monthly_revenue || 0);
        }
      }

      return NextResponse.json({ ok: true, levels, mrrAtRisk, totalClients: (scores || []).length });
    }

    if (body.action === 'clients') {
      const { data: atRisk } = await supabase
        .from('retention_scores')
        .select('user_id, health_score, health_level, days_since_login, weekly_generations, plan, monthly_revenue, last_message_type, last_message_sent_at, days_to_renewal')
        .in('health_level', ['yellow', 'orange', 'red'])
        .order('health_score', { ascending: true })
        .limit(50);

      // Enrich with profile data
      const enriched = [];
      for (const r of atRisk || []) {
        const { data: profile } = await supabase.from('profiles').select('first_name, business_type, business_name, email').eq('id', r.user_id).single();
        enriched.push({ ...r, ...profile });
      }

      return NextResponse.json({ ok: true, clients: enriched });
    }

    return NextResponse.json({ ok: false, error: `Action inconnue: ${body.action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[Retention] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
