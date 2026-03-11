import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse, isAIConfigured, AI_API_KEY_NAME } from '@/lib/ai-client';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getOnboardingSystemPrompt, getOnboardingStepPrompt } from '@/lib/agents/onboarding-prompt';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

// ──────────────────────────────────────
// GET: Cron — process onboarding queue
// ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: `${AI_API_KEY_NAME} non configurée` }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    // 1. Process pending queue items
    const { data: pendingItems } = await supabase
      .from('onboarding_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(20);

    if (!pendingItems || pendingItems.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: 'No pending onboarding items' });
    }

    let processed = 0;
    let skipped = 0;
    let alerts = 0;

    for (const item of pendingItems) {
      try {
        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, business_type, business_name, plan, credits_balance, last_generation_at')
          .eq('id', item.user_id)
          .single();

        if (!profile) {
          await supabase.from('onboarding_queue').update({ status: 'skipped', skip_reason: 'profile_not_found' }).eq('id', item.id);
          skipped++;
          continue;
        }

        // Count generations
        const { count: genCount } = await supabase
          .from('saved_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', item.user_id);

        const { count: videoCount } = await supabase
          .from('my_videos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', item.user_id);

        const generationsCount = genCount || 0;
        const videosCount = videoCount || 0;

        // Check condition: skip h2/h6 if user already generated
        if (['h2', 'h6', 'h6_alert'].includes(item.step_key) && (generationsCount + videosCount) > 0) {
          await supabase.from('onboarding_queue').update({ status: 'skipped', skip_reason: 'user_already_active' }).eq('id', item.id);
          skipped++;
          continue;
        }

        // Calculate hours left for Sprint
        const hoursLeft = item.plan === 'sprint' && profile.plan === 'sprint'
          ? Math.max(0, Math.round((new Date(item.created_at).getTime() + 72 * 3600000 - Date.now()) / 3600000))
          : undefined;

        // Build context
        const context = {
          firstName: profile.first_name || 'Client',
          businessType: profile.business_type || 'commerce',
          businessName: profile.business_name || undefined,
          plan: item.plan,
          generationsCount,
          videosCount,
          creditsRemaining: profile.credits_balance || 0,
          hoursLeft,
        };

        // Handle founder alerts (h6)
        if (item.step_key === 'h6_alert' || (item.step_key === 'h6' && (generationsCount + videosCount) === 0)) {
          const alertText = getOnboardingStepPrompt('h6_alert', context);

          // Send alert to founder via Resend
          if (process.env.RESEND_API_KEY) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'KeiroAI Onboarding <contact@keiroai.com>',
                to: ['mrzirraro@gmail.com'],
                subject: `🚨 Onboarding: ${profile.first_name || 'Client'} (${item.plan}) — 0 visuels après 6h`,
                text: alertText,
              }),
            });
          }

          await supabase.from('onboarding_queue').update({ status: 'alert_sent', sent_at: now, message_text: alertText }).eq('id', item.id);
          await supabase.from('agent_logs').insert({
            agent: 'onboarding', action: 'founder_alert', target_id: item.user_id,
            data: { step: item.step_key, plan: item.plan, generations: generationsCount },
            status: 'success', created_at: now,
          });
          alerts++;
          continue;
        }

        // Generate message via Claude
        const stepPrompt = getOnboardingStepPrompt(item.step_key, context);

        const response = await generateAIResponse({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: getOnboardingSystemPrompt(),
          messages: [{ role: 'user', content: stepPrompt }],
        });

        const messageText = response.text.trim();

        if (!messageText) {
          await supabase.from('onboarding_queue').update({ status: 'failed', skip_reason: 'empty_response' }).eq('id', item.id);
          continue;
        }

        // Send email to user
        const { data: authUser } = await supabase.auth.admin.getUserById(item.user_id);
        const userEmail = authUser?.user?.email;

        if (userEmail && process.env.RESEND_API_KEY) {
          const subjectMap: Record<string, string> = {
            h0: `Bienvenue sur KeiroAI, ${profile.first_name || ''} !`,
            h2: `Un coup de main pour ton 1er visuel ?`,
            h12: generationsCount > 0 ? `Ton visuel est top ! Prochaine étape...` : `Je t'aide à créer ton 1er visuel ?`,
            d1_morning: `Idée de post du jour pour ${profile.business_type || 'ton commerce'}`,
            d2_morning: `Bilan de tes premiers jours sur KeiroAI`,
            d3_transition: `Bienvenue dans le Pro !`,
            w1_review: `Ta 1ère semaine sur KeiroAI : le bilan`,
            w2_autonomy: `Tu gères comme un pro maintenant !`,
          };

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Victor de KeiroAI <contact@keiroai.com>',
              to: [userEmail],
              subject: subjectMap[item.step_key] || 'KeiroAI — On est là pour toi',
              text: messageText,
            }),
          });
        }

        // Update queue
        await supabase.from('onboarding_queue').update({ status: 'sent', sent_at: now, message_text: messageText }).eq('id', item.id);

        // Update onboarding score
        let scoreInc = 0;
        if (item.step_key === 'h0') scoreInc = 10;
        if (generationsCount >= 1) scoreInc += 20;
        if (generationsCount >= 5) scoreInc += 15;

        if (scoreInc > 0) {
          const currentScore = (profile as any).onboarding_score || 0;
          await supabase.from('profiles').update({ onboarding_score: Math.min(100, currentScore + scoreInc) }).eq('id', item.user_id);
        }

        // Log
        await supabase.from('agent_logs').insert({
          agent: 'onboarding', action: `step_${item.step_key}`, target_id: item.user_id,
          data: { plan: item.plan, step: item.step_key, generations: generationsCount, videos: videosCount },
          status: 'success', created_at: now,
        });

        processed++;
        console.log(`[Onboarding] ✓ Step ${item.step_key} sent to ${profile.first_name} (${item.plan})`);

      } catch (itemError: any) {
        console.error(`[Onboarding] Error processing item ${item.id}:`, itemError.message);
        await supabase.from('onboarding_queue').update({ status: 'failed', skip_reason: itemError.message }).eq('id', item.id);
      }
    }

    // Log summary
    await supabase.from('agent_logs').insert({
      agent: 'onboarding', action: 'queue_processed',
      data: { processed, skipped, alerts, total: pendingItems.length },
      status: 'success', created_at: now,
    });

    console.log(`[Onboarding] Queue processed: ${processed} sent, ${skipped} skipped, ${alerts} alerts`);

    return NextResponse.json({ ok: true, processed, skipped, alerts });
  } catch (error: any) {
    console.error('[Onboarding] GET error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ──────────────────────────────────────
// POST: Manual trigger / Schedule onboarding
// ──────────────────────────────────────
export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === 'schedule') {
      // Schedule onboarding for a user
      const { userId, plan } = body;
      if (!userId || !plan) {
        return NextResponse.json({ ok: false, error: 'userId and plan required' }, { status: 400 });
      }

      const steps = getOnboardingSteps(plan);
      const now = Date.now();

      for (const step of steps) {
        await supabase.from('onboarding_queue').insert({
          user_id: userId,
          step_key: step.key,
          plan,
          trigger_type: step.trigger,
          scheduled_at: new Date(now + step.delayMs).toISOString(),
          status: 'pending',
        });
      }

      await supabase.from('agent_logs').insert({
        agent: 'onboarding', action: 'sequence_scheduled', target_id: userId,
        data: { plan, steps: steps.length },
        status: 'success', created_at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, stepsScheduled: steps.length });
    }

    if (action === 'stats') {
      // Return onboarding stats
      const { count: pendingCount } = await supabase
        .from('onboarding_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: sentCount } = await supabase
        .from('onboarding_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent');

      const { count: alertCount } = await supabase
        .from('onboarding_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'alert_sent');

      return NextResponse.json({
        ok: true,
        stats: { pending: pendingCount || 0, sent: sentCount || 0, alerts: alertCount || 0 },
      });
    }

    return NextResponse.json({ ok: false, error: `Action inconnue: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[Onboarding] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// ──────────────────────────────────────
// Onboarding step definitions
// ──────────────────────────────────────
function getOnboardingSteps(plan: string) {
  const HOUR = 3600000;
  const DAY = 24 * HOUR;

  const sprintSteps = [
    { key: 'h0', trigger: 'payment', delayMs: 0 },
    { key: 'h2', trigger: 'time_based', delayMs: 2 * HOUR },
    { key: 'h6', trigger: 'time_based', delayMs: 6 * HOUR },
    { key: 'h12', trigger: 'time_based', delayMs: 12 * HOUR },
    { key: 'd1_morning', trigger: 'time_based', delayMs: 1 * DAY },
    { key: 'd2_morning', trigger: 'time_based', delayMs: 2 * DAY },
    { key: 'd3_transition', trigger: 'sprint_converted', delayMs: 3 * DAY + 2 * HOUR },
    { key: 'w1_review', trigger: 'time_based', delayMs: 7 * DAY },
    { key: 'w2_autonomy', trigger: 'time_based', delayMs: 14 * DAY },
  ];

  const proSteps = [
    { key: 'h0', trigger: 'payment', delayMs: 0 },
    { key: 'h2', trigger: 'time_based', delayMs: 2 * HOUR },
    { key: 'h6', trigger: 'time_based', delayMs: 6 * HOUR },
    { key: 'h12', trigger: 'time_based', delayMs: 12 * HOUR },
    { key: 'd1_morning', trigger: 'time_based', delayMs: 1 * DAY },
    { key: 'd2_morning', trigger: 'time_based', delayMs: 2 * DAY },
    { key: 'w1_review', trigger: 'time_based', delayMs: 7 * DAY },
    { key: 'w2_autonomy', trigger: 'time_based', delayMs: 14 * DAY },
  ];

  const fondateursSteps = [
    { key: 'h0', trigger: 'payment', delayMs: 0 },
    { key: 'h2', trigger: 'time_based', delayMs: 2 * HOUR },
    { key: 'h12', trigger: 'time_based', delayMs: 12 * HOUR },
    { key: 'd1_morning', trigger: 'time_based', delayMs: 1 * DAY },
    { key: 'd2_morning', trigger: 'time_based', delayMs: 2 * DAY },
    { key: 'w1_review', trigger: 'time_based', delayMs: 7 * DAY },
    { key: 'w2_autonomy', trigger: 'time_based', delayMs: 14 * DAY },
  ];

  switch (plan) {
    case 'sprint': return sprintSteps;
    case 'fondateurs': return fondateursSteps;
    default: return proSteps;
  }
}
