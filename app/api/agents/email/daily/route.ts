import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { verifyProspectData, verifyCRMCoherence } from '@/lib/agents/business-timing';
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
  company?: string;
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
- Quartier: ${pr.quartier ? pr.quartier : 'INCONNU — ne mentionne PAS de quartier dans l\'email'}
- Note Google: ${pr.note_google || pr.google_rating || 'non connue'}
- Email: ${pr.email}
- Step: ${p.step} (${p.step === 1 ? 'premier contact — question + valeur' : p.step === 2 ? 'relance douce — rappel + social proof' : p.step === 3 ? 'valeur gratuite — conseil concret sans rien demander' : p.step === 4 ? 'FOMO concurrents — tes concurrents postent deja' : p.step === 5 ? 'dernière chance — direct, désarmant' : 'warm follow-up'})
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

STRUCTURE EMAIL PARFAIT (step 1) — DOIT ÊTRE NATUREL :
Exemple de bon email :
"Salut Marie,

Je suis tombé sur ton resto l'autre jour, franchement la carte a l'air top. Par contre sur Insta c'est un peu vide et je me suis dit que ça pouvait te coûter des couverts.

On a un outil qui génère des visuels pro de tes plats en 3 min, sans photographe. Quelques restaus dans ton coin l'utilisent déjà.

Tu veux que je te montre ce que ça donne ?

Victor ✌️"

Pas de bullet points, pas de stats forcées, pas de "saviez-vous que 72%...", juste une conversation naturelle entre deux personnes.

STEP 2 (relance douce, J+3) : "Je te relance vite fait..." + rappeler step 1 + social proof ("des restos comme toi utilisent déjà...")
STEP 3 (valeur gratuite, J+5) : Donne un conseil concret et actionnable sans rien demander en retour. Genre "3 astuces pour tes stories" ou "ton erreur #1 sur Insta". Pas de CTA vente, juste de la valeur. Signe "Victor ✌️" et c'est tout.
STEP 4 (FOMO concurrents, J+8) : "Tes concurrents postent déjà..." + montrer que le marché bouge + urgence naturelle + CTA direct
STEP 5 (dernière chance, J+12) : Ultra direct et désarmant. "Pas de souci si c'est pas le moment" + dernière proposition + "je te laisse tranquille après"
WARM (step 10) : "Suite à notre échange..." + très personnalisé + proposer Sprint 4.99€

VÉRIFICATION BUSINESS OBLIGATOIRE :
- AVANT d'écrire l'email, vérifie que le nom du commerce EST CRÉDIBLE. Un nom inventé/hallucinated = INTERDIT.
- Si le nom de l'entreprise ne semble pas être un vrai commerce (trop générique, incomplet, bizarre), mets "skip": true dans le JSON.
- JAMAIS inventer un quartier ou arrondissement. Si le quartier est vide/null, n'en mentionne PAS dans l'email. Dis juste "ton resto" pas "ton resto du 9ème".
- Si le quartier est fourni, utilise-le UNIQUEMENT s'il est cohérent avec le nom du commerce. En cas de doute, ne le mentionne pas.
- JAMAIS dire "je suis tombé sur [company] en cherchant les meilleurs restos du [quartier]" si tu n'es pas SÛR que c'est le bon quartier.
- Alternative sans quartier : "Salut [prénom], je suis tombé sur [company]" tout court, ça suffit.

TON NATUREL — CRITÈRES ABSOLUS :
- L'email doit ressembler à un message envoyé par un VRAI humain, pas un robot. Comme si Victor tapait le mail vite fait depuis son téléphone.
- JAMAIS de "?" en début de ligne. Une question commence par un sujet, pas par "?".
- JAMAIS de structure visible type "accroche / pain point / solution / CTA" — ça doit couler naturellement.
- Le texte doit être FLUIDE, comme une conversation. Pas de bullet points, pas de listes, pas de formatage.
- Commence par "Salut [prénom]," — JAMAIS "Bonjour" ni "Hey" ni "Cher".
- Le nom du commerce doit être utilisé comme on en parlerait à l'oral : "je suis tombé sur ton resto" pas "je suis tombé sur Restaurant Le Soleil Paris 9ème".
- Si le nom du commerce est trop long ou formel, utilise une version courte naturelle.

INTERDICTIONS ABSOLUES :
- JAMAIS "vous/votre" → toujours "tu/ton/ta"
- JAMAIS "n'hésitez pas" / "nous vous proposons" / "cher" / "cordialement" / "Bonjour"
- JAMAIS plus de 6 lignes de corps
- JAMAIS d'emoji dans l'objet (sauf ✌️ dans la signature)
- JAMAIS mentionner le prix dans le step 1 (sauf Sprint 4.99€)
- JAMAIS de "?" en tout début de ligne (la question doit commencer par des mots)
- JAMAIS de nom de commerce qui sonne faux ou inventé — si le nom est bizarre, dis juste "ton commerce" ou "ton resto"
- Signature : Victor de KeiroAI (JAMAIS Oussama, JAMAIS "l'équipe KeiroAI")

${learnings}

CONSIGNE : Pour chaque prospect, génère un email UNIQUE et personnalisé.
Réponds en JSON — un tableau d'objets, un par prospect :
[
  {
    "id": "prospect_id",
    "subject": "Objet percutant < 50 chars — PAS de emoji",
    "body": "Corps du mail 4-6 lignes tutoiement",
    "skip": false
  }
]
Si le nom du commerce est douteux/introuvable/incohérent, mets "skip": true et "reason": "explication".

UNIQUEMENT du JSON valide, pas de markdown, pas d'explication.`,
      message: prospectList,
      maxTokens: 3000,
    });

    // Parse JSON array (strip markdown fences if present)
    const cleanText = rawText.replace(/```[\w]*\s*/g, '').trim();
    let emails: any[] = [];

    // Try full array match first
    const fullMatch = cleanText.match(/\[[\s\S]*\]/);
    if (fullMatch) {
      try {
        emails = JSON.parse(fullMatch[0]);
      } catch {
        // Full match failed, try extracting individual objects
      }
    }

    // Salvage: extract all complete JSON objects from truncated array
    if (emails.length === 0) {
      const objectRegex = /\{\s*"id"\s*:\s*"[^"]+"\s*,\s*"subject"\s*:\s*"[^"]*"\s*,\s*"body"\s*:\s*"[^"]*"\s*\}/g;
      const objects = cleanText.match(objectRegex);
      if (objects && objects.length > 0) {
        for (const obj of objects) {
          try {
            emails.push(JSON.parse(obj));
          } catch { /* skip malformed */ }
        }
        console.log(`[EmailDaily] AI batch: salvaged ${emails.length} complete emails from truncated JSON`);
      }
    }

    // Last resort: try to extract objects with newlines in body (common with Gemini)
    if (emails.length === 0) {
      try {
        // Find all id+subject pairs and extract what we can
        const idSubjectRegex = /"id"\s*:\s*"([^"]+)"\s*,\s*"subject"\s*:\s*"([^"]*)"\s*,\s*"body"\s*:\s*"([\s\S]*?)(?:"\s*\}|$)/g;
        let m;
        while ((m = idSubjectRegex.exec(cleanText)) !== null) {
          const body = m[3].replace(/\n/g, '\\n').replace(/"/g, '\\"');
          emails.push({ id: m[1], subject: m[2], body: m[3].replace(/\\n/g, '\n') });
        }
        if (emails.length > 0) {
          console.log(`[EmailDaily] AI batch: regex-extracted ${emails.length} emails`);
        }
      } catch { /* regex extraction failed */ }
    }

    if (emails.length === 0) {
      console.warn('[EmailDaily] AI batch: no emails extracted, raw:', cleanText.substring(0, 400));
      return results;
    }
    for (const email of emails) {
      if (!email.id || !email.subject || !email.body) continue;
      // Skip emails flagged by AI as incoherent/suspicious business
      if (email.skip) {
        console.log(`[EmailDaily] AI skipped prospect ${email.id}: ${email.reason || 'business incoherent'}`);
        continue;
      }

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
    // Fix "?" at beginning of line (unnatural formatting)
    template.textBody = template.textBody.replace(/^\s*\?\s*/gm, '');
    template.htmlBody = template.htmlBody.replace(/^\s*\?\s*/gm, '');
    // Replace "Bonjour" with "Salut" for consistency
    template.textBody = template.textBody.replace(/^Bonjour\s/gm, 'Salut ');
    template.htmlBody = template.htmlBody.replace(/Bonjour\s/g, 'Salut ');
    // Business coherence: if quartier is empty but email mentions a specific quartier, strip it
    if (!prospect.quartier) {
      // Remove phrases like "du Opéra", "du 9ème", "du Marais" if quartier wasn't in CRM
      const quartierRegex = /\b(du|de|dans le|au|des)\s+(Opéra|Marais|Bastille|Montmartre|Belleville|Pigalle|Batignolles|Oberkampf|République|Nation|Châtelet|Saint-Germain|Latin|Sentier|\d{1,2}(?:e|ème|eme|er))\b/gi;
      template.textBody = template.textBody.replace(quartierRegex, '');
      template.htmlBody = template.htmlBody.replace(quartierRegex, '');
    }
    const disposableDomains = ['yopmail.com', 'guerrillamail.com', 'tempmail.com', 'mailinator.com', 'throwaway.email'];
    const emailDomain = (prospect.email || '').split('@')[1]?.toLowerCase();
    if (emailDomain && disposableDomains.includes(emailDomain)) {
      return { success: false, error: 'Disposable email' };
    }

    let messageId = 'unknown';
    let provider = 'brevo';
    let sendSuccess = false;

    // Try Brevo first (primary)
    if (process.env.BREVO_API_KEY) {
      try {
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Victor de KeiroAI', email: 'contact@keiroai.com' },
            replyTo: { email: 'contact@keiroai.com', name: 'Victor de KeiroAI' },
            to: [{ email: prospect.email, name: prospect.first_name || prospect.company || '' }],
            // No BCC — saves Brevo quota. Emails tracked via crm_activities.
            subject: template.subject,
            htmlContent: template.htmlBody,
            textContent: template.textBody,
            headers: {
              'X-Mailin-custom': prospect.id,
              'List-Unsubscribe': '<https://keiroai.com/unsubscribe>',
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
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
          console.warn(`[EmailDaily] Brevo failed for ${prospect.email}, trying Resend:`, errorText);
        }
      } catch (brevoError: any) {
        console.warn(`[EmailDaily] Brevo error, trying Resend:`, brevoError.message);
      }
    }

    // Fallback to Resend
    if (!sendSuccess && process.env.RESEND_API_KEY) {
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
            // No BCC — saves Resend quota. Emails tracked via crm_activities.
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
          console.error(`[EmailDaily] Resend also failed:`, errorText);
        }
      } catch (resendError: any) {
        console.error(`[EmailDaily] Resend error:`, resendError.message);
      }
    }

    if (!sendSuccess) {
      // Track send failures in DB to avoid infinite retry loop
      const supabaseForFailure = getSupabaseAdmin();
      const failCount = (prospect.email_send_failures || 0) + 1;
      const failUpdate: Record<string, any> = {
        email_send_failures: failCount,
        updated_at: new Date().toISOString(),
      };
      // After 3 failures, mark as failed to stop retrying
      if (failCount >= 3) {
        failUpdate.email_sequence_status = 'send_failed';
        console.warn(`[EmailDaily] ${prospect.email} failed 3x — marked as send_failed`);
      }
      await supabaseForFailure.from('crm_prospects').update(failUpdate).eq('id', prospect.id);
      return { success: false, error: `Brevo + Resend both failed (attempt ${failCount})` };
    }

    // Update prospect in DB
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Update prospect CRM: sequence progress + status advancement
    const prospectUpdate: Record<string, any> = {
      email_sequence_step: step,
      last_email_sent_at: now,
      email_sequence_status: step === 10 ? 'warm_sent' : 'in_progress',
      email_provider: provider,
      updated_at: now,
    };
    // Advance CRM pipeline stage based on email step
    // Only advance forward, never go backward
    const protectedStatuses = ['repondu', 'demo', 'sprint', 'client'];
    if (!prospect.status || !protectedStatuses.includes(prospect.status)) {
      if (step === 1) {
        prospectUpdate.status = 'contacte';
      } else if (step === 2) {
        prospectUpdate.status = 'relance_1';
      } else if (step === 3) {
        prospectUpdate.status = 'relance_2';
      } else if (step === 4 || step === 5) {
        prospectUpdate.status = 'relance_3';
      }
    }
    await supabase.from('crm_prospects').update(prospectUpdate).eq('id', prospect.id);

    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'email',
      description: `Email step ${step} envoyé: "${template.subject}"`,
      data: {
        message_id: messageId,
        step,
        subject: template.subject,
        body: template.textBody,
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
  const forceMode = request.nextUrl.searchParams.get('force') === 'true';
  const draftMode = request.nextUrl.searchParams.get('draft') === 'true';

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();
  const type = request.nextUrl.searchParams.get('type');
  // Business type targeting: ?types=restaurant,boutique → only send to these types
  const targetTypes = request.nextUrl.searchParams.get('types')?.split(',').map(t => t.trim()).filter(Boolean) || [];

  const results: SendResult[] = [];
  let skippedVerification = 0;
  let skippedTooRecent = 0;
  let skippedWaitingNextStep = 0;
  let skippedMaxDaily = 0;
  let prospectCount = 0;

  // ── DAILY EMAIL LIMITER ──
  // Brevo free = 300/day + Resend overflow. Target: 280+ emails/day.
  const DAILY_EMAIL_LIMIT = 300; // Brevo free max
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: emailsSentToday } = await supabase
    .from('crm_activities')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'email')
    .gte('created_at', todayStart.toISOString());
  const sentToday = emailsSentToday || 0;
  let remainingQuota = Math.max(0, DAILY_EMAIL_LIMIT - sentToday);
  console.log(`[EmailDaily] Daily quota: ${sentToday}/${DAILY_EMAIL_LIMIT} sent today, ${remainingQuota} remaining`);

  // If Brevo quota exhausted but Resend available, switch to Resend-only mode
  let resendOnlyMode = false;
  if (remainingQuota === 0) {
    if (process.env.RESEND_API_KEY) {
      console.log('[EmailDaily] Brevo quota exhausted — switching to Resend-only mode.');
      resendOnlyMode = true;
      remainingQuota = 200; // Resend overflow to reach 280+ total/day
    } else {
      console.log('[EmailDaily] Daily email limit reached (300/day Brevo free) and no Resend. Skipping.');
      return NextResponse.json({
        ok: true,
        message: `Limite quotidienne Brevo atteinte (${sentToday}/${DAILY_EMAIL_LIMIT}). Pas de Resend configuré.`,
        sent: 0, skipped_quota: true,
      });
    }
  }

  try {
    // Recovery: reset send_failed prospects older than 24h so they retry (via Resend this time)
    if (process.env.RESEND_API_KEY) {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: failedProspects } = await supabase
        .from('crm_prospects')
        .select('id')
        .eq('email_sequence_status', 'send_failed')
        .lt('updated_at', oneDayAgo);

      if (failedProspects && failedProspects.length > 0) {
        await supabase
          .from('crm_prospects')
          .update({ email_sequence_status: 'in_progress', email_send_failures: 0, updated_at: nowISO })
          .in('id', failedProspects.map(p => p.id));
        console.log(`[EmailDaily] Recovered ${failedProspects.length} send_failed prospects for retry via Resend`);
      }
    }

    // Load agent learnings for AI generation
    const learnings = await loadAgentLearnings();

    if (type === 'warm') {
      // --- Warm mode: follow-up chatbot leads ---
      console.log('[EmailDaily] Running warm mode...');

      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

      const { data: rawWarmProspects } = await supabase
        .from('crm_prospects')
        .select('*')
        .eq('source', 'chatbot')
        .not('email', 'is', null)
        .eq('email_sequence_step', 0)
        .lte('created_at', twentyFourHoursAgo)
        .gte('created_at', fortyEightHoursAgo);

      const warmProspects = (rawWarmProspects || []).filter(p =>
        !p.status || !['sprint', 'client', 'perdu', 'lost', 'client_pro', 'client_fondateurs'].includes(p.status)
      );

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
          if (remainingQuota <= 0) {
            console.log('[EmailDaily] Daily quota exhausted mid-warm-batch, stopping.');
            break;
          }
          const aiEmail = aiEmails.get(prospect.id);
          const template = aiEmail || getEmailTemplate(getSequenceForProspect(prospect), 10, {
            first_name: prospect.first_name || '',
            company: prospect.company || '',
            type: prospect.type || '',
            quartier: prospect.quartier || '',
            note_google: prospect.note_google != null ? String(prospect.note_google) : '',
          }, 0);

          const result = await sendEmail(prospect, 10, template, getSequenceForProspect(prospect));
          if (result.success) remainingQuota--;
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            company: prospect.company || '',
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
      console.log(`[EmailDaily] Running cold sequence (manual=${isManualTrigger}${targetTypes.length > 0 ? `, types=${targetTypes.join(',')}` : ''})...`);

      // Query eligible prospects: have email, not completed sequence, not dead/lost/client
      // Use separate filters to avoid PostgREST .or() parsing issues
      const { data: allWithEmail, error: queryError } = await supabase
        .from('crm_prospects')
        .select('*')
        .not('email', 'is', null);

      // Filter in JS for reliability (PostgREST .or() with .not.in. can be tricky)
      const prospects = (allWithEmail || []).filter(p => {
        // email_sequence_status must be null, not_started, or in_progress (exclude completed, warm_sent, send_failed)
        const seq = p.email_sequence_status;
        const seqOk = !seq || seq === 'not_started' || seq === 'in_progress';
        // temperature must not be dead
        const tempOk = !p.temperature || p.temperature !== 'dead';
        // status must not be client, perdu, sprint
        const statusOk = !p.status || !['client', 'perdu', 'sprint', 'client_pro', 'client_fondateurs', 'lost'].includes(p.status);
        // Business type targeting: if types specified, only include matching prospects
        const typeOk = targetTypes.length === 0 || (p.type && targetTypes.includes(p.type));
        // Skip prospects that have failed sending 3+ times (prevent infinite retry)
        const failOk = !p.email_send_failures || p.email_send_failures < 3;
        return seqOk && tempOk && statusOk && typeOk && failOk;
      });

      if (queryError) {
        console.error('[EmailDaily] Query error:', queryError.message);
        return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
      }

      // Sort: 1) verified follow-ups, 2) verified new, 3) unverified follow-ups, 4) unverified new
      // Within each group, sort by score descending (best prospects first)
      prospects.sort((a, b) => {
        const aVerified = a.verified ? 1 : 0;
        const bVerified = b.verified ? 1 : 0;
        if (aVerified !== bVerified) return bVerified - aVerified;
        const aInProgress = a.email_sequence_status === 'in_progress' && (a.email_sequence_step ?? 0) > 0;
        const bInProgress = b.email_sequence_status === 'in_progress' && (b.email_sequence_step ?? 0) > 0;
        if (aInProgress && !bInProgress) return -1;
        if (!aInProgress && bInProgress) return 1;
        return (b.score || 0) - (a.score || 0);
      });

      const verifiedCount = prospects.filter(p => p.verified).length;
      const newCount = prospects.filter(p => !p.email_sequence_status || p.email_sequence_status === 'not_started').length;
      const followUpCount = prospects.filter(p => p.email_sequence_status === 'in_progress').length;
      console.log(`[EmailDaily] Eligible prospects: ${prospects?.length ?? 0} (${verifiedCount} verified, ${newCount} new, ${followUpCount} follow-ups)`);

      if (!prospects || prospects.length === 0) {
        const { count: totalCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true });
        const { count: withEmail } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('email', 'is', null);
        const { count: withCompany } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).not('company', 'is', null);
        const { count: deadCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('temperature', 'dead');
        const { count: perduCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'perdu');
        const { count: completedCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('email_sequence_status', 'completed');
        const { count: inProgressCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('email_sequence_status', 'in_progress');
        const { count: notStartedCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('email_sequence_status', 'not_started');
        const { count: nullSeqCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).is('email_sequence_status', null);
        const { count: clientCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'client');
        const { count: sprintCount } = await supabase.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('status', 'sprint');

        // Get sample of status values to understand distribution
        const { data: statusSample } = await supabase.from('crm_prospects').select('status, email_sequence_status, temperature').not('email', 'is', null).limit(10);

        const diagnostic = {
          total_crm: totalCount || 0,
          with_email: withEmail || 0,
          with_company: withCompany || 0,
          dead: deadCount || 0,
          perdu: perduCount || 0,
          clients: clientCount || 0,
          sprint: sprintCount || 0,
          email_seq_completed: completedCount || 0,
          email_seq_in_progress: inProgressCount || 0,
          email_seq_not_started: notStartedCount || 0,
          email_seq_null: nullSeqCount || 0,
          sample_statuses: statusSample?.map(s => ({ status: s.status, seq: s.email_sequence_status, temp: s.temperature })),
          reason: 'Aucun prospect éligible. Breakdown: email_sequence_status doit être null/not_started/in_progress, temperature != dead, status != client/perdu/sprint.',
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
      let skippedCompleted = 0;
      let recycledCount = 0;
      let selfVerifiedCount = 0;
      const MAX_STEP1_PER_DAY = isManualTrigger ? 500 : 500; // Max emails per run — send as many as possible
      const MIN_HOURS_BEFORE_FIRST_EMAIL = isManualTrigger ? 0 : 0; // No delay — send immediately
      // For manual triggers: send immediately (no multi-day gaps)
      // For cron: respect normal spacing between steps (min 3 days between any email to same prospect)
      const STEP_GAP_DAYS = forceMode ? { 1: 0, 2: 0, 3: 0, 4: 0 } :
        isManualTrigger ? { 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5 } :
        { 1: 4, 2: 4, 3: 5, 4: 5 };
      // Per-prospect rate limit: never send more than 1 email per 3 days regardless of step
      const MIN_DAYS_BETWEEN_ANY_EMAIL = forceMode ? 0 : isManualTrigger ? 0.5 : 3;
      prospectCount = prospects.length;

      // Collect prospects for AI batch generation
      const batchForAI: Array<{ prospect: any; category: string; step: number }> = [];

      const RUN_TIME_LIMIT_MS = 240_000; // 240s hard limit (leave 60s for reporting)
      const runStart = Date.now();

      // Cap batch to remaining daily quota — 60 per slot allows ~280/day across 5-6 slots
      const maxBatchSize = Math.min(remainingQuota, 60);

      for (const prospect of prospects) {
        // Quota guard — stop when we've queued enough for this slot
        if (batchForAI.length >= maxBatchSize) {
          console.log(`[EmailDaily] Batch cap reached (${maxBatchSize} for this slot, ${remainingQuota} daily remaining).`);
          break;
        }
        // Time guard — stop if approaching timeout
        if (Date.now() - runStart > RUN_TIME_LIMIT_MS) {
          console.warn(`[EmailDaily] Time guard: stopping after ${batchForAI.length} emails queued (${Math.round((Date.now() - runStart) / 1000)}s)`);
          break;
        }

        const category = getSequenceForProspect(prospect);

        // CRM coherence check — fix data issues before processing
        const { fixes, issues: crmIssues } = verifyCRMCoherence(prospect);
        if (Object.keys(fixes).length > 0) {
          fixes.updated_at = nowISO;
          await supabase.from('crm_prospects').update(fixes).eq('id', prospect.id);
          Object.assign(prospect, fixes); // Apply fixes in-memory too
          if (crmIssues.length > 0) {
            console.log(`[EmailDaily] CRM fix ${prospect.company}: ${crmIssues.join(', ')}`);
          }
        }
        // Skip if dead/invalid after fixes
        if (fixes.temperature === 'dead' || fixes.status === 'perdu') { skippedVerification++; continue; }

        const verification = verifyProspectData(prospect);
        if (!verification.valid) { skippedVerification++; continue; }

        // Self-verify: if commercial agent hasn't verified, email agent does it
        if (!prospect.verified && prospect.email && prospect.company) {
          // Safe: ignore error if verified column doesn't exist yet
          const { error: verifyErr } = await supabase.from('crm_prospects').update({
            verified: true,
            verified_at: nowISO,
            verified_by: 'email',
          }).eq('id', prospect.id);
          if (!verifyErr) selfVerifiedCount++;
        }

        const step = prospect.email_sequence_step ?? 0;
        const lastSent = prospect.last_email_sent_at ? new Date(prospect.last_email_sent_at) : null;
        const created = new Date(prospect.created_at);
        const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
        const daysSinceLastSent = lastSent ? (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24) : Infinity;

        // DEDUP: Per-prospect rate limit — never email same person more than once per 3 days
        if (lastSent && daysSinceLastSent < MIN_DAYS_BETWEEN_ANY_EMAIL) {
          skippedWaitingNextStep++;
          continue;
        }

        if (step === 0) {
          // Step 0 → send step 1 (premier contact)
          if (hoursSinceCreation < MIN_HOURS_BEFORE_FIRST_EMAIL) { skippedTooRecent++; continue; }
          if (step1Count >= MAX_STEP1_PER_DAY) { skippedMaxDaily++; continue; }
          batchForAI.push({ prospect, category, step: 1 });
          step1Count++;
        } else if (step === 1 && !lastSent) {
          // Step 1 without lastSent = data inconsistency → RE-SEND step 1 (don't skip)
          if (step1Count >= MAX_STEP1_PER_DAY) { skippedMaxDaily++; continue; }
          batchForAI.push({ prospect, category, step: 1 });
          step1Count++;
        } else if (step === 1 && lastSent) {
          // Step 1 → step 2 (relance douce)
          if (daysSinceLastSent < STEP_GAP_DAYS[1]) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 2 });
        } else if (step === 2 && lastSent) {
          // Step 2 → step 3 (valeur gratuite)
          if (daysSinceLastSent < STEP_GAP_DAYS[2]) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 3 });
        } else if (step === 3 && lastSent) {
          // Step 3 → step 4 (FOMO concurrents)
          if (daysSinceLastSent < STEP_GAP_DAYS[3]) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 4 });
        } else if (step === 4 && lastSent) {
          // Step 4 → step 5 (derniere chance)
          if (daysSinceLastSent < STEP_GAP_DAYS[4]) { skippedWaitingNextStep++; continue; }
          batchForAI.push({ prospect, category, step: 5 });
        } else if (step === 5) {
          // Step 5 completed → mark sequence as completed + perdu (3 relances, no response)
          const isProtected = prospect.status && ['repondu', 'demo', 'sprint', 'client'].includes(prospect.status);
          await supabase.from('crm_prospects').update({
            email_sequence_status: 'completed',
            status: isProtected ? prospect.status : 'perdu',
            temperature: isProtected ? prospect.temperature : 'cold',
            updated_at: nowISO,
          }).eq('id', prospect.id);
          skippedCompleted++;
        }
      }

      // Auto-recycle: completed prospects after 45 days get a second cycle (max 2 cycles, max 5 recycled per run)
      const MAX_RECYCLE_PER_RUN = 5;
      const { data: completedProspects } = await supabase
        .from('crm_prospects')
        .select('*')
        .eq('email_sequence_status', 'completed')
        .not('email', 'is', null)
        .not('status', 'in', '("client","repondu","demo","sprint")');

      if (completedProspects && completedProspects.length > 0) {
        for (const prospect of completedProspects) {
          if (recycledCount >= MAX_RECYCLE_PER_RUN) break;
          const cycle = (prospect as any).email_cycle || 1;
          if (cycle >= 2) continue; // Max 2 cycles — no infinite loop
          const lastSent = prospect.last_email_sent_at ? new Date(prospect.last_email_sent_at) : null;
          if (!lastSent) continue;
          const daysSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastSent < 45) continue; // 45 days instead of 21 — more respectful

          // Recycle: reset to step 0, cycle 2
          await supabase.from('crm_prospects').update({
            email_sequence_step: 0,
            email_sequence_status: 'in_progress',
            email_cycle: cycle + 1,
            updated_at: nowISO,
          }).eq('id', prospect.id);
          recycledCount++;
          console.log(`[EmailDaily] Recycled ${prospect.company || prospect.email} → cycle ${cycle + 1}`);
        }
      }

      // Step distribution for diagnostics
      const stepDistribution: Record<string, number> = {};
      for (const p of prospects) {
        const s = p.email_sequence_step ?? 0;
        const hasLastSent = !!p.last_email_sent_at;
        const key = `step_${s}${hasLastSent ? '_sent' : '_nosent'}`;
        stepDistribution[key] = (stepDistribution[key] || 0) + 1;
      }

      const skipDiag = {
        total_eligible: prospects.length,
        verified_count: verifiedCount,
        self_verified: selfVerifiedCount,
        to_send: batchForAI.length,
        skipped_verification: skippedVerification,
        skipped_too_recent: skippedTooRecent,
        skipped_waiting_next_step: skippedWaitingNextStep,
        skipped_max_daily: skippedMaxDaily,
        skipped_completed: skippedCompleted,
        recycled: recycledCount,
        step_distribution: stepDistribution,
        mode: forceMode ? 'force' : isManualTrigger ? 'manual' : 'cron',
        step_gaps: STEP_GAP_DAYS,
      };
      console.log(`[EmailDaily] Pipeline:`, JSON.stringify(skipDiag));

      // Diagnostics: if nothing to send, log pipeline breakdown so admin can see why
      if (batchForAI.length === 0) {
        await supabase.from('agent_logs').insert({
          agent: 'email',
          action: 'daily_cold',
          data: {
            total: 0, success: 0, failed: 0,
            pipeline: skipDiag,
            reason: 'batchForAI empty after loop — all prospects filtered out by step timing, verification, or daily limits',
          },
          created_at: nowISO,
        });

        return NextResponse.json({
          ok: true,
          mode: 'cold',
          stats: { total: 0, success: 0, failed: 0 },
          pipeline: skipDiag,
          reason: 'Aucun email à envoyer — tous les prospects filtrés par timing, vérification ou limites quotidiennes',
        });
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

      // Send or draft all emails
      const drafts: Array<{ prospect_id: string; email: string; company: string; step: number; category: string; subject: string; body: string; ai_generated: boolean }> = [];

      for (const { prospect, category, step } of batchForAI) {
        // Quota guard: stop when daily Brevo limit reached
        if (remainingQuota <= 0) {
          console.log(`[EmailDaily] Daily quota exhausted (${DAILY_EMAIL_LIMIT}/day). Stopping cold batch.`);
          break;
        }
        // Time guard for sending phase
        if (Date.now() - runStart > 270_000) {
          console.warn(`[EmailDaily] Send time guard: stopping after ${results.length} emails sent (${Math.round((Date.now() - runStart) / 1000)}s)`);
          break;
        }
        const aiEmail = aiEmails.get(prospect.id);

        // Fallback to template if AI failed
        const template = aiEmail || getEmailTemplate(category, step, {
          first_name: prospect.first_name || '',
          company: prospect.company || '',
          type: prospect.type || '',
          quartier: prospect.quartier || '',
          note_google: prospect.note_google != null ? String(prospect.note_google) : '',
        }, Math.floor(Math.random() * 3));

        if (draftMode) {
          // Save as draft for review — don't send
          drafts.push({
            prospect_id: prospect.id,
            email: prospect.email,
            company: prospect.company || '',
            step,
            category,
            subject: template.subject,
            body: template.htmlBody,
            ai_generated: !!aiEmail,
          });
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            company: prospect.company || '',
            step,
            success: true,
            ai_generated: !!aiEmail,
          });
        } else {
          const result = await sendEmail(prospect, step, template, category);
          if (result.success) remainingQuota--;
          results.push({
            prospect_id: prospect.id,
            email: prospect.email,
            company: prospect.company || '',
            step,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
            ai_generated: !!aiEmail,
          });
        }
      }

      // Store drafts in agent_logs for admin review
      if (draftMode && drafts.length > 0) {
        await supabase.from('agent_logs').insert({
          agent: 'email',
          action: 'email_drafts',
          data: { drafts, count: drafts.length },
          created_at: nowISO,
        });
      }

      // skipDiag already logged above
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
        provider: 'brevo+resend',
        manual: isManualTrigger,
        by_business_type: byBusinessType,
        ...(type !== 'warm' && { pipeline: {
          total_eligible: prospectCount,
          skipped_verification: skippedVerification,
          skipped_too_recent: skippedTooRecent,
          skipped_waiting_next_step: skippedWaitingNextStep,
          skipped_max_daily: skippedMaxDaily,
        }}),
        results: results.map(r => ({
          prospect_id: r.prospect_id,
          email: r.email,
          company: r.company,
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
      draft: draftMode,
      provider: draftMode ? 'draft' : 'brevo+resend',
      manual: isManualTrigger,
      stats: { total: results.length, success: successCount, failed: failCount, ai_generated: aiCount },
      message: draftMode ? `${results.length} brouillons générés — voir dans Logs agent` : undefined,
      results,
    });
  } catch (error: any) {
    console.error('[EmailDaily] Error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/agents/email/daily
 * Actions: reset_dead_prospects
 */
export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'reset_dead_prospects') {
      const supabase = getSupabaseAdmin();
      const nowISO = new Date().toISOString();

      // Find all dead/perdu prospects OR completed sequence prospects with valid email
      const { data: allProspects, error: queryError } = await supabase
        .from('crm_prospects')
        .select('id, email, company, temperature, status, email_sequence_status')
        .not('email', 'is', null);

      if (queryError) {
        return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
      }

      // Filter: dead/perdu OR sequence completed (pipeline is dry)
      const toReset = (allProspects || []).filter(p =>
        (p.temperature === 'dead' || p.status === 'perdu') ||
        p.email_sequence_status === 'completed'
      );

      if (toReset.length === 0) {
        return NextResponse.json({ ok: true, reset_count: 0, message: 'Aucun prospect à réinitialiser' });
      }

      const deadIds = toReset.filter(p => p.temperature === 'dead' || p.status === 'perdu').map(p => p.id);
      const completedIds = toReset.filter(p => p.email_sequence_status === 'completed' && p.temperature !== 'dead' && p.status !== 'perdu').map(p => p.id);

      // Reset dead/perdu prospects fully
      if (deadIds.length > 0) {
        await supabase
          .from('crm_prospects')
          .update({
            temperature: 'cold',
            status: 'identifie',
            email_sequence_status: 'not_started',
            email_sequence_step: 0,
            updated_at: nowISO,
          })
          .in('id', deadIds);
      }

      // Reset completed sequence prospects (restart their email sequence only)
      if (completedIds.length > 0) {
        await supabase
          .from('crm_prospects')
          .update({
            email_sequence_status: 'not_started',
            email_sequence_step: 0,
            updated_at: nowISO,
          })
          .in('id', completedIds);
      }

      // Log the action
      await supabase.from('agent_logs').insert({
        agent: 'email',
        action: 'reset_dead_prospects',
        data: {
          dead_reset: deadIds.length,
          completed_reset: completedIds.length,
          total_reset: toReset.length,
        },
        created_at: nowISO,
      });

      console.log(`[EmailDaily] Reset ${deadIds.length} dead + ${completedIds.length} completed prospects`);

      return NextResponse.json({
        ok: true,
        reset_count: toReset.length,
        message: `${deadIds.length} dead→cold + ${completedIds.length} séquences terminées relancées`,
      });
    }

    return NextResponse.json({ ok: false, error: `Action inconnue: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[EmailDaily] POST Error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
