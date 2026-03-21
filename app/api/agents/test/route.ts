import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getEmailTemplate } from '@/lib/agents/email-templates';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/agents/test
 * Test the full agent pipeline: creates a test prospect and sends an email.
 * Admin only.
 *
 * Body: { email: string, type?: string, company?: string, action?: 'email' | 'ceo' | 'all' }
 */
export async function POST(request: NextRequest) {
  // Auth: admin only
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
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json();
  const orgId = body?.org_id || null;
  const testEmail = body.email || 'mrzirraro@gmail.com';
  const testType = body.type || 'restaurant';
  const testCompany = body.company || 'Restaurant Test KeiroAI';
  const action = body.action || 'all';

  const results: Record<string, any> = {};
  const now = new Date().toISOString();

  try {
    // --- 1. Upsert test prospect ---
    const { data: existingProspect } = await supabase
      .from('crm_prospects')
      .select('*')
      .eq('email', testEmail)
      .single();

    let prospectId: string;

    if (existingProspect) {
      prospectId = existingProspect.id;
      // Reset sequence for re-testing
      await supabase
        .from('crm_prospects')
        .update({
          email_sequence_step: 0,
          email_sequence_status: 'not_started',
          type: testType,
          company: testCompany,
          updated_at: now,
        })
        .eq('id', prospectId);
      results.prospect = { action: 'reset', id: prospectId };
    } else {
      const { data: newProspect, error: insertError } = await supabase
        .from('crm_prospects')
        .insert({
          email: testEmail,
          first_name: testEmail.split('@')[0],
          company: testCompany,
          type: testType,
          source: 'admin_test',
          status: 'identifie',
          temperature: 'warm',
          score: 30,
          email_sequence_step: 0,
          email_sequence_status: 'not_started',
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ ok: false, error: `Prospect creation failed: ${insertError.message}` }, { status: 500 });
      }
      prospectId = newProspect.id;
      results.prospect = { action: 'created', id: prospectId };
    }

    // --- 2. Test email sending ---
    if (action === 'email' || action === 'all') {
      if (!process.env.BREVO_API_KEY) {
        results.email = { ok: false, error: 'BREVO_API_KEY not set' };
      } else {
        // Send step 1 cold email
        const vars: Record<string, string> = {
          first_name: testEmail.split('@')[0],
          company: testCompany,
          type: testType,
          quartier: '',
          note_google: '',
        };

        // Send all 3 steps for testing
        for (const step of [1, 2, 3]) {
          try {
            const template = getEmailTemplate(testType, step, vars, 0);

            const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY!,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                sender: { name: 'Oussama — KeiroAI', email: 'contact@keiroai.com' },
                to: [{ email: testEmail, name: testCompany }],
                subject: `[TEST Step ${step}] ${template.subject}`,
                htmlContent: template.htmlBody,
                textContent: template.textBody,
                tags: ['test', `step-${step}`, testType],
              }),
            });

            if (brevoRes.ok) {
              const brevoData = await brevoRes.json();
              results[`email_step_${step}`] = { ok: true, messageId: brevoData.messageId, subject: template.subject };
            } else {
              const errText = await brevoRes.text();
              results[`email_step_${step}`] = { ok: false, error: errText };
            }
          } catch (e: any) {
            results[`email_step_${step}`] = { ok: false, error: e.message };
          }
        }

        // Log
        await supabase.from('agent_logs').insert({
          agent: 'email',
          action: 'test_send',
          data: { email: testEmail, type: testType, results },
          created_at: now,
          ...(orgId ? { org_id: orgId } : {}),
        });
      }
    }

    // --- 3. Test CEO brief ---
    if (action === 'ceo' || action === 'all') {
      try {
        const baseUrl = new URL(request.url).origin;
        const ceoRes = await fetch(`${baseUrl}/api/agents/ceo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
        });
        const ceoData = await ceoRes.json();
        results.ceo = { ok: ceoData.ok, emailSent: ceoData.emailSent, summary: ceoData.brief?.summary?.substring(0, 200) };
      } catch (e: any) {
        results.ceo = { ok: false, error: e.message };
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    console.error('[AgentTest] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
