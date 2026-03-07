import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/agents/email/send
 * Send a single email to a prospect via Brevo.
 * Auth: CRON_SECRET header OR authenticated admin user.
 */
export async function POST(request: NextRequest) {
  try {
    // --- Auth check: CRON_SECRET or admin ---
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    let isAuthorized = false;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      const { user, error: authError } = await getAuthUser();
      if (authError || !user) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }

      const supabaseAuth = getSupabaseAdmin();
      const { data: profile } = await supabaseAuth
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!profile?.is_admin) {
        return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { prospect_id, template_step, subject_variant } = body as {
      prospect_id: string;
      template_step: number;
      subject_variant?: number;
    };

    if (!prospect_id || template_step === undefined) {
      return NextResponse.json(
        { ok: false, error: 'prospect_id et template_step sont requis' },
        { status: 400 }
      );
    }

    if (!process.env.BREVO_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'BREVO_API_KEY non configuree' },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // --- Fetch prospect ---
    const { data: prospect, error: prospectError } = await supabase
      .from('crm_prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (prospectError || !prospect) {
      return NextResponse.json(
        { ok: false, error: 'Prospect non trouve' },
        { status: 404 }
      );
    }

    if (!prospect.email) {
      return NextResponse.json(
        { ok: false, error: 'Prospect sans email' },
        { status: 400 }
      );
    }

    // --- Get template ---
    const category = getSequenceForProspect(prospect);
    const selectedVariant = subject_variant ?? Math.floor(Math.random() * 3);
    const vars: Record<string, string> = {
      first_name: prospect.first_name || '',
      company: prospect.company || '',
      type: prospect.type || '',
      quartier: prospect.quartier || '',
      note_google: prospect.note_google != null ? String(prospect.note_google) : '',
    };
    const template = getEmailTemplate(category, template_step, vars, selectedVariant);

    // --- Send via Brevo ---
    console.log(`[EmailAgent] Sending step ${template_step} to ${prospect.email} (variant ${selectedVariant})`);

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Oussama \u2014 KeiroAI', email: 'contact@keiroai.com' },
        to: [{ email: prospect.email, name: prospect.company || prospect.first_name || '' }],
        subject: template.subject,
        htmlContent: template.htmlBody,
        textContent: template.textBody,
        headers: { 'X-Mailin-custom': prospect_id },
        tags: ['cold-sequence', `step-${template_step}`, category],
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      console.error('[EmailAgent] Brevo API error:', errorText);
      return NextResponse.json(
        { ok: false, error: 'Erreur envoi Brevo', details: errorText },
        { status: 502 }
      );
    }

    const brevoData = await brevoResponse.json();
    const messageId = brevoData.messageId || brevoData.messageIds?.[0] || 'unknown';

    console.log('[EmailAgent] Email sent, messageId:', messageId);

    // --- Update prospect ---
    await supabase
      .from('crm_prospects')
      .update({
        email_sequence_step: template_step,
        last_email_sent_at: now,
        email_sequence_status: 'in_progress',
        email_subject_variant: selectedVariant,
        updated_at: now,
      })
      .eq('id', prospect_id);

    // --- Create CRM activity ---
    await supabase.from('crm_activities').insert({
      prospect_id,
      type: 'email',
      description: `Email step ${template_step} envoye: "${template.subject}"`,
      data: {
        message_id: messageId,
        step: template_step,
        subject: template.subject,
        variant: selectedVariant,
        category,
      },
      created_at: now,
    });

    // --- Log to agent_logs ---
    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: 'email_sent',
      data: {
        prospect_id,
        prospect_email: prospect.email,
        company: prospect.company,
        step: template_step,
        subject: template.subject,
        variant: selectedVariant,
        message_id: messageId,
      },
      created_at: now,
    });

    return NextResponse.json({
      ok: true,
      messageId,
    });
  } catch (error: any) {
    console.error('[EmailAgent] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
