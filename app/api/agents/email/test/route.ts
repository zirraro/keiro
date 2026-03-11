import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { sendEmail } from '@/lib/agents/email-sender';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/agents/email/test
 * Send a test email to any address via Resend without creating a prospect.
 * Auth: admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { email, step, category, company, first_name } = body as {
      email: string;
      step: number;
      category?: string;
      company?: string;
      first_name?: string;
    };

    if (!email || !step) {
      return NextResponse.json(
        { ok: false, error: 'email et step sont requis' },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'Aucun provider email configuré (BREVO_API_KEY ou RESEND_API_KEY requis)' },
        { status: 500 }
      );
    }

    const vars: Record<string, string> = {
      first_name: first_name || 'Victor',
      company: company || 'KeiroAI Test',
      type: category || 'agence',
      quartier: 'Paris 11e',
      note_google: '4.8',
    };

    const selectedCategory = category || 'agence';
    const variant = Math.floor(Math.random() * 3);
    const template = getEmailTemplate(selectedCategory, step, vars, variant);

    const emailResult = await sendEmail({
      from_name: 'Victor de KeiroAI',
      from_email: 'contact@keiroai.com',
      to: [email],
      subject: `[TEST] ${template.subject}`,
      html: template.htmlBody,
      text: template.textBody,
      tags: [
        { name: 'type', value: 'test-email' },
        { name: 'step', value: String(step) },
        { name: 'category', value: selectedCategory },
      ],
    });

    if (!emailResult.ok) {
      return NextResponse.json(
        { ok: false, error: `Erreur envoi ${emailResult.provider}`, details: emailResult.error },
        { status: 502 }
      );
    }

    const messageId = emailResult.messageId || 'unknown';

    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: 'test_email',
      data: {
        email,
        step,
        category: selectedCategory,
        subject: template.subject,
        variant,
        message_id: messageId,
        provider: emailResult.provider,
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      messageId,
      subject: template.subject,
      category: selectedCategory,
      variant,
      provider: emailResult.provider,
    });
  } catch (error: any) {
    console.error('[EmailTest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
