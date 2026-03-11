import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { isGoodTimeToContact, getOptimalCronSlot, verifyProspectData } from '@/lib/agents/business-timing';
import { sendEmail } from '@/lib/agents/email-sender';
import { getAgentContext, reportLearning } from '@/lib/agents/agent-memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

interface SendResult {
  prospect_id: string;
  email: string;
  step: number;
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send a single email via Brevo (priority) or Resend (fallback).
 */
async function sendEmailDirect(
  prospect: any,
  step: number,
  variant?: number
): Promise<{ success: boolean; messageId?: string; provider?: string; error?: string }> {
  try {
    const category = getSequenceForProspect(prospect);
    const selectedVariant = variant ?? Math.floor(Math.random() * 3);
    const vars: Record<string, string> = {
      first_name: prospect.first_name || '',
      company: prospect.company || '',
      type: prospect.type || '',
      quartier: prospect.quartier || '',
      note_google: prospect.note_google != null ? String(prospect.note_google) : '',
    };
    const template = getEmailTemplate(category, step, vars, selectedVariant);

    const emailResult = await sendEmail({
      from_name: 'Victor de KeiroAI',
      from_email: 'contact@keiroai.com',
      to: [prospect.email],
      subject: template.subject,
      html: template.htmlBody,
      text: template.textBody,
      tags: [
        { name: 'type', value: 'cold-sequence' },
        { name: 'step', value: String(step) },
        { name: 'category', value: category },
        { name: 'prospect_id', value: prospect.id },
      ],
    });

    if (!emailResult.ok) {
      console.error(`[EmailDaily] ${emailResult.provider} error for ${prospect.email}:`, emailResult.error);
      return { success: false, error: emailResult.error };
    }

    const messageId = emailResult.messageId || 'unknown';

    // Update prospect
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    await supabase
      .from('crm_prospects')
      .update({
        email_sequence_step: step,
        last_email_sent_at: now,
        email_sequence_status: step === 10 ? 'warm_sent' : 'in_progress',
        email_subject_variant: selectedVariant,
        updated_at: now,
      })
      .eq('id', prospect.id);

    // Create CRM activity
    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'email',
      description: `Email step ${step} envoyé: "${template.subject}"`,
      data: {
        message_id: messageId,
        step,
        subject: template.subject,
        variant: selectedVariant,
        category,
        source: 'daily_cron',
        provider: emailResult.provider,
      },
      created_at: now,
    });

    console.log(`[EmailDaily] ✓ Email sent to ${prospect.email} via ${emailResult.provider} (step ${step}, ${category})`);
    return { success: true, messageId, provider: emailResult.provider };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * GET /api/agents/email/daily
 * Daily cron endpoint for automated email sequences.
 * Auth: CRON_SECRET required.
 * Query: ?type=warm for warm chatbot leads follow-up.
 */
export async function GET(request: NextRequest) {
  // --- Auth: CRON_SECRET or admin user ---
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  let isAuthorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    try {
      const { getAuthUser } = await import('@/lib/auth-server');
      const { user } = await getAuthUser();
      if (user) {
        const supabaseAuth = getSupabaseAdmin();
        const { data: profile } = await supabaseAuth.from('profiles').select('is_admin').eq('id', user.id).single();
        if (profile?.is_admin) isAuthorized = true;
      }
    } catch {}
  }

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Aucun provider email configuré (BREVO_API_KEY ou RESEND_API_KEY requis)' },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();
  const type = request.nextUrl.searchParams.get('type');

  const results: SendResult[] = [];

  try {
    // --- Read CEO directive for email agent ---
    let agentDirective = '';
    try {
      agentDirective = await getAgentContext('email');
      if (agentDirective) {
        console.log(`[EmailDaily] Active directive: ${agentDirective.substring(0, 100)}...`);
      }
    } catch {}

    if (type === 'warm') {
      // --- Warm mode: follow-up chatbot leads ---
      console.log('[EmailDaily] Running warm mode...');

      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

      const { data: warmProspects } = await supabase
        .from('crm_prospects')
        .select('*')
        .eq('source', 'chatbot')
        .not('email', 'is', null)
        .eq('email_sequence_step', 0)
        .lte('created_at', twentyFourHoursAgo)
        .gte('created_at', fortyEightHoursAgo)
        .not('status', 'in', '("sprint","client","perdu")');

      console.log(`[EmailDaily] Warm prospects found: ${warmProspects?.length ?? 0}`);

      for (const prospect of warmProspects || []) {
        const result = await sendEmailDirect(prospect, 10);
        results.push({
          prospect_id: prospect.id,
          email: prospect.email,
          step: 10,
          success: result.success,
          error: result.error,
          messageId: result.messageId,
        });
      }
    } else {
      // --- Default: cold sequences ---
      const slot = request.nextUrl.searchParams.get('slot') || 'all';
      console.log(`[EmailDaily] Running cold sequence mode (slot=${slot})...`);

      // Pull from ALL qualified prospects
      const { data: prospects } = await supabase
        .from('crm_prospects')
        .select('*')
        .not('email', 'is', null)
        .or('email_sequence_status.is.null,email_sequence_status.eq.not_started,email_sequence_status.eq.in_progress')
        .neq('temperature', 'dead')
        .not('status', 'in', '("client","perdu","sprint")');

      console.log(`[EmailDaily] Eligible prospects (before timing filter): ${prospects?.length ?? 0}`);

      let step1Count = 0;
      const MAX_STEP1_PER_DAY = 50;
      let skippedTiming = 0;
      let skippedVerification = 0;

      for (const prospect of prospects || []) {
        const category = getSequenceForProspect(prospect);

        // Smart timing filter
        if (slot !== 'all') {
          if (!isGoodTimeToContact(category, 'email')) {
            skippedTiming++;
            continue;
          }
        }

        // Verify prospect data quality
        const verification = verifyProspectData(prospect);
        if (!verification.valid) {
          skippedVerification++;
          console.log(`[EmailDaily] Skipped ${prospect.company}: ${verification.issues.join(', ')}`);
          continue;
        }

        const step = prospect.email_sequence_step ?? 0;
        const lastSent = prospect.last_email_sent_at
          ? new Date(prospect.last_email_sent_at)
          : null;
        const created = new Date(prospect.created_at);
        const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

        if (step === 0 && hoursSinceCreation >= 24) {
          if (step1Count >= MAX_STEP1_PER_DAY) continue;

          const variant = Math.floor(Math.random() * 3);
          const result = await sendEmailDirect(prospect, 1, variant);
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            step: 1,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
          });
          if (result.success) step1Count++;
        } else if (step === 1 && lastSent) {
          const daysSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastSent >= 4) {
            const result = await sendEmailDirect(prospect, 2);
            results.push({
              prospect_id: prospect.id,
              email: prospect.email,
              step: 2,
              success: result.success,
              error: result.error,
              messageId: result.messageId,
            });
          }
        } else if (step === 2 && lastSent) {
          const daysSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastSent >= 5) {
            const result = await sendEmailDirect(prospect, 3);
            results.push({
              prospect_id: prospect.id,
              email: prospect.email,
              step: 3,
              success: result.success,
              error: result.error,
              messageId: result.messageId,
            });
          }
        } else if (step === 3) {
          await supabase
            .from('crm_prospects')
            .update({
              email_sequence_status: 'completed',
              updated_at: nowISO,
            })
            .eq('id', prospect.id);

          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            step: 3,
            success: true,
          });
        }
      }

      console.log(`[EmailDaily] Skipped: ${skippedTiming} timing, ${skippedVerification} verification. Step1 sent: ${step1Count}/${MAX_STEP1_PER_DAY}`);
    }

    // --- Log summary ---
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    const byBusinessType: Record<string, { sent: number; failed: number; steps: number[] }> = {};
    for (const r of results) {
      const p = (type === 'warm')
        ? null
        : (await supabase.from('crm_prospects').select('type, company').eq('id', r.prospect_id).single()).data;
      const bType = p?.type || 'unknown';
      if (!byBusinessType[bType]) byBusinessType[bType] = { sent: 0, failed: 0, steps: [] };
      if (r.success) byBusinessType[bType].sent++;
      else byBusinessType[bType].failed++;
      byBusinessType[bType].steps.push(r.step);
    }

    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: type === 'warm' ? 'daily_warm' : 'daily_cold',
      data: {
        total: results.length,
        success: successCount,
        failed: failCount,
        by_business_type: byBusinessType,
        results: results.map((r) => ({
          prospect_id: r.prospect_id,
          step: r.step,
          success: r.success,
          error: r.error,
        })),
      },
      created_at: nowISO,
    });

    console.log(`[EmailDaily] Done: ${successCount} sent, ${failCount} failed`);

    // --- Auto-learning: report insights to CEO ---
    try {
      if (results.length > 0) {
        const successRate = results.length > 0 ? Math.round((successCount / results.length) * 100) : 0;
        await reportLearning('email', {
          insight: `Campagne ${type === 'warm' ? 'warm' : 'cold'}: ${successCount}/${results.length} envoyes (${successRate}% succes). ${failCount} echecs.`,
          metric_name: 'email_send_success_rate',
          metric_after: successRate,
          recommendation: failCount > 0
            ? `${failCount} echecs a investiguer. Verifier les erreurs dans les logs.`
            : 'Tous les envois ont reussi.',
        });
      }

      // Report on skipped prospects if significant
      const totalSkipped = (type !== 'warm') ? ((results as any).__skippedTiming || 0) + ((results as any).__skippedVerification || 0) : 0;
      if (type !== 'warm' && results.length === 0) {
        await reportLearning('email', {
          insight: `Aucun email envoye. Tous les prospects ont ete filtres par timing ou verification.`,
          metric_name: 'email_prospects_eligible',
          metric_after: 0,
          recommendation: 'Verifier business-timing.ts et verifyProspectData. Possible probleme de qualite des donnees CRM.',
        });
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      mode: type === 'warm' ? 'warm' : 'cold',
      stats: {
        total: results.length,
        success: successCount,
        failed: failCount,
      },
      results,
    });
  } catch (error: any) {
    console.error('[EmailDaily] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
