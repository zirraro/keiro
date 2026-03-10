import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/agents/email/send
 * Send a single email to a prospect via Resend.
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

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'RESEND_API_KEY non configurée' },
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
        { ok: false, error: 'Prospect non trouvé' },
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

    // --- Send via Resend ---
    console.log(`[EmailAgent] Sending step ${template_step} to ${prospect.email} (variant ${selectedVariant}) via Resend`);

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
          { name: 'step', value: String(template_step) },
          { name: 'category', value: category },
          { name: 'prospect_id', value: prospect_id },
        ],
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('[EmailAgent] Resend API error:', errorText);
      return NextResponse.json(
        { ok: false, error: 'Erreur envoi Resend', details: errorText },
        { status: 502 }
      );
    }

    const resendData = await resendResponse.json();
    const messageId = resendData.id || 'unknown';

    console.log('[EmailAgent] Email sent via Resend, messageId:', messageId);

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
      description: `Email step ${template_step} envoyé: "${template.subject}"`,
      data: {
        message_id: messageId,
        step: template_step,
        subject: template.subject,
        variant: selectedVariant,
        category,
        provider: 'resend',
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
        provider: 'resend',
      },
      created_at: now,
    });

    return NextResponse.json({
      ok: true,
      messageId,
      provider: 'resend',
    });
  } catch (error: any) {
    console.error('[EmailAgent] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
