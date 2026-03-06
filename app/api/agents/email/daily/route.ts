import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';

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
 * Send a single email via Brevo (inline, no internal route call).
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
    const template = getEmailTemplate(category, step, vars, selectedVariant);

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Oussama \u2014 KeiroAI', email: 'oussama@keiroai.com' },
        to: [{ email: prospect.email, name: prospect.company || prospect.first_name || '' }],
        subject: template.subject,
        htmlContent: template.htmlBody,
        textContent: template.textBody,
        headers: { 'X-Mailin-custom': prospect.id },
        tags: ['cold-sequence', `step-${step}`, category],
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      return { success: false, error: errorText };
    }

    const brevoData = await brevoResponse.json();
    const messageId = brevoData.messageId || brevoData.messageIds?.[0] || 'unknown';

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
      description: `Email step ${step} envoye: "${template.subject}"`,
      data: {
        message_id: messageId,
        step,
        subject: template.subject,
        variant: selectedVariant,
        category,
        source: 'daily_cron',
      },
      created_at: now,
    });

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
  // --- Auth: CRON_SECRET ---
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.BREVO_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'BREVO_API_KEY non configuree' },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();
  const type = request.nextUrl.searchParams.get('type');

  const results: SendResult[] = [];

  try {
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
      console.log('[EmailDaily] Running cold sequence mode...');

      const { data: prospects } = await supabase
        .from('crm_prospects')
        .select('*')
        .not('email', 'is', null)
        .in('email_sequence_status', ['not_started', 'in_progress'])
        .neq('temperature', 'dead')
        .not('status', 'in', '("client","perdu")');

      console.log(`[EmailDaily] Eligible prospects: ${prospects?.length ?? 0}`);

      let step1Count = 0;
      const MAX_STEP1_PER_DAY = 50;

      for (const prospect of prospects || []) {
        const step = prospect.email_sequence_step ?? 0;
        const lastSent = prospect.last_email_sent_at
          ? new Date(prospect.last_email_sent_at)
          : null;
        const created = new Date(prospect.created_at);
        const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

        if (step === 0 && hoursSinceCreation >= 24) {
          // Step 0 -> Send Email 1 (max 50/day)
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
          // Step 1 -> Send Email 2 after 4 days
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
          // Step 2 -> Send Email 3 after 5 days
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
          // Step 3 -> Mark sequence as completed
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
    }

    // --- Log summary to agent_logs ---
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: type === 'warm' ? 'daily_warm' : 'daily_cold',
      data: {
        total: results.length,
        success: successCount,
        failed: failCount,
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
