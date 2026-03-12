import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { verifyProspectData } from '@/lib/agents/business-timing';
import { callGemini } from '@/lib/agents/gemini';

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
  ai_generated?: boolean;
}

/**
 * Load agent learnings from past performance data.
 * Returns insights the agent has accumulated over time.
 */
async function loadAgentLearnings(): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Load explicit learnings
  const { data: memories } = await supabase
    .from('agent_logs')
    .select('data')
    .eq('agent', 'email')
    .eq('action', 'memory')
    .order('created_at', { ascending: false })
    .limit(15);

  // Load performance stats from recent runs
  const { data: recentRuns } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'email')
    .in('action', ['daily_cold', 'daily_warm', 'performance_learning'])
    .order('created_at', { ascending: false })
    .limit(5);

  let context = '';

  if (memories && memories.length > 0) {
    const learnings = memories.map((m: any) => m.data?.learning).filter(Boolean);
    if (learnings.length > 0) {
      context += 'APPRENTISSAGES ACCUMULÉS :\n' + learnings.map((l: string) => `- ${l}`).join('\n') + '\n\n';
    }
  }

  if (recentRuns && recentRuns.length > 0) {
    context += 'RÉSULTATS RÉCENTS :\n';
    for (const run of recentRuns) {
      const d = run.data;
      if (d?.total !== undefined) {
        context += `- ${new Date(run.created_at).toLocaleDateString('fr-FR')}: ${d.success || 0} envoyés, ${d.failed || 0} échoués\n`;
      }
      if (d?.best_performing) {
        context += `  Meilleur: ${d.best_performing}\n`;
      }
    }
  }

  return context;
}

/**
 * Generate a batch of personalized emails using Gemini AI.
 * One AI call for up to 10 prospects = efficient + intelligent.
 */
async function generateAIEmails(
  prospects: Array<{ prospect: any; category: string; step: number }>,
  learnings: string,
): Promise<Map<string, { subject: string; textBody: string; htmlBody: string }>> {
  const results = new Map<string, { subject: string; textBody: string; htmlBody: string }>();

  if (!process.env.GEMINI_API_KEY || prospects.length === 0) return results;

  // Build batch prompt
  const prospectList = prospects.map((p, i) => {
    const pr = p.prospect;
    return `PROSPECT ${i + 1} (id: ${pr.id}):
- Entreprise: ${pr.company || '(inconnu)'}
- Prénom: ${pr.first_name || ''}
- Type: ${p.category}
- Quartier: ${pr.quartier || 'Paris'}
- Note Google: ${pr.note_google || 'non connue'}
- Email: ${pr.email}
- Step: ${p.step} (${p.step === 1 ? 'premier contact' : p.step === 2 ? 'relance' : p.step === 3 ? 'dernière chance' : 'warm follow-up'})
- Instagram: ${pr.instagram ? '@' + pr.instagram : 'non connu'}
- Score: ${pr.score || 0}/100`;
  }).join('\n\n');

  try {
    const rawText = await callGemini({
      system: `Tu es Victor, expert commercial chez KeiroAI — une plateforme IA de création de contenu visuel (images, vidéos, posts réseaux sociaux) pour les commerces locaux et PME en France.

TON OBJECTIF : écrire des emails de prospection qui CONVERTISSENT. Pas des emails corporate — des vrais emails humains, directs, qui donnent envie de répondre.

RÈGLES D'OR :
1. TUTOIEMENT naturel (tu, ton, ta, tes) — jamais "vous"
2. Sois COURT : 4-6 lignes max pour le corps. Les gens lisent sur mobile.
3. UN SEUL call-to-action clair : "Teste gratuitement" ou "Regarde ce qu'on fait pour [type]"
4. Personnalise CHAQUE email : mentionne le nom du commerce, le quartier, la note Google si dispo
5. Ton = ami entrepreneur qui conseille, PAS un vendeur
6. ROI concret : "Ça te coûte moins qu'un café par jour" / "5 couverts de plus et c'est rentabilisé"
7. Signature : Victor de KeiroAI (JAMAIS Oussama)
8. Si step 2 (relance) : référence l'email précédent, sois plus direct
9. Si step 3 (dernière chance) : crée l'urgence sans être agressif
10. Pas de "Cher", pas de "Madame/Monsieur", pas de formalités

STYLE QUI MARCHE :
- "Salut [prénom]," ou "Hey [prénom],"
- Question d'accroche liée à LEUR business
- 1-2 phrases de valeur
- CTA direct
- "Victor ✌️" ou "Victor — KeiroAI"

STYLE QUI NE MARCHE PAS :
- Emails longs (> 8 lignes)
- Vocabulaire corporate ("nous vous proposons", "n'hésitez pas")
- Flatterie excessive
- Templates évidents

${learnings}

CONSIGNE : Pour chaque prospect, génère un email personnalisé.
Réponds en JSON — un tableau d'objets, un par prospect :
[
  {
    "id": "prospect_id",
    "subject": "Objet percutant (< 50 chars)",
    "body": "Corps du mail (4-6 lignes, tutoiement)"
  }
]

UNIQUEMENT du JSON valide, pas de markdown, pas d'explication.`,
      message: prospectList,
      maxTokens: 3000,
    });

    // Parse JSON array
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[EmailDaily] AI batch: no JSON array found');
      return results;
    }

    const emails = JSON.parse(jsonMatch[0]);
    for (const email of emails) {
      if (!email.id || !email.subject || !email.body) continue;

      // Build HTML version
      const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f4f4f7;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#fff;padding:24px 20px;border:1px solid #e5e7eb;border-radius:8px;">
${email.body.split('\n').map((line: string) => `<p style="margin:8px 0;">${line}</p>`).join('')}
<p style="margin:20px 0;text-align:center;"><a href="https://keiroai.com/generate" style="display:inline-block;background:linear-gradient(to right,#9333ea,#2563eb);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:15px;">Découvrir KeiroAI</a></p>
<p style="margin:14px 0;font-size:13px;color:#6b7280;border-left:3px solid #9333ea;padding-left:12px;">+200 entrepreneurs utilisent KeiroAI pour leur marketing.</p>
</div>
<div style="padding:12px;text-align:center;color:#9ca3af;font-size:11px;">
<a href="https://keiroai.com" style="color:#9333ea;text-decoration:none;">keiroai.com</a> · <a href="https://keiroai.com/unsubscribe" style="color:#c0c0c0;">Se désinscrire</a>
</div></div></body></html>`;

      results.set(email.id, {
        subject: email.subject,
        textBody: email.body,
        htmlBody,
      });
    }

    console.log(`[EmailDaily] AI generated ${results.size}/${prospects.length} emails`);
  } catch (error: any) {
    console.error('[EmailDaily] AI batch generation failed:', error.message);
  }

  return results;
}

/**
 * Auto-learn from email performance.
 * Called at the end of each run to save insights.
 */
async function autoLearn(results: SendResult[], supabase: any) {
  // Check for email engagement data (opens, clicks from webhook)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentActivity } = await supabase
    .from('crm_activities')
    .select('prospect_id, type, data')
    .in('type', ['email_opened', 'email_clicked', 'email_replied'])
    .gte('created_at', oneWeekAgo)
    .limit(50);

  if (!recentActivity || recentActivity.length === 0) return;

  const opens = recentActivity.filter((a: any) => a.type === 'email_opened').length;
  const clicks = recentActivity.filter((a: any) => a.type === 'email_clicked').length;
  const replies = recentActivity.filter((a: any) => a.type === 'email_replied').length;

  // Find which categories/steps perform best
  const byCategory: Record<string, { opens: number; clicks: number }> = {};
  for (const activity of recentActivity) {
    const cat = activity.data?.category || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { opens: 0, clicks: 0 };
    if (activity.type === 'email_opened') byCategory[cat].opens++;
    if (activity.type === 'email_clicked') byCategory[cat].clicks++;
  }

  const bestCategory = Object.entries(byCategory)
    .sort((a, b) => (b[1].clicks + b[1].opens) - (a[1].clicks + a[1].opens))[0];

  if (bestCategory) {
    const learning = `Semaine du ${new Date().toLocaleDateString('fr-FR')}: ${opens} ouvertures, ${clicks} clics, ${replies} réponses. Meilleure catégorie: ${bestCategory[0]} (${bestCategory[1].opens} opens, ${bestCategory[1].clicks} clicks).`;

    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: 'memory',
      data: {
        learning,
        source: 'auto_performance',
        metrics: { opens, clicks, replies, best_category: bestCategory[0] },
        learned_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    });

    console.log(`[EmailDaily] Auto-learning saved: ${learning}`);
  }
}

/**
 * Send a single email via Resend + Brevo fallback.
 */
async function sendEmail(
  prospect: any,
  step: number,
  template: { subject: string; htmlBody: string; textBody: string },
  category: string,
): Promise<{ success: boolean; messageId?: string; error?: string; provider?: string }> {
  try {
    // Final safety checks
    if (template.textBody.includes('{{') || template.subject.includes('{{')) {
      return { success: false, error: 'Unresolved template variables' };
    }
    if (template.textBody.includes('Oussama') || template.htmlBody.includes('Oussama')) {
      template.textBody = template.textBody.replace(/Oussama/g, 'Victor');
      template.htmlBody = template.htmlBody.replace(/Oussama/g, 'Victor');
    }
    const disposableDomains = ['yopmail.com', 'guerrillamail.com', 'tempmail.com', 'mailinator.com', 'throwaway.email'];
    const emailDomain = (prospect.email || '').split('@')[1]?.toLowerCase();
    if (emailDomain && disposableDomains.includes(emailDomain)) {
      return { success: false, error: 'Disposable email' };
    }

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
        console.warn(`[EmailDaily] Resend error, trying Brevo:`, resendError.message);
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
        } else {
          const errorText = await brevoResponse.text();
          console.error(`[EmailDaily] Brevo also failed:`, errorText);
        }
      } catch (brevoError: any) {
        console.error(`[EmailDaily] Brevo error:`, brevoError.message);
      }
    }

    if (!sendSuccess) {
      return { success: false, error: 'Resend + Brevo both failed' };
    }

    // Update prospect in DB
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    await supabase
      .from('crm_prospects')
      .update({
        email_sequence_step: step,
        last_email_sent_at: now,
        email_sequence_status: step === 10 ? 'warm_sent' : 'in_progress',
        email_provider: provider,
        updated_at: now,
      })
      .eq('id', prospect.id);

    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'email',
      description: `Email step ${step} envoyé: "${template.subject}"`,
      data: {
        message_id: messageId,
        step,
        subject: template.subject,
        category,
        source: 'daily_cron',
        provider,
        ai_generated: true,
      },
      created_at: now,
    });

    console.log(`[EmailDaily] ✓ ${prospect.email} (step ${step}, ${category}) via ${provider}`);
    return { success: true, messageId, provider };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * GET /api/agents/email/daily
 */
export async function GET(request: NextRequest) {
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

  const isCronTrigger = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const isManualTrigger = !isCronTrigger;

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();
  const type = request.nextUrl.searchParams.get('type');

  const results: SendResult[] = [];

  try {
    // Load agent learnings for AI generation
    const learnings = await loadAgentLearnings();

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
        .or('status.is.null,status.not.in.("sprint","client","perdu")');

      console.log(`[EmailDaily] Warm prospects: ${warmProspects?.length ?? 0}`);

      if (warmProspects && warmProspects.length > 0) {
        // AI-generate warm emails
        const batchInput = warmProspects.map(p => ({
          prospect: p,
          category: getSequenceForProspect(p),
          step: 10,
        }));

        const aiEmails = await generateAIEmails(batchInput, learnings);

        for (const prospect of warmProspects) {
          const aiEmail = aiEmails.get(prospect.id);
          const template = aiEmail || getEmailTemplate(getSequenceForProspect(prospect), 10, {
            first_name: prospect.first_name || '',
            company: prospect.company || '',
            type: prospect.type || '',
            quartier: prospect.quartier || '',
            note_google: prospect.note_google != null ? String(prospect.note_google) : '',
          }, 0);

          const result = await sendEmail(prospect, 10, template, getSequenceForProspect(prospect));
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            step: 10,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
            ai_generated: !!aiEmail,
          });
        }
      }
    } else {
      // --- Default: cold sequences ---
      console.log(`[EmailDaily] Running cold sequence (manual=${isManualTrigger})...`);

      const { data: prospects, error: queryError } = await supabase
        .from('crm_prospects')
        .select('*')
        .not('email', 'is', null)
        .or('email_sequence_status.is.null,email_sequence_status.eq.not_started,email_sequence_status.eq.in_progress')
        .or('temperature.is.null,temperature.neq.dead')
        .or('status.is.null,status.not.in.("client","perdu","sprint")');

      if (queryError) {
        console.error('[EmailDaily] Query error:', queryError.message);
        return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
      }

      console.log(`[EmailDaily] Eligible prospects: ${prospects?.length ?? 0}`);

      if (!prospects || prospects.length === 0) {
        const { count: totalCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true });
        const { count: withEmail } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('email', 'is', null);
        const { count: deadCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'dead');

        const diagnostic = { total_crm: totalCount || 0, with_email: withEmail || 0, dead: deadCount || 0 };
        console.log(`[EmailDaily] Diagnostic:`, JSON.stringify(diagnostic));

        await supabase.from('agent_logs').insert({
          agent: 'email', action: 'daily_cold',
          data: { total: 0, success: 0, failed: 0, diagnostic },
          created_at: nowISO,
        });

        return NextResponse.json({ ok: true, stats: { total: 0, success: 0, failed: 0 }, diagnostic });
      }

      let step1Count = 0;
      const MAX_STEP1_PER_DAY = isManualTrigger ? 200 : 50;
      const MIN_HOURS_BEFORE_FIRST_EMAIL = isManualTrigger ? 0 : 1;

      let skippedVerification = 0;
      let skippedTooRecent = 0;
      let skippedWaitingNextStep = 0;
      let skippedMaxDaily = 0;

      // Collect prospects for AI batch generation
      const batchForAI: Array<{ prospect: any; category: string; step: number }> = [];

      for (const prospect of prospects) {
        const category = getSequenceForProspect(prospect);

        const verification = verifyProspectData(prospect);
        if (!verification.valid) { skippedVerification++; continue; }

        const step = prospect.email_sequence_step ?? 0;
        const lastSent = prospect.last_email_sent_at ? new Date(prospect.last_email_sent_at) : null;
        const created = new Date(prospect.created_at);
        const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

        if (step === 0) {
          if (hoursSinceCreation < MIN_HOURS_BEFORE_FIRST_EMAIL) { skippedTooRecent++; continue; }
          if (step1Count >= MAX_STEP1_PER_DAY) { skippedMaxDaily++; continue; }
          batchForAI.push({ prospect, category, step: 1 });
          step1Count++;
        } else if (step === 1 && lastSent) {
          const days = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
          if (days < 4) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 2 });
        } else if (step === 2 && lastSent) {
          const days = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
          if (days < 5) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 3 });
        } else if (step === 3) {
          await supabase.from('crm_prospects').update({
            email_sequence_status: 'completed',
            updated_at: nowISO,
          }).eq('id', prospect.id);
          results.push({ prospect_id: prospect.id, email: prospect.email, step: 3, success: true });
        } else if (step === 1 && !lastSent) {
          skippedWaitingNextStep++;
        }
      }

      // AI batch generation (one Gemini call for all emails)
      let aiEmails = new Map<string, { subject: string; textBody: string; htmlBody: string }>();
      if (batchForAI.length > 0 && process.env.GEMINI_API_KEY) {
        // Process in batches of 10 to stay within token limits
        for (let i = 0; i < batchForAI.length; i += 10) {
          const batch = batchForAI.slice(i, i + 10);
          const batchResult = await generateAIEmails(batch, learnings);
          batchResult.forEach((v, k) => aiEmails.set(k, v));
        }
      }

      // Send all emails
      for (const { prospect, category, step } of batchForAI) {
        const aiEmail = aiEmails.get(prospect.id);

        // Fallback to template if AI failed
        const template = aiEmail || getEmailTemplate(category, step, {
          first_name: prospect.first_name || '',
          company: prospect.company || '',
          type: prospect.type || '',
          quartier: prospect.quartier || '',
          note_google: prospect.note_google != null ? String(prospect.note_google) : '',
        }, Math.floor(Math.random() * 3));

        const result = await sendEmail(prospect, step, template, category);
        results.push({
          prospect_id: prospect.id,
          email: prospect.email,
          step,
          success: result.success,
          error: result.error,
          messageId: result.messageId,
          ai_generated: !!aiEmail,
        });
      }

      const skipDiagnostic = {
        verification: skippedVerification,
        too_recent: skippedTooRecent,
        waiting_next_step: skippedWaitingNextStep,
        max_daily_reached: skippedMaxDaily,
      };
      console.log(`[EmailDaily] Skipped:`, JSON.stringify(skipDiagnostic));
    }

    // --- Summary & Logging ---
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const aiCount = results.filter(r => r.ai_generated).length;

    // Business type breakdown
    const byBusinessType: Record<string, { sent: number; failed: number; steps: number[] }> = {};
    if (results.length > 0 && type !== 'warm') {
      const prospectIds = [...new Set(results.map(r => r.prospect_id))];
      const { data: prospectTypes } = await supabase
        .from('crm_prospects')
        .select('id, type')
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
        ai_generated: aiCount,
        provider: 'resend+brevo',
        manual: isManualTrigger,
        by_business_type: byBusinessType,
        results: results.map(r => ({
          prospect_id: r.prospect_id,
          step: r.step,
          success: r.success,
          error: r.error,
          ai: r.ai_generated,
        })),
      },
      created_at: nowISO,
    });

    // Auto-learn from performance
    await autoLearn(results, supabase);

    // Report to CEO
    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: 'report_to_ceo',
      data: {
        phase: 'completed',
        message: `Email: ${successCount} envoyés (${aiCount} IA), ${failCount} échoués | ${isManualTrigger ? 'manuel' : 'cron'}`,
      },
      created_at: nowISO,
    });

    console.log(`[EmailDaily] Done: ${successCount} sent (${aiCount} AI), ${failCount} failed`);

    return NextResponse.json({
      ok: true,
      mode: type === 'warm' ? 'warm' : 'cold',
      provider: 'resend+brevo',
      manual: isManualTrigger,
      stats: { total: results.length, success: successCount, failed: failCount, ai_generated: aiCount },
      results,
    });
  } catch (error: any) {
    console.error('[EmailDaily] Error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
