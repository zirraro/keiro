import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { verifyProspectData } from '@/lib/agents/business-timing';
import { callGemini } from '@/lib/agents/gemini';
import { loadSharedContext, formatContextForPrompt } from '@/lib/agents/shared-context';

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
 * Load shared context + agent-specific learnings.
 */
async function loadAgentLearnings(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const ctx = await loadSharedContext(supabase, 'email');
  let context = formatContextForPrompt(ctx);

  // Add email-specific performance data
  const { data: recentRuns } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'email')
    .in('action', ['daily_cold', 'daily_warm'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (recentRuns && recentRuns.length > 0) {
    context += '\n\nRÉSULTATS RÉCENTS EMAIL :\n';
    for (const run of recentRuns) {
      const d = run.data;
      if (d?.total !== undefined) {
        context += `- ${new Date(run.created_at).toLocaleDateString('fr-FR')}: ${d.success || 0} envoyés (${d.ai_generated || 0} IA), ${d.failed || 0} échoués\n`;
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

  // Build batch prompt with rich prospect data
  const prospectList = prospects.map((p, i) => {
    const pr = p.prospect;
    const socialInfo = [];
    if (pr.instagram) socialInfo.push(`Instagram: @${pr.instagram}`);
    if (pr.tiktok_handle) socialInfo.push(`TikTok: @${pr.tiktok_handle}`);
    if (pr.website) socialInfo.push(`Site: ${pr.website}`);
    if (pr.google_rating) socialInfo.push(`Google: ${pr.google_rating}/5 (${pr.google_reviews || '?'} avis)`);

    return `PROSPECT ${i + 1} (id: ${pr.id}):
- Entreprise: ${pr.company || '(inconnu)'}
- Prénom: ${pr.first_name || ''}
- Type: ${p.category}
- Quartier: ${pr.quartier || 'Paris'}
- Note Google: ${pr.note_google || pr.google_rating || 'non connue'}
- Email: ${pr.email}
- Step: ${p.step} (${p.step === 1 ? 'premier contact' : p.step === 2 ? 'relance' : p.step === 3 ? 'dernière chance' : 'warm follow-up'})
- Score prospect: ${pr.score || 0}/100 (${pr.temperature || 'cold'})
- Réseaux: ${socialInfo.length > 0 ? socialInfo.join(' | ') : 'aucun trouvé'}
- Source: ${pr.source || 'import'}`;
  }).join('\n\n');

  try {
    const rawText = await callGemini({
      system: `Tu es Victor, le closer #1 de KeiroAI — une plateforme IA qui génère images, vidéos et posts réseaux sociaux pour les commerces locaux et PME en France. Ton taux de réponse est 3x la moyenne du marché.

TON OBJECTIF : écrire des emails de prospection qui déclenchent une RÉPONSE. Pas juste une ouverture — une RÉPONSE.

PSYCHOLOGIE DE VENTE :
- Le prospect se fout de toi, il veut savoir ce que TU fais pour LUI
- L'objet de l'email est 80% du travail — s'il n'ouvre pas, c'est mort
- La question > l'affirmation (une question crée un engagement mental)
- Le concret > l'abstrait ("5 clients en plus" > "booster votre visibilité")
- L'urgence naturelle > la fausse rareté ("tes concurrents postent déjà" > "offre limitée")

PERSONNALISATION INTELLIGENTE :
- Si le prospect a un Instagram : "j'ai vu ton compte @xxx, t'as du bon contenu mais..."
- Si note Google haute (>4.0) : "4.5 sur Google c'est top, mais est-ce que ça se voit sur Insta ?"
- Si note Google basse (<3.5) : ne mentionne PAS la note, focus sur "montrer le vrai toi"
- Si prospect a un site web : "ton site est clean, il manque juste du contenu frais"
- Si prospect est un restaurant : ROI = couverts, si coach : ROI = clients bookés, si boutique : ROI = passage en magasin
- Si score >50 (chaud) : sois plus direct et propose un appel

STRUCTURE EMAIL PARFAIT (step 1) :
1. "Salut [prénom]," (jamais Hey, jamais Bonjour)
2. Question d'accroche personnalisée (1 ligne)
3. Pain point spécifique à leur business (1 ligne)
4. Ce que KeiroAI fait pour eux concrètement (1-2 lignes)
5. CTA question simple : "Tu veux voir ce que ça donne pour [company] ?"
6. "Victor ✌️"

STEP 2 (relance) : "Je te relance vite fait..." + rappeler step 1 + être encore plus direct
STEP 3 (dernière chance) : Angle FOMO concurrents + "pas de souci si c'est pas le moment" (désarmer)
WARM (step 10) : "Suite à notre échange..." + très personnalisé + proposer Sprint 4.99€

INTERDICTIONS ABSOLUES :
- JAMAIS "vous/votre" → toujours "tu/ton/ta"
- JAMAIS "n'hésitez pas" / "nous vous proposons" / "cher" / "cordialement"
- JAMAIS plus de 6 lignes de corps
- JAMAIS d'emoji dans l'objet (sauf ✌️ dans la signature)
- JAMAIS mentionner le prix dans le step 1 (sauf Sprint 4.99€)
- Signature : Victor de KeiroAI (JAMAIS Oussama, JAMAIS "l'équipe KeiroAI")

${learnings}

CONSIGNE : Pour chaque prospect, génère un email UNIQUE et personnalisé.
Réponds en JSON — un tableau d'objets, un par prospect :
[
  {
    "id": "prospect_id",
    "subject": "Objet percutant < 50 chars — PAS de emoji",
    "body": "Corps du mail 4-6 lignes tutoiement"
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
 * Tracks: open/click/reply rates, best categories, best subject patterns, best steps.
 */
async function autoLearn(results: SendResult[], supabase: any) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get engagement data + email subjects for correlation
  const { data: recentActivity } = await supabase
    .from('crm_activities')
    .select('prospect_id, type, data')
    .in('type', ['email_opened', 'email_clicked', 'email_replied', 'email'])
    .gte('created_at', oneWeekAgo)
    .limit(100);

  if (!recentActivity || recentActivity.length === 0) return;

  const emailsSent = recentActivity.filter((a: any) => a.type === 'email');
  const opens = recentActivity.filter((a: any) => a.type === 'email_opened');
  const clicks = recentActivity.filter((a: any) => a.type === 'email_clicked');
  const replies = recentActivity.filter((a: any) => a.type === 'email_replied');

  // Auto-update prospect scores on engagement
  for (const reply of replies) {
    if (reply.prospect_id) {
      const { data: prospect } = await supabase
        .from('crm_prospects')
        .select('score, temperature, status')
        .eq('id', reply.prospect_id)
        .single();
      if (prospect && prospect.status !== 'client') {
        await supabase.from('crm_prospects').update({
          status: 'repondu',
          temperature: 'hot',
          score: Math.min(100, (prospect.score || 0) + 50),
          updated_at: new Date().toISOString(),
        }).eq('id', reply.prospect_id);
      }
    }
  }
  for (const click of clicks) {
    if (click.prospect_id) {
      const { data: prospect } = await supabase
        .from('crm_prospects')
        .select('score, temperature')
        .eq('id', click.prospect_id)
        .single();
      if (prospect && (prospect.temperature === 'cold' || !prospect.temperature)) {
        await supabase.from('crm_prospects').update({
          temperature: 'warm',
          score: Math.min(100, (prospect.score || 0) + 25),
          updated_at: new Date().toISOString(),
        }).eq('id', click.prospect_id);
      }
    }
  }

  // Analyze by category
  const byCategory: Record<string, { sent: number; opens: number; clicks: number; replies: number }> = {};
  for (const email of emailsSent) {
    const cat = email.data?.category || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { sent: 0, opens: 0, clicks: 0, replies: 0 };
    byCategory[cat].sent++;
  }
  for (const activity of [...opens, ...clicks, ...replies]) {
    const cat = activity.data?.category || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { sent: 0, opens: 0, clicks: 0, replies: 0 };
    if (activity.type === 'email_opened') byCategory[cat].opens++;
    if (activity.type === 'email_clicked') byCategory[cat].clicks++;
    if (activity.type === 'email_replied') byCategory[cat].replies++;
  }

  // Analyze by step
  const byStep: Record<number, { sent: number; opens: number; clicks: number }> = {};
  for (const email of emailsSent) {
    const step = email.data?.step || 1;
    if (!byStep[step]) byStep[step] = { sent: 0, opens: 0, clicks: 0 };
    byStep[step].sent++;
  }
  for (const activity of [...opens, ...clicks]) {
    const step = activity.data?.step || 1;
    if (!byStep[step]) byStep[step] = { sent: 0, opens: 0, clicks: 0 };
    if (activity.type === 'email_opened') byStep[step].opens++;
    if (activity.type === 'email_clicked') byStep[step].clicks++;
  }

  const bestCategory = Object.entries(byCategory)
    .sort((a, b) => (b[1].clicks + b[1].opens + b[1].replies * 3) - (a[1].clicks + a[1].opens + a[1].replies * 3))[0];

  const bestStep = Object.entries(byStep)
    .sort((a, b) => (b[1].clicks + b[1].opens) - (a[1].clicks + a[1].opens))[0];

  if (bestCategory) {
    // Build rich performance summary
    const totalSent = emailsSent.length;
    const openRate = totalSent > 0 ? (opens.length / totalSent * 100).toFixed(1) : '0';
    const clickRate = totalSent > 0 ? (clicks.length / totalSent * 100).toFixed(1) : '0';
    const replyRate = totalSent > 0 ? (replies.length / totalSent * 100).toFixed(1) : '0';

    const categoryBreakdown = Object.entries(byCategory)
      .map(([cat, d]) => `${cat}: ${d.sent} envoyés, ${d.opens} ouverts, ${d.clicks} clics, ${d.replies} réponses`)
      .join(' | ');

    const stepBreakdown = Object.entries(byStep)
      .map(([step, d]) => `Step ${step}: ${d.sent} envoyés, ${d.opens} ouverts, ${d.clicks} clics`)
      .join(' | ');

    const learning = `Semaine du ${new Date().toLocaleDateString('fr-FR')}: ${totalSent} envoyés, ${opens.length} ouverts (${openRate}%), ${clicks.length} clics (${clickRate}%), ${replies.length} réponses (${replyRate}%). Meilleure catégorie: ${bestCategory[0]}. Meilleur step: ${bestStep?.[0] || '?'}. Détail: ${categoryBreakdown}. Steps: ${stepBreakdown}`;

    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: 'memory',
      data: {
        learning,
        source: 'auto_performance',
        metrics: {
          total_sent: totalSent,
          opens: opens.length,
          clicks: clicks.length,
          replies: replies.length,
          open_rate: openRate,
          click_rate: clickRate,
          reply_rate: replyRate,
          best_category: bestCategory[0],
          best_step: bestStep?.[0],
          by_category: byCategory,
          by_step: byStep,
        },
        learned_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    });

    console.log(`[EmailDaily] Auto-learning: ${openRate}% open, ${clickRate}% click, ${replyRate}% reply. Best: ${bestCategory[0]}`);
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
        const { count: perduCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'perdu');
        const { count: completedCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('email_sequence_status', 'completed');
        const { count: clientCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'client');

        const diagnostic = {
          total_crm: totalCount || 0,
          with_email: withEmail || 0,
          dead: deadCount || 0,
          perdu: perduCount || 0,
          sequence_completed: completedCount || 0,
          clients: clientCount || 0,
          reason: 'Aucun prospect éligible trouvé. Vérifiez que des prospects ont un email, ne sont pas dead/perdu/client, et n\'ont pas terminé la séquence.',
        };
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
