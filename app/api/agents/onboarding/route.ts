import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getOnboardingSystemPrompt, getOnboardingStepPrompt } from '@/lib/agents/onboarding-prompt';
import { callGemini } from '@/lib/agents/gemini';

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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    // ──────────────────────────────────────
    // Phase 0: Detect milestones & high usage for Sprint users (schedule dynamic steps)
    // ──────────────────────────────────────
    let dynamicScheduled = 0;
    try {
      dynamicScheduled = await detectAndScheduleDynamicSteps(supabase, now);
    } catch (dynErr: any) {
      console.warn('[Onboarding] Dynamic step detection error:', dynErr.message);
    }

    // ──────────────────────────────────────
    // Phase 1: Process pending queue items
    // ──────────────────────────────────────
    const { data: pendingItems } = await supabase
      .from('onboarding_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(20);

    if (!pendingItems || pendingItems.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, dynamicScheduled, message: 'No pending onboarding items' });
    }

    let processed = 0;
    let skipped = 0;
    let alerts = 0;

    for (const item of pendingItems) {
      try {
        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, business_type, business_name, plan, credits_balance, last_generation_at, created_at')
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
        const totalCreations = generationsCount + videosCount;

        // Check condition: skip h2/h6 if user already generated
        if (['h2', 'h6', 'h6_alert'].includes(item.step_key) && totalCreations > 0) {
          await supabase.from('onboarding_queue').update({ status: 'skipped', skip_reason: 'user_already_active' }).eq('id', item.id);
          skipped++;
          continue;
        }

        // Skip winback if user already upgraded
        if (item.step_key === 'winback_sprint' && profile.plan !== 'free' && profile.plan !== 'sprint') {
          await supabase.from('onboarding_queue').update({ status: 'skipped', skip_reason: 'user_already_upgraded' }).eq('id', item.id);
          skipped++;
          continue;
        }

        // Skip high_usage_upsell if already upgraded past Sprint
        if (item.step_key === 'high_usage_upsell' && profile.plan !== 'sprint') {
          await supabase.from('onboarding_queue').update({ status: 'skipped', skip_reason: 'user_already_upgraded' }).eq('id', item.id);
          skipped++;
          continue;
        }

        // Calculate hours left for Sprint (72h from queue creation)
        const hoursLeft = item.plan === 'sprint' && profile.plan === 'sprint'
          ? Math.max(0, Math.round((new Date(item.created_at).getTime() + 72 * 3600000 - Date.now()) / 3600000))
          : undefined;

        // Calculate days since signup
        const daysSinceSignup = profile.created_at
          ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (24 * 3600000))
          : 0;

        // Calculate credits used (plan allowance - remaining)
        const planAllowance = item.plan === 'sprint' ? 110 : item.plan === 'solo' ? 220 : item.plan === 'fondateurs' ? 660 : 220;
        const creditsUsed = Math.max(0, planAllowance - (profile.credits_balance || 0));

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
          daysSinceSignup,
          creditsUsed,
        };

        // Handle founder alerts (h6)
        if (item.step_key === 'h6_alert' || (item.step_key === 'h6' && totalCreations === 0)) {
          const alertText = getOnboardingStepPrompt('h6_alert', context);

          // Send alert to founder via Resend
          if (process.env.RESEND_API_KEY) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'KeiroAI Onboarding <contact@keiroai.com>',
                to: ['mrzirraro@gmail.com'],
                subject: `Onboarding: ${profile.first_name || 'Client'} (${item.plan}) — 0 visuels apres 6h`,
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

        // Generate message via Gemini
        const stepPrompt = getOnboardingStepPrompt(item.step_key, context);

        const messageText = (await callGemini({
          system: getOnboardingSystemPrompt(),
          message: stepPrompt,
          maxTokens: 500,
        })).trim();

        if (!messageText) {
          await supabase.from('onboarding_queue').update({ status: 'failed', skip_reason: 'empty_response' }).eq('id', item.id);
          continue;
        }

        // Send email to user — Brevo primary, Resend fallback
        const { data: authUser } = await supabase.auth.admin.getUserById(item.user_id);
        const userEmail = authUser?.user?.email;

        if (userEmail) {
          const subjectMap: Record<string, string> = {
            h0: `Bienvenue sur KeiroAI, ${profile.first_name || ''} !`,
            h2: `Un coup de main pour ton 1er visuel ?`,
            h12: generationsCount > 0 ? `Ton visuel est top ! Prochaine etape...` : `Je t'aide a creer ton 1er visuel ?`,
            d1_morning: `Idee de post du jour pour ${profile.business_type || 'ton commerce'}`,
            d2_morning: item.plan === 'sprint' ? `${profile.first_name}, dernier jour pour profiter de tes credits` : `Bilan de tes premiers jours sur KeiroAI`,
            d3_transition: `Bienvenue dans le Solo !`,
            sprint_expiry_warning: `${profile.first_name}, derniere ligne droite !`,
            winback_sprint: `${profile.first_name}, tes creations t'attendent`,
            high_usage_upsell: `${profile.first_name}, tu crees du contenu comme un pro`,
            milestone_first_image: `Bravo ${profile.first_name} ! Ton 1er visuel est pret`,
            milestone_5_creations: `${profile.first_name}, 5 creations ! Tu assures`,
            milestone_10_creations: `${profile.first_name}, 10 creations — tu es un pro !`,
            w1_review: `Ta 1ere semaine sur KeiroAI : le bilan`,
            w2_autonomy: `Tu geres comme un pro maintenant !`,
          };

          const emailSubject = subjectMap[item.step_key] || 'KeiroAI — On est la pour toi';
          const emailTags = ['onboarding', `step-${item.step_key}`, item.plan];

          await sendOnboardingEmail({
            to: userEmail,
            toName: profile.first_name || '',
            subject: emailSubject,
            textContent: messageText,
            tags: emailTags,
            userId: item.user_id,
          });
        }

        // Update queue
        await supabase.from('onboarding_queue').update({ status: 'sent', sent_at: now, message_text: messageText }).eq('id', item.id);

        // Update onboarding score (more granular)
        let scoreInc = 0;
        if (item.step_key === 'h0') scoreInc = 10;
        if (item.step_key === 'milestone_first_image') scoreInc = 25;
        if (item.step_key === 'milestone_5_creations') scoreInc = 20;
        if (item.step_key === 'milestone_10_creations') scoreInc = 15;
        if (item.step_key === 'high_usage_upsell') scoreInc = 10;
        if (generationsCount >= 1 && !item.step_key.startsWith('milestone')) scoreInc += 5;

        if (scoreInc > 0) {
          const currentScore = (profile as any).onboarding_score || 0;
          await supabase.from('profiles').update({ onboarding_score: Math.min(100, currentScore + scoreInc) }).eq('id', item.user_id);
        }

        // Log
        await supabase.from('agent_logs').insert({
          agent: 'onboarding', action: `step_${item.step_key}`, target_id: item.user_id,
          data: {
            plan: item.plan, step: item.step_key,
            generations: generationsCount, videos: videosCount,
            credits_used: creditsUsed, credits_remaining: profile.credits_balance || 0,
          },
          status: 'success', created_at: now,
        });

        processed++;
        console.log(`[Onboarding] Step ${item.step_key} sent to ${profile.first_name} (${item.plan})`);

      } catch (itemError: any) {
        console.error(`[Onboarding] Error processing item ${item.id}:`, itemError.message);
        await supabase.from('onboarding_queue').update({ status: 'failed', skip_reason: itemError.message }).eq('id', item.id);
      }
    }

    // Log summary
    await supabase.from('agent_logs').insert({
      agent: 'onboarding', action: 'queue_processed',
      data: { processed, skipped, alerts, dynamicScheduled, total: pendingItems.length },
      status: 'success', created_at: now,
    });

    console.log(`[Onboarding] Queue processed: ${processed} sent, ${skipped} skipped, ${alerts} alerts, ${dynamicScheduled} dynamic`);

    return NextResponse.json({ ok: true, processed, skipped, alerts, dynamicScheduled });
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

  // Sprint: aggressive 72h conversion sequence + winback
  const sprintSteps = [
    { key: 'h0', trigger: 'payment', delayMs: 0 },
    { key: 'h2', trigger: 'time_based', delayMs: 2 * HOUR },
    { key: 'h6', trigger: 'time_based', delayMs: 6 * HOUR },
    { key: 'h12', trigger: 'time_based', delayMs: 12 * HOUR },
    { key: 'd1_morning', trigger: 'time_based', delayMs: 1 * DAY },
    { key: 'd2_morning', trigger: 'time_based', delayMs: 2 * DAY },
    { key: 'sprint_expiry_warning', trigger: 'time_based', delayMs: 2 * DAY + 16 * HOUR }, // Evening of day 2 (last chance)
    { key: 'd3_transition', trigger: 'sprint_converted', delayMs: 3 * DAY + 2 * HOUR },
    { key: 'winback_sprint', trigger: 'time_based', delayMs: 5 * DAY }, // 2 days after Sprint expiry
    { key: 'w1_review', trigger: 'time_based', delayMs: 7 * DAY },
    { key: 'w2_autonomy', trigger: 'time_based', delayMs: 14 * DAY },
  ];

  // Solo/Pro: standard onboarding with upsell to Fondateurs
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

// ──────────────────────────────────────
// Send email via Brevo (primary) with Resend fallback
// ──────────────────────────────────────
async function sendOnboardingEmail(opts: {
  to: string;
  toName: string;
  subject: string;
  textContent: string;
  tags: string[];
  userId: string;
}): Promise<{ success: boolean; provider: string }> {
  const { to, toName, subject, textContent, tags, userId } = opts;

  // Try Brevo first (primary — better deliverability + tracking via webhooks)
  if (process.env.BREVO_API_KEY) {
    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Victor de KeiroAI', email: 'contact@keiroai.com' },
          to: [{ email: to, name: toName }],
          subject,
          textContent,
          headers: { 'X-Mailin-custom': userId },
          tags,
        }),
      });

      if (brevoRes.ok) {
        console.log(`[Onboarding] Email sent via Brevo to ${to}`);
        return { success: true, provider: 'brevo' };
      }
      const errText = await brevoRes.text();
      console.warn(`[Onboarding] Brevo failed for ${to}:`, errText);
    } catch (brevoErr: any) {
      console.warn(`[Onboarding] Brevo error:`, brevoErr.message);
    }
  }

  // Fallback to Resend
  if (process.env.RESEND_API_KEY) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Victor de KeiroAI <contact@keiroai.com>',
          to: [to],
          subject,
          text: textContent,
        }),
      });

      if (resendRes.ok) {
        console.log(`[Onboarding] Email sent via Resend (fallback) to ${to}`);
        return { success: true, provider: 'resend' };
      }
    } catch (resendErr: any) {
      console.warn(`[Onboarding] Resend fallback error:`, resendErr.message);
    }
  }

  console.error(`[Onboarding] All email providers failed for ${to}`);
  return { success: false, provider: 'none' };
}

// ──────────────────────────────────────
// Detect milestones & high usage — schedule dynamic onboarding steps
// ──────────────────────────────────────
async function detectAndScheduleDynamicSteps(
  supabase: any,
  now: string
): Promise<number> {
  let scheduled = 0;

  // Find Sprint users signed up in the last 5 days who might need dynamic steps
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600000).toISOString();
  const { data: recentSprintUsers } = await supabase
    .from('onboarding_queue')
    .select('user_id, plan')
    .eq('plan', 'sprint')
    .eq('step_key', 'h0')
    .gte('created_at', fiveDaysAgo);

  if (!recentSprintUsers || recentSprintUsers.length === 0) return 0;

  // Deduplicate user IDs
  const userIds = [...new Set(recentSprintUsers.map((u: any) => u.user_id))];

  for (const userId of userIds) {
    try {
      // Get generation counts
      const { count: genCount } = await supabase
        .from('saved_images')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { count: videoCount } = await supabase
        .from('my_videos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const totalCreations = (genCount || 0) + (videoCount || 0);

      // Check which dynamic steps already exist for this user
      const { data: existingSteps } = await supabase
        .from('onboarding_queue')
        .select('step_key')
        .eq('user_id', userId)
        .in('step_key', ['milestone_first_image', 'milestone_5_creations', 'milestone_10_creations', 'high_usage_upsell']);

      const existingKeys = new Set((existingSteps || []).map((s: any) => s.step_key));

      // Milestone: First image (1+ creations)
      if (totalCreations >= 1 && !existingKeys.has('milestone_first_image')) {
        await supabase.from('onboarding_queue').insert({
          user_id: userId,
          step_key: 'milestone_first_image',
          plan: 'sprint',
          trigger_type: 'milestone',
          scheduled_at: now, // Send immediately
          status: 'pending',
        });
        scheduled++;
      }

      // Milestone: 5 creations
      if (totalCreations >= 5 && !existingKeys.has('milestone_5_creations')) {
        await supabase.from('onboarding_queue').insert({
          user_id: userId,
          step_key: 'milestone_5_creations',
          plan: 'sprint',
          trigger_type: 'milestone',
          scheduled_at: now,
          status: 'pending',
        });
        scheduled++;
      }

      // Milestone: 10 creations (power user)
      if (totalCreations >= 10 && !existingKeys.has('milestone_10_creations')) {
        await supabase.from('onboarding_queue').insert({
          user_id: userId,
          step_key: 'milestone_10_creations',
          plan: 'sprint',
          trigger_type: 'milestone',
          scheduled_at: now,
          status: 'pending',
        });
        scheduled++;
      }

      // High usage upsell: 5+ creations on Sprint — immediate upsell (don't wait for d3)
      if (totalCreations >= 5 && !existingKeys.has('high_usage_upsell')) {
        // Check user is still on Sprint
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', userId)
          .single();

        if (profile?.plan === 'sprint') {
          await supabase.from('onboarding_queue').insert({
            user_id: userId,
            step_key: 'high_usage_upsell',
            plan: 'sprint',
            trigger_type: 'high_usage',
            scheduled_at: now,
            status: 'pending',
          });
          scheduled++;
        }
      }
    } catch (userErr: any) {
      console.warn(`[Onboarding] Dynamic detection error for user ${userId}:`, userErr.message);
    }
  }

  if (scheduled > 0) {
    console.log(`[Onboarding] Scheduled ${scheduled} dynamic steps`);
  }

  return scheduled;
}
