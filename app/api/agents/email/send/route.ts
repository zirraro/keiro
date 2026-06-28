import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getEmailTemplate } from '@/lib/agents/email-templates';
import { getSequenceForProspect } from '@/lib/agents/scoring';
import { canSendEmail } from '@/lib/agents/email-dedup';
import { isBlacklisted, isHugoPaused } from '@/lib/agents/hugo-engine';

import { sendBrevoCompat } from '@/lib/email/brevo-compat';
export const runtime = 'nodejs';
export const maxDuration = 120;

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

    // Optional org_id passthrough for multi-tenant support
    const orgId = body?.org_id || null;

    if (!prospect_id || template_step === undefined) {
      return NextResponse.json(
        { ok: false, error: 'prospect_id et template_step sont requis' },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'Aucun provider email configuré (RESEND_API_KEY ou BREVO_API_KEY requis)' },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // --- Fetch prospect (verify ownership via user_id) ---
    let prospectQuery = supabase
      .from('crm_prospects')
      .select('*')
      .eq('id', prospect_id);
    // If user_id available, verify this prospect belongs to the client
    const ownerUserId = body?.user_id || null;
    if (ownerUserId) prospectQuery = prospectQuery.eq('user_id', ownerUserId);
    const { data: prospect, error: prospectError } = await prospectQuery.single();

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

    // --- Unsubscribe / blacklist guard (legal: GDPR + CAN-SPAM) ---
    // Hugo's reply analyser already adds an entry to email_blacklist when it
    // detects an unsubscribe intent (see hugo-engine.ts isBlacklisted /
    // markBlacklisted, fed by hugo-reply.ts). Check it here before EVERY send
    // so a follow-up email never lands on someone who asked us to stop. Also
    // refuse to send if the prospect record itself was flipped to dead/stopped
    // (safety belt — Brevo webhook unsubscribes flip the prospect status).
    // Anti-collision NOAH (brief v3 §3.5): a persistent no_outbound flag means
    // the prospect asked never to be contacted again on ANY channel — survives
    // re-engagement. Refuse the send outright.
    if (prospect.no_outbound) {
      return NextResponse.json(
        { ok: false, error: 'Prospect en no_outbound (ne pas recontacter)', blocked: 'no_outbound' },
        { status: 200 },
      );
    }
    // Channel lock: if this prospect is already engaged on DMs, email stays off
    // it (1 active outbound channel per prospect). Cleared when the prospect
    // goes dead/no_outbound (filtered above) — DM ownership otherwise persists.
    if (prospect.active_channel === 'dm') {
      return NextResponse.json(
        { ok: false, error: 'Prospect déjà actif sur le canal DM', blocked: 'channel_lock' },
        { status: 200 },
      );
    }
    const ownerForBlacklist = body?.user_id || prospect.user_id || null;
    // Hugo hard-pause (brief v3 §3.1): if this client's bounce rate tripped the
    // pause, refuse ALL sends until it's manually cleared — protect the domain.
    if (ownerForBlacklist && await isHugoPaused(supabase, ownerForBlacklist).catch(() => false)) {
      return NextResponse.json(
        { ok: false, error: 'Envois Hugo en pause (bounce rate élevé — vérifier le domaine)', blocked: 'hugo_paused' },
        { status: 200 },
      );
    }
    if (ownerForBlacklist) {
      const blocked = await isBlacklisted(supabase, ownerForBlacklist, prospect.email).catch(() => false);
      if (blocked) {
        await supabase.from('agent_logs').insert({
          agent: 'email',
          action: 'send_blocked_blacklist',
          data: { prospect_id, prospect_email: prospect.email, reason: 'unsubscribe' },
          status: 'success',
          user_id: ownerForBlacklist,
          ...(orgId ? { org_id: orgId } : {}),
        });
        return NextResponse.json(
          { ok: false, error: 'Prospect a demandé l\'arrêt des emails', blocked: 'unsubscribed' },
          { status: 410 }
        );
      }
    }
    if (
      prospect.email_sequence_status === 'stopped' ||
      prospect.temperature === 'dead' ||
      prospect.status === 'perdu'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Prospect marqué dead / sequence stopped — relance bloquée' },
        { status: 410 }
      );
    }

    // --- Cross-agent dedup check ---
    const forceParam = body.force === true;
    const dedupCheck = await canSendEmail(supabase, prospect.email, {
      minDays: 3,
      force: forceParam,
      prospectId: prospect_id,
    });
    if (!dedupCheck.allowed) {
      return NextResponse.json(
        { ok: false, error: `Dedup: ${dedupCheck.reason}. Use force=true to override.` },
        { status: 429 }
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
      prospect_id: prospect.id,
    };
    const template = getEmailTemplate(category, template_step, vars, selectedVariant);

    // --- Inject showcase images for step 1 (first contact) ---
    if (template_step === 1 && prospect.type) {
      try {
        const { data: showcaseImages } = await supabase
          .from('showcase_images')
          .select('image_url, title')
          .eq('business_type', prospect.type)
          .eq('is_active', true)
          .order('usage_count', { ascending: true })
          .limit(2);

        if (showcaseImages && showcaseImages.length > 0) {
          const { getShowcaseImagesHtml } = await import('@/lib/agents/email-templates');
          const showcaseHtml = getShowcaseImagesHtml(showcaseImages);
          // Insert before closing </div> of email body
          template.htmlBody = template.htmlBody.replace(
            /<\/div>\s*<\/body>/i,
            `${showcaseHtml}</div></body>`
          );
          // Update usage count
          for (const img of showcaseImages) {
            supabase.from('showcase_images').update({ usage_count: 1 }).eq('image_url', img.image_url).then(() => {});
          }
        }
      } catch (e: any) {
        console.warn('[EmailAgent] Showcase images injection failed (non-fatal):', e.message);
      }
    }

    // --- Send email: Gmail (client's own email) > Resend > Brevo ---
    console.log(`[EmailAgent] Sending step ${template_step} to ${prospect.email} (variant ${selectedVariant})`);

    let messageId = 'unknown';
    let provider = 'resend';
    let sendSuccess = false;

    // Priority 1: Gmail API (client's own email) — if connected
    const clientUserId = body?.user_id || prospect.user_id || null;
    if (clientUserId) {
      try {
        const { getValidGmailToken, sendViaGmail } = await import('@/lib/gmail-oauth');
        const gmailAuth = await getValidGmailToken(clientUserId);
        if (gmailAuth) {
          // Get client's display name
          const { data: clientProfile } = await supabase
            .from('profiles')
            .select('full_name, company_name')
            .eq('id', clientUserId)
            .single();
          const senderName = clientProfile?.full_name || clientProfile?.company_name || 'KeiroAI';

          const result = await sendViaGmail(
            gmailAuth.accessToken,
            prospect.email,
            template.subject,
            template.htmlBody,
            senderName,
            gmailAuth.email,
            // Pas de Reply-To override : les réponses arrivent dans le Gmail DU CLIENT
            // (on les lit via poll-inbound + gmail.readonly) → Hugo répond en auto.
          );
          if (result.sent) {
            messageId = result.id;
            provider = 'gmail';
            sendSuccess = true;
            console.log(`[EmailAgent] Email sent via Gmail (${gmailAuth.email}), messageId:`, messageId);
          }
        }
      } catch (e: any) {
        console.warn('[EmailAgent] Gmail send failed, falling back to Resend:', e.message);
      }
    }

    // Priority 2: SMTP (client's custom domain) — if configured
    if (!sendSuccess && clientUserId) {
      try {
        const { data: smtpProfile } = await supabase
          .from('profiles')
          .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_email')
          .eq('id', clientUserId)
          .single();
        if (smtpProfile?.smtp_host && smtpProfile?.smtp_user && smtpProfile?.smtp_pass) {
          // SPF/DMARC preflight (brief v3 §3.1): never send from the client's
          // OWN domain unless it's authenticated — an unauthenticated domain
          // burns irreversibly. If it fails, skip SMTP and fall through to the
          // authenticated KeiroAI domain (Resend) so prospection keeps running,
          // and log a config warning for the client.
          const { checkDomainAuth, domainOf } = await import('@/lib/email/domain-auth');
          const sendDomain = domainOf(smtpProfile.smtp_from_email || smtpProfile.smtp_user);
          const auth = await checkDomainAuth(sendDomain).catch(() => ({ ok: true } as any));
          if (!auth.ok) {
            console.warn(`[EmailAgent] SMTP domain ${sendDomain} non authentifié (${auth.reason}) — skip SMTP, fallback domaine KeiroAI`);
            try {
              await supabase.from('agent_logs').insert({
                agent: 'email', action: 'email_domain_auth_warning', status: 'error', user_id: clientUserId,
                error_message: `Domaine ${sendDomain} non authentifié: ${auth.reason}. Configure SPF + DMARC (et DKIM) pour envoyer depuis ton domaine.`,
                data: { severity: 'warning', domain: sendDomain, spf: auth.spf, dmarc: auth.dmarc },
                created_at: new Date().toISOString(),
              });
            } catch { /* logging best-effort */ }
            throw new Error(`domain_not_authenticated:${sendDomain}`);
          }
          const nodemailer = await import('nodemailer');
          const transport = nodemailer.default.createTransport({
            host: smtpProfile.smtp_host,
            port: smtpProfile.smtp_port || 587,
            secure: (smtpProfile.smtp_port || 587) === 465,
            auth: { user: smtpProfile.smtp_user, pass: smtpProfile.smtp_pass },
          });
          const info = await transport.sendMail({
            from: smtpProfile.smtp_from_email || smtpProfile.smtp_user,
            to: prospect.email,
            subject: template.subject,
            html: template.htmlBody,
            text: template.textBody,
          });
          messageId = info.messageId || 'smtp';
          provider = 'smtp';
          sendSuccess = true;
          console.log(`[EmailAgent] Email sent via SMTP (${smtpProfile.smtp_from_email})`);
        }
      } catch (e: any) {
        console.warn('[EmailAgent] SMTP send failed:', e.message);
      }
    }

    // Priority 3: Resend (KeiroAI fallback)
    // Check daily Resend usage (cap at 80 to keep 20 for signup verification emails)
    let resendUsedToday = 0;
    try {
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('agent_logs')
        .select('id', { count: 'exact', head: true })
        .eq('agent', 'email')
        .gte('created_at', todayStart.toISOString())
        .contains('data', { provider: 'resend' });
      resendUsedToday = count || 0;
    } catch {}
    const resendAvailable = resendUsedToday < 80;

    // Resend (if Gmail/SMTP didn't work and under daily cap)
    if (!sendSuccess && process.env.RESEND_API_KEY && resendAvailable) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Hugo de KeiroAI <contact@keiroai.com>',
            to: [prospect.email],
            reply_to: 'contact@keiroai.com',
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

        if (resendResponse.ok) {
          const resendData = await resendResponse.json();
          messageId = resendData.id || 'unknown';
          provider = 'resend';
          sendSuccess = true;
          console.log('[EmailAgent] Email sent via Resend, messageId:', messageId);
        } else {
          const errorText = await resendResponse.text();
          console.warn('[EmailAgent] Resend failed, trying Brevo fallback:', errorText);
        }
      } catch (resendError: any) {
        console.warn('[EmailAgent] Resend error, trying Brevo fallback:', resendError.message);
      }
    }

    // Brevo fallback (300/day free) when Resend quota exceeded or fails
    if (!sendSuccess && process.env.BREVO_API_KEY) {
      try {
        const brevoResponse = await sendBrevoCompat({
            sender: { name: 'Hugo de KeiroAI', email: 'contact@keiroai.com' },
            to: [{ email: prospect.email, name: prospect.first_name || prospect.company || '' }],
            replyTo: { email: 'contact@keiroai.com', name: 'Hugo de KeiroAI' },
            subject: template.subject,
            htmlContent: template.htmlBody,
            textContent: template.textBody,
            headers: { 'X-Mailin-custom': prospect_id },
            tags: ['cold-sequence', `step-${template_step}`, category],
        });
        if (brevoResponse.ok) {
          const brevoData = await brevoResponse.json();
          messageId = brevoData.messageId || 'unknown';
          provider = 'brevo';
          sendSuccess = true;
          console.log('[EmailAgent] Email sent via Brevo fallback, messageId:', messageId);
        } else {
          console.error('[EmailAgent] Brevo also failed:', await brevoResponse.text());
        }
      } catch (brevoErr: any) {
        console.error('[EmailAgent] Brevo fallback error:', brevoErr.message);
      }
    }

    if (!sendSuccess) {
      return NextResponse.json(
        { ok: false, error: 'Tous les providers email ont échoué (Resend + Brevo)' },
        { status: 502 }
      );
    }

    // --- Update prospect (split into 2 updates for safety) ---
    // 1) Always update sequence progress (safe, no constraint issues)
    await supabase
      .from('crm_prospects')
      .update({
        email_sequence_step: template_step,
        last_email_sent_at: now,
        email_sequence_status: 'in_progress',
        email_subject_variant: selectedVariant,
        active_channel: 'email', // anti-collision: ce prospect est désormais "owned" par l'email
        updated_at: now,
      })
      .eq('id', prospect_id);

    // 2) Update pipeline status separately (if constraint fails, step still advances)
    const stepLabels: Record<number, string> = {
      1: 'contacte', 2: 'relance_1', 3: 'relance_2', 4: 'relance_3', 5: 'relance_3', 10: 'contacte',
    };
    const newStatus = stepLabels[template_step] || 'contacte';
    const { error: statusErr } = await supabase
      .from('crm_prospects')
      .update({ status: newStatus, updated_at: now })
      .eq('id', prospect_id);
    if (statusErr) {
      console.error(`[EmailSend] Status update failed for ${prospect_id} → ${newStatus}:`, statusErr.message);
    }

    // --- Create CRM activity ---
    await supabase.from('crm_activities').insert({
      prospect_id,
      type: 'email',
      description: `Email step ${template_step} envoyé: "${template.subject}"`,
      data: {
        message_id: messageId,
        step: template_step,
        subject: template.subject,
        body: template.textBody,
        variant: selectedVariant,
        category,
        provider,
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
        provider,
      },
      created_at: now,
      ...(orgId ? { org_id: orgId } : {}),
    });

    // No notification for individual emails — only for replies/hot prospects (high value)

    return NextResponse.json({
      ok: true,
      messageId,
      provider,
    });
  } catch (error: any) {
    console.error('[EmailAgent] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
