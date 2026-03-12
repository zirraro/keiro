import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { verifyProspectData } from '@/lib/agents/business-timing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
 * Pre-send data quality check (fast, no AI call).
 * Returns null if prospect should NOT be contacted, or the cleaned template.
 */
function reviewBeforeSend(
  prospect: any,
  template: { subject: string; htmlBody: string; textBody: string },
): { subject: string; textBody: string; htmlBody: string } | null {
  // Check for broken template variables in final text
  if (template.textBody.includes('{{') || template.subject.includes('{{')) {
    console.log(`[EmailDaily] Rejected ${prospect.email}: unresolved template variables`);
    return null;
  }

  // Check for empty/broken personalization
  if (template.textBody.includes('Bonjour ,') || template.textBody.includes('Bonjour,\n')) {
    const fixed = {
      ...template,
      textBody: template.textBody.replace(/Bonjour\s*,/, `Bonjour${prospect.first_name ? ' ' + prospect.first_name : ''},`),
      htmlBody: template.htmlBody.replace(/Bonjour\s*,/, `Bonjour${prospect.first_name ? ' ' + prospect.first_name : ''},`),
    };
    return fixed;
  }

  // Check for suspicious email domains
  const disposableDomains = ['yopmail.com', 'guerrillamail.com', 'tempmail.com', 'mailinator.com', 'throwaway.email'];
  const emailDomain = (prospect.email || '').split('@')[1]?.toLowerCase();
  if (emailDomain && disposableDomains.includes(emailDomain)) {
    console.log(`[EmailDaily] Rejected ${prospect.email}: disposable email domain`);
    return null;
  }

  // Check "Oussama" isn't in the final email
  if (template.textBody.includes('Oussama') || template.htmlBody.includes('Oussama')) {
    const fixed = {
      subject: template.subject,
      textBody: template.textBody.replace(/Oussama/g, 'Victor'),
      htmlBody: template.htmlBody.replace(/Oussama/g, 'Victor'),
    };
    return fixed;
  }

  return template;
}

/**
 * Send a single email via Resend.
 */
async function sendEmailDirect(
  prospect: any,
  step: number,
  variant?: number
): Promise<{ success: boolean; messageId?: string; error?: string }> {
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
    let template = getEmailTemplate(category, step, vars, selectedVariant);

    // Pre-send quality check (fast, no AI call)
    const reviewed = reviewBeforeSend(prospect, template);
    if (!reviewed) {
      return { success: false, error: 'Rejected by pre-send review' };
    }
    template = reviewed;

    let messageId = 'unknown';
    let provider = 'resend';
    let sendSuccess = false;

    // Try Resend first
    if (process.env.RESEND_API_KEY) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Victor de KeiroAI <contact@keiroai.com>',
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
          }),
        });

        if (resendResponse.ok) {
          const resendData = await resendResponse.json();
          messageId = resendData.id || 'unknown';
          provider = 'resend';
          sendSuccess = true;
        } else {
          const errorText = await resendResponse.text();
          console.warn(`[EmailDaily] Resend failed for ${prospect.email}, trying Brevo:`, errorText);
        }
      } catch (resendError: any) {
        console.warn(`[EmailDaily] Resend error for ${prospect.email}, trying Brevo:`, resendError.message);
      }
    }

    // Fallback to Brevo
    if (!sendSuccess && process.env.BREVO_API_KEY) {
      try {
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Victor de KeiroAI', email: 'contact@keiroai.com' },
            to: [{ email: prospect.email, name: prospect.first_name || prospect.company || '' }],
            subject: template.subject,
            htmlContent: template.htmlBody,
            textContent: template.textBody,
            headers: { 'X-Mailin-custom': prospect.id },
            tags: ['cold-sequence', `step-${step}`, category],
          }),
        });

        if (brevoResponse.ok) {
          const brevoData = await brevoResponse.json();
          messageId = brevoData.messageId || 'unknown';
          provider = 'brevo';
          sendSuccess = true;
          console.log(`[EmailDaily] Email sent via Brevo fallback for ${prospect.email}`);
        } else {
          const errorText = await brevoResponse.text();
          console.error(`[EmailDaily] Brevo fallback also failed for ${prospect.email}:`, errorText);
        }
      } catch (brevoError: any) {
        console.error(`[EmailDaily] Brevo error for ${prospect.email}:`, brevoError.message);
      }
    }

    if (!sendSuccess) {
      return { success: false, error: 'Resend + Brevo both failed' };
    }

    // Update prospect
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    await supabase
      .from('crm_prospects')
      .update({
        email_sequence_step: step,
        last_email_sent_at: now,
        email_sequence_status: step === 10 ? 'warm_sent' : 'in_progress',
        email_provider: provider,
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
        provider,
      },
      created_at: now,
    });

    console.log(`[EmailDaily] ✓ Email sent to ${prospect.email} (step ${step}, ${category}) via ${provider}`);
    return { success: true, messageId };
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
      { ok: false, error: 'Aucun provider email configuré (RESEND_API_KEY ou BREVO_API_KEY requis)' },
      { status: 500 }
    );
  }

  // Detect if this is a manual trigger (admin user, no CRON_SECRET) vs cron
  const isCronTrigger = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const isManualTrigger = !isCronTrigger;

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();
  const type = request.nextUrl.searchParams.get('type');

  const results: SendResult[] = [];

  try {
    if (type === 'warm') {
      // --- Warm mode: follow-up chatbot leads ---
      console.log('[EmailDaily] Running warm mode (via Resend+Brevo)...');

      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

      // IMPORTANT: Use .or() for NULL-safe filtering — in SQL, NULL NOT IN (...) = NULL (excluded)
      const { data: warmProspects } = await supabase
        .from('crm_prospects')
        .select('*')
        .eq('source', 'chatbot')
        .not('email', 'is', null)
        .eq('email_sequence_step', 0)
        .lte('created_at', twentyFourHoursAgo)
        .gte('created_at', fortyEightHoursAgo)
        .or('status.is.null,status.not.in.("sprint","client","perdu")');

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
      console.log(`[EmailDaily] Running cold sequence mode via Resend+Brevo (manual=${isManualTrigger})...`);

      // Pull from ALL qualified prospects
      // IMPORTANT: Use .or() for NULL-safe filtering — in SQL, NULL NOT IN (...) = NULL (excluded)
      const { data: prospects, error: queryError } = await supabase
        .from('crm_prospects')
        .select('*')
        .not('email', 'is', null)
        .or('email_sequence_status.is.null,email_sequence_status.eq.not_started,email_sequence_status.eq.in_progress')
        .or('temperature.is.null,temperature.neq.dead')
        .or('status.is.null,status.not.in.("client","perdu","sprint")');

      if (queryError) {
        console.error('[EmailDaily] Query error:', queryError.message);
        return NextResponse.json({ ok: false, error: `Query error: ${queryError.message}` }, { status: 500 });
      }

      console.log(`[EmailDaily] Eligible prospects from DB: ${prospects?.length ?? 0}`);

      // If no prospects at all, return diagnostic info
      if (!prospects || prospects.length === 0) {
        // Check total CRM count for diagnostic
        const { count: totalCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true });
        const { count: withEmail } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('email', 'is', null);
        const { count: deadCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'dead');
        const { count: perduCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'perdu');
        const { count: completedCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('email_sequence_status', 'completed');

        const diagnostic = {
          total_crm: totalCount || 0,
          with_email: withEmail || 0,
          dead: deadCount || 0,
          perdu: perduCount || 0,
          sequence_completed: completedCount || 0,
        };

        console.log(`[EmailDaily] 0 eligible prospects. Diagnostic:`, JSON.stringify(diagnostic));

        await supabase.from('agent_logs').insert({
          agent: 'email', action: 'daily_cold',
          data: { total: 0, success: 0, failed: 0, diagnostic, message: 'Aucun prospect éligible' },
          created_at: nowISO,
        });

        return NextResponse.json({
          ok: true, mode: 'cold', stats: { total: 0, success: 0, failed: 0 },
          diagnostic,
          message: 'Aucun prospect éligible pour envoi email. Vérifiez le diagnostic.',
          results: [],
        });
      }

      let step1Count = 0;
      const MAX_STEP1_PER_DAY = isManualTrigger ? 200 : 50;
      // Manual trigger: no delay, send immediately
      // Cron trigger: wait 1h after import before first contact
      const MIN_HOURS_BEFORE_FIRST_EMAIL = isManualTrigger ? 0 : 1;
      let skippedVerification = 0;
      let skippedTooRecent = 0;
      let skippedWaitingNextStep = 0;
      let skippedMaxDaily = 0;

      for (const prospect of prospects) {
        const category = getSequenceForProspect(prospect);

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

        if (step === 0) {
          // First email in sequence
          if (hoursSinceCreation < MIN_HOURS_BEFORE_FIRST_EMAIL) {
            skippedTooRecent++;
            continue;
          }
          if (step1Count >= MAX_STEP1_PER_DAY) {
            skippedMaxDaily++;
            continue;
          }

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
          if (daysSinceLastSent < 4) { skippedWaitingNextStep++; continue; }
          const result = await sendEmailDirect(prospect, 2);
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            step: 2,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
          });
        } else if (step === 2 && lastSent) {
          const daysSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastSent < 5) { skippedWaitingNextStep++; continue; }
          const result = await sendEmailDirect(prospect, 3);
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            step: 3,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
          });
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
        } else if (step === 1 && !lastSent) {
          // Step 1 but no last_sent timestamp — resend or advance
          skippedWaitingNextStep++;
        }
      }

      const skipDiagnostic = {
        verification: skippedVerification,
        too_recent: skippedTooRecent,
        waiting_next_step: skippedWaitingNextStep,
        max_daily_reached: skippedMaxDaily,
      };
      console.log(`[EmailDaily] Skipped:`, JSON.stringify(skipDiagnostic));
    }

    // --- Log summary ---
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    // Batch fetch prospect types (avoid N+1 queries)
    const byBusinessType: Record<string, { sent: number; failed: number; steps: number[] }> = {};
    if (results.length > 0 && type !== 'warm') {
      const prospectIds = [...new Set(results.map(r => r.prospect_id))];
      const { data: prospectTypes } = await supabase
        .from('crm_prospects')
        .select('id, type, company')
        .in('id', prospectIds);

      const typeMap: Record<string, string> = {};
      if (prospectTypes) {
        for (const p of prospectTypes) typeMap[p.id] = p.type || 'unknown';
      }

      for (const r of results) {
        const bType = typeMap[r.prospect_id] || 'unknown';
        if (!byBusinessType[bType]) byBusinessType[bType] = { sent: 0, failed: 0, steps: [] };
        if (r.success) byBusinessType[bType].sent++;
        else byBusinessType[bType].failed++;
        byBusinessType[bType].steps.push(r.step);
      }
    }

    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: type === 'warm' ? 'daily_warm' : 'daily_cold',
      data: {
        total: results.length,
        success: successCount,
        failed: failCount,
        provider: 'resend+brevo',
        manual: isManualTrigger,
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

    return NextResponse.json({
      ok: true,
      mode: type === 'warm' ? 'warm' : 'cold',
      provider: 'resend+brevo',
      manual: isManualTrigger,
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
