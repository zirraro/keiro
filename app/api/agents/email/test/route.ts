import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getEmailTemplate } from '@/lib/agents/email-templates';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/agents/email/test
 * Send a test email to any address without creating a prospect.
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

    if (!process.env.BREVO_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'BREVO_API_KEY non configuree' },
        { status: 500 }
      );
    }

    const vars: Record<string, string> = {
      first_name: first_name || 'Oussama',
      company: company || 'KeiroAI Test',
      type: category || 'agence',
      quartier: 'Paris 11e',
      note_google: '4.8',
    };

    const selectedCategory = category || 'agence';
    const variant = Math.floor(Math.random() * 3);
    const template = getEmailTemplate(selectedCategory, step, vars, variant);

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Oussama \u2014 KeiroAI', email: 'contact@keiroai.com' },
        to: [{ email, name: company || first_name || 'Test' }],
        subject: `[TEST] ${template.subject}`,
        htmlContent: template.htmlBody,
        textContent: template.textBody,
        tags: ['test-email', `step-${step}`, selectedCategory],
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      return NextResponse.json(
        { ok: false, error: 'Erreur envoi Brevo', details: errorText },
        { status: 502 }
      );
    }

    const brevoData = await brevoResponse.json();
    const messageId = brevoData.messageId || brevoData.messageIds?.[0] || 'unknown';

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
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      messageId,
      subject: template.subject,
      category: selectedCategory,
      variant,
    });
  } catch (error: any) {
    console.error('[EmailTest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
