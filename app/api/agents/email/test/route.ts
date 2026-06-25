import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { callGemini } from '@/lib/agents/gemini';

/** Email de test — généré par l'IA Victor (value-first, tutoiement, HTML propre)
 *  pour refléter la VRAIE qualité, pas un vieux template statique. */
async function generateVictorTestEmail(vars: Record<string, string>, step: number): Promise<{ subject: string; html: string; text: string } | null> {
  const sys = `Tu es Victor de KeiroAI (plateforme qui génère images/vidéos/posts pour commerces locaux). Écris UN email de prospection court, NATUREL, en TUTOIEMENT.
STRATÉGIE VALUE-FIRST : tu rends service avant de vendre. Mets en avant l'ESSAI GRATUIT comme un cadeau sans risque ("essaie, c'est gratuit, 3 min, tu juges"). Hyper-personnalisé sur SON commerce et ce que ÇA lui apporte.
RÈGLES: commence par "Salut ${vars.first_name || ''}," — JAMAIS "Bonjour/vous/votre/cher/cordialement". Max 6 lignes. Pas de bullet points, pas de "saviez-vous que X%". Signe "Victor" (une fois). Un seul P.S. optionnel avec l'essai gratuit.
Réponds en JSON STRICT: {"subject":"objet court sans emoji, en tu","body":"corps en texte brut, lignes séparées par \\n, AUCUNE balise HTML"}`;
  try {
    const raw = await callGemini({ system: sys, message: `Commerce: ${vars.company || ''} (type ${vars.type || 'commerce'}). Step ${step}. Écris l'email.`, maxTokens: 500 });
    let txt = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const j = JSON.parse(txt);
    const subject = String(j.subject || 'Un coup de main pour ta com').slice(0, 120);
    const bodyLines = String(j.body || '').split('\n')
      .map((l: string) => l.replace(/<\/?[a-z][^>]*>/gi, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim())
      .filter(Boolean);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f4f4f7;margin:0;padding:0;"><div style="max-width:600px;margin:0 auto;padding:20px;"><div style="background:#fff;padding:24px 20px;border:1px solid #e5e7eb;border-radius:8px;">${bodyLines.map((l: string) => `<p style="margin:8px 0;font-size:15px;">${l}</p>`).join('')}</div><div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;"><a href="https://keiroai.com" style="color:#0c1a3a;text-decoration:none;">keiroai.com</a></div></div></body></html>`;
    return { subject, html, text: bodyLines.join('\n') };
  } catch { return null; }
}

export const runtime = 'nodejs';
export const maxDuration = 120;

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
    const orgId = body?.org_id || null;
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

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'RESEND_API_KEY non configurée' },
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
    // IA Victor (vraie qualité, value-first). Fallback template statique seulement
    // si l'IA échoue (au pire l'admin voit le fallback, mais le défaut = l'IA).
    const ai = await generateVictorTestEmail(vars, step);
    const template = ai
      ? { subject: ai.subject, htmlBody: ai.html, textBody: ai.text }
      : getEmailTemplate(selectedCategory, step, vars, variant);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Victor de KeiroAI <contact@keiroai.com>',
        to: [email],
        subject: `[TEST] ${template.subject}`,
        html: template.htmlBody,
        text: template.textBody,
        tags: [
          { name: 'type', value: 'test-email' },
          { name: 'step', value: String(step) },
          { name: 'category', value: selectedCategory },
        ],
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      return NextResponse.json(
        { ok: false, error: 'Erreur envoi Resend', details: errorText },
        { status: 502 }
      );
    }

    const resendData = await resendResponse.json();
    const messageId = resendData.id || 'unknown';

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
        provider: 'resend',
      },
      created_at: new Date().toISOString(),
      ...(orgId ? { org_id: orgId } : {}),
    });

    return NextResponse.json({
      ok: true,
      messageId,
      subject: template.subject,
      category: selectedCategory,
      variant,
      provider: 'resend',
    });
  } catch (error: any) {
    console.error('[EmailTest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
