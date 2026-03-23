/**
 * HUGO Engine — Email Agent Core
 *
 * Features:
 * - Email generation via Claude (never mentions KeiroAI)
 * - 6-category sentiment analysis
 * - 3 autonomy levels (copilot → semi-auto → full-auto)
 * - Action dispatcher (draft/auto-reply/stop/blacklist)
 * - Warmup management
 * - Event Bus integration with NOAH
 * - CRM updates on every action
 * - Dashboard + notification sync
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Events } from './event-bus';
import { saveLearning } from './learning';
import { saveKnowledge } from './knowledge-rag';
import { getAgentKnowledgeContext } from './knowledge-rag';

// ─── Types ──────────────────────────────────────────────────

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'technical' | 'meeting_request' | 'unsubscribe';
export type ActionTaken = 'draft_created' | 'auto_replied' | 'stopped' | 'blacklisted' | 'notified' | 'escalated';

export interface SentimentAnalysis {
  sentiment: Sentiment;
  score: number;
  key_points: string[];
  suggested_action: 'draft' | 'auto_reply' | 'stop' | 'blacklist';
  urgency: 'urgent' | 'high' | 'medium' | 'low';
  draft_guidance: string;
}

export interface EmailDraft {
  subject: string;
  body: string;
}

interface ClientConfig {
  id: string;
  sender_name: string;
  sender_email: string;
  brevo_child_key?: string;
  autonomy_level: number; // 1, 2, or 3
  email_tone: string;
  warmup_week: number;
  daily_limit: number;
  company_name?: string;
  sector?: string;
}

// ─── Sequence Steps ─────────────────────────────────────────

export const SEQUENCE_STEPS = [
  { step: 1, delay_days: 0, type: 'initial', subject_hint: 'Question rapide, {firstName}' },
  { step: 2, delay_days: 3, type: 'followup_1', subject_hint: 'Re: {previousSubject}' },
  { step: 3, delay_days: 3, type: 'followup_2', subject_hint: 'Derniere tentative — {firstName}' },
  { step: 4, delay_days: 30, type: 'reactivation', subject_hint: '{firstName}, ca fait un moment' },
];

// ─── Email Validation ───────────────────────────────────────

const FREE_PROVIDERS = ['gmail', 'yahoo', 'hotmail', 'outlook', 'free', 'laposte', 'orange', 'sfr', 'wanadoo', 'aol', 'icloud', 'protonmail'];

export function isValidBusinessEmail(email: string): boolean {
  const domain = email.split('@')[1]?.split('.')[0]?.toLowerCase();
  return !!domain && !FREE_PROVIDERS.includes(domain);
}

// ─── Warmup Management ──────────────────────────────────────

export function getWarmupLimit(week: number): number {
  if (week <= 1) return 20;
  if (week <= 2) return 50;
  return 100;
}

// ─── Email Generation (Claude) ──────────────────────────────

export async function generateEmail(
  supabase: SupabaseClient,
  step: typeof SEQUENCE_STEPS[number],
  prospect: { name: string; company: string; city?: string; sector?: string; first_name?: string },
  client: ClientConfig,
): Promise<EmailDraft> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return { subject: `Question rapide, ${prospect.first_name || prospect.name}`, body: 'Bonjour, ...' };
  }

  // Get RAG context for personalization
  const ragContext = await getAgentKnowledgeContext(supabase, 'email', `email ${step.type} pour ${prospect.sector || 'business'}`).catch(() => '');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `Tu es HUGO, l'agent email expert de ${client.company_name || client.sender_name}.
Tu rediges un email de prospection ${step.type} pour le client.

REGLES ABSOLUES:
- Ne JAMAIS mentionner KeiroAI, agents IA, ou automatisation
- Ecrire comme si c'etait ${client.sender_name} qui ecrivait a la main
- Ton: ${client.email_tone} (${client.email_tone === 'friendly' ? 'tutoiement naturel' : client.email_tone === 'formal' ? 'vouvoiement' : 'decontracte'})
- 5-8 lignes maximum, pas de mise en forme
- Pas de piece jointe, pas de lien dans le premier email
- Finir par une question ouverte simple
- Objet: accrocheur, personnalise, sans spam words (pas de "GRATUIT", "OFFRE", "!!!")

${step.type === 'followup_1' ? 'C est un premier follow-up (J+3). Rappeler brievement le premier email, ajouter de la valeur.' : ''}
${step.type === 'followup_2' ? 'C est le dernier follow-up. Court, direct, desarmant. "Je ne veux pas etre insistant..."' : ''}
${step.type === 'reactivation' ? 'Reactivation J+30. Nouveau contexte, pas de reference aux anciens emails. Comme un nouveau premier contact.' : ''}

${ragContext}`,
        messages: [{
          role: 'user',
          content: `Redige l'email pour:
Prospect: ${prospect.first_name || prospect.name} ${prospect.company ? `de ${prospect.company}` : ''} ${prospect.city ? `a ${prospect.city}` : ''}
Secteur prospect: ${prospect.sector || 'non specifie'}
Secteur client: ${client.sector || 'non specifie'}

Reponds en JSON: {"subject": "...", "body": "..."}`
        }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      try {
        return JSON.parse(text);
      } catch {
        // Try to extract subject/body from text
        return { subject: `Question rapide, ${prospect.first_name || prospect.name}`, body: text.substring(0, 500) };
      }
    }
  } catch { /* silent */ }

  return { subject: `Question rapide, ${prospect.first_name || prospect.name}`, body: 'Bonjour...' };
}

// ─── Sentiment Analysis (6 categories) ──────────────────────

export async function analyzeSentiment(
  supabase: SupabaseClient,
  replyBody: string,
  prospect: { id: string; name: string; company?: string },
  clientId: string,
): Promise<SentimentAnalysis> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const defaults: SentimentAnalysis = {
    sentiment: 'neutral', score: 0.5, key_points: [], suggested_action: 'draft',
    urgency: 'medium', draft_guidance: '',
  };

  if (!ANTHROPIC_KEY || !replyBody) return defaults;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `Analyse cette reponse email de prospect. Reponds UNIQUEMENT en JSON:
{
  "sentiment": "positive|neutral|negative|technical|meeting_request|unsubscribe",
  "score": 0.0-1.0,
  "key_points": ["point1", "point2"],
  "suggested_action": "draft|auto_reply|stop|blacklist",
  "urgency": "urgent|high|medium|low",
  "draft_guidance": "Instructions pour la reponse ideale"
}

Regles:
- "interesse", "oui", "dites m en plus" → positive, draft, high
- accusé reception, "merci", vague → neutral, auto_reply, medium
- question prix/fonctionnalite → technical, draft, high
- "on peut s'appeler", "rdv", "creneau" → meeting_request, stop (le client doit prendre la main), urgent
- "non merci", "pas interesse" → negative, stop, low
- "desabonner", "stop", "retirez-moi" → unsubscribe, blacklist, low
- agressif, menacant → negative, stop, medium
- "ferme", "plus en activite" → negative, stop + blacklist, low`,
        messages: [{ role: 'user', content: `Prospect: ${prospect.name} (${prospect.company || 'N/A'})\n\nReponse:\n"""${replyBody.substring(0, 2000)}"""` }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      try {
        const parsed = JSON.parse(data.content?.[0]?.text || '{}');
        const analysis: SentimentAnalysis = { ...defaults, ...parsed };

        // Log to RAG for learning
        await saveKnowledge(supabase, {
          content: `SENTIMENT ${analysis.sentiment} (${analysis.score}): "${replyBody.substring(0, 100)}" → ${analysis.suggested_action}. Prospect ${prospect.company || prospect.name}.`,
          summary: `Sentiment ${analysis.sentiment} ${analysis.score}`,
          agent: 'email',
          category: 'learning',
          source: 'sentiment_analysis',
          confidence: analysis.score * 0.8,
        }).catch(() => {});

        return analysis;
      } catch {}
    }
  } catch { /* silent */ }

  return defaults;
}

// ─── Action Dispatcher ──────────────────────────────────────

export async function handleReply(
  supabase: SupabaseClient,
  reply: { id: string; prospect_email: string; prospect_id: string; prospect_name: string; prospect_company?: string; body: string; email_sent_id?: string },
  analysis: SentimentAnalysis,
  sequenceId: string | null,
  client: ClientConfig,
): Promise<ActionTaken> {
  const now = new Date().toISOString();

  switch (analysis.sentiment) {
    case 'positive':
    case 'technical': {
      // Create draft response
      const draft = await generateEmail(supabase, { step: 0, delay_days: 0, type: 'reply', subject_hint: '' }, {
        name: reply.prospect_name, company: reply.prospect_company || '', first_name: reply.prospect_name,
      }, client);

      // Save reply record
      await supabase.from('email_replies').insert({
        email_sent_id: reply.email_sent_id,
        client_id: client.id,
        prospect_id: reply.prospect_id,
        prospect_email: reply.prospect_email,
        body: reply.body,
        sentiment: analysis.sentiment,
        sentiment_score: analysis.score,
        key_points: analysis.key_points,
        urgency: analysis.urgency,
        action_taken: 'draft_created',
        auto_reply_body: draft.body,
        received_at: now,
        processed_at: now,
      });

      // Pause sequence
      if (sequenceId) {
        await supabase.from('email_sequences').update({
          status: 'paused', paused_reason: 'awaiting_client_validation', updated_at: now,
        }).eq('id', sequenceId);
      }

      // Update CRM
      await supabase.from('crm_prospects').update({
        temperature: 'hot', status: analysis.sentiment === 'positive' ? 'repondu' : 'interesse', updated_at: now,
      }).eq('id', reply.prospect_id);

      // CRM activity
      await supabase.from('crm_activities').insert({
        prospect_id: reply.prospect_id, type: 'email_replied',
        description: `Reponse ${analysis.sentiment} (${Math.round(analysis.score * 100)}%) — brouillon cree`,
        data: { sentiment: analysis.sentiment, score: analysis.score, action: 'draft_created', key_points: analysis.key_points },
        created_at: now,
      });

      // Emit event for NOAH
      await Events.prospectReplied(supabase, reply.prospect_id, reply.prospect_company || reply.prospect_name, 'interested', 'email').catch(() => {});

      // Notify client (WhatsApp via Stella if available)
      await notifyClient(supabase, client.id, {
        type: analysis.sentiment === 'positive' ? 'positive_reply' : 'technical_question',
        prospect_name: reply.prospect_name,
        prospect_company: reply.prospect_company,
        urgency: analysis.urgency,
        draft_body: draft.body,
      });

      return 'draft_created';
    }

    case 'meeting_request': {
      // STOP immediately — client must take over
      if (sequenceId) {
        await supabase.from('email_sequences').update({
          status: 'stopped', paused_reason: 'meeting_requested', updated_at: now,
        }).eq('id', sequenceId);
      }

      await supabase.from('email_replies').insert({
        email_sent_id: reply.email_sent_id, client_id: client.id, prospect_id: reply.prospect_id,
        prospect_email: reply.prospect_email, body: reply.body,
        sentiment: 'meeting_request', sentiment_score: analysis.score, urgency: 'urgent',
        action_taken: 'notified', received_at: now, processed_at: now,
      });

      // CRM: hot lead, demo stage
      await supabase.from('crm_prospects').update({
        temperature: 'hot', status: 'demo', updated_at: now,
      }).eq('id', reply.prospect_id);

      await supabase.from('crm_activities').insert({
        prospect_id: reply.prospect_id, type: 'email_replied',
        description: `RDV demande ! Sequence stoppee. Client notifie en urgence.`,
        data: { sentiment: 'meeting_request', urgency: 'urgent' },
        created_at: now,
      });

      // URGENT event
      await Events.prospectReplied(supabase, reply.prospect_id, reply.prospect_company || reply.prospect_name, 'meeting', 'email').catch(() => {});

      // URGENT notification
      await notifyClient(supabase, client.id, {
        type: 'meeting_request',
        prospect_name: reply.prospect_name,
        prospect_company: reply.prospect_company,
        urgency: 'urgent',
      });

      return 'notified';
    }

    case 'neutral': {
      // Autonomy level decides
      if (client.autonomy_level >= 2) {
        // Auto-reply
        const autoReply = await generateEmail(supabase, { step: 0, delay_days: 0, type: 'neutral_reply', subject_hint: '' }, {
          name: reply.prospect_name, company: reply.prospect_company || '', first_name: reply.prospect_name,
        }, client);

        await supabase.from('email_replies').insert({
          email_sent_id: reply.email_sent_id, client_id: client.id, prospect_id: reply.prospect_id,
          prospect_email: reply.prospect_email, body: reply.body,
          sentiment: 'neutral', sentiment_score: analysis.score, urgency: 'low',
          action_taken: 'auto_replied', auto_reply_body: autoReply.body, received_at: now, processed_at: now,
        });

        // CRM
        await supabase.from('crm_activities').insert({
          prospect_id: reply.prospect_id, type: 'email',
          description: `HUGO a repondu automatiquement (neutral, autonomy ${client.autonomy_level})`,
          data: { auto_reply: true, sentiment: 'neutral' },
          created_at: now,
        });

        return 'auto_replied';
      }

      // Level 1: create draft
      await supabase.from('email_replies').insert({
        email_sent_id: reply.email_sent_id, client_id: client.id, prospect_id: reply.prospect_id,
        prospect_email: reply.prospect_email, body: reply.body,
        sentiment: 'neutral', sentiment_score: analysis.score,
        action_taken: 'draft_created', received_at: now, processed_at: now,
      });

      await notifyClient(supabase, client.id, {
        type: 'neutral_reply', prospect_name: reply.prospect_name, urgency: 'medium',
      });

      return 'draft_created';
    }

    case 'negative': {
      // Stop sequence, archive prospect
      if (sequenceId) {
        await supabase.from('email_sequences').update({
          status: 'stopped', paused_reason: 'negative_reply', updated_at: now,
        }).eq('id', sequenceId);
      }

      await supabase.from('email_replies').insert({
        email_sent_id: reply.email_sent_id, client_id: client.id, prospect_id: reply.prospect_id,
        prospect_email: reply.prospect_email, body: reply.body,
        sentiment: 'negative', sentiment_score: analysis.score,
        action_taken: 'stopped', received_at: now, processed_at: now,
      });

      await supabase.from('crm_prospects').update({
        temperature: 'dead', status: 'perdu', email_sequence_status: 'stopped', updated_at: now,
      }).eq('id', reply.prospect_id);

      await supabase.from('crm_activities').insert({
        prospect_id: reply.prospect_id, type: 'email_replied',
        description: `Reponse negative — prospect archive, sequence stoppee`,
        data: { sentiment: 'negative' },
        created_at: now,
      });

      return 'stopped';
    }

    case 'unsubscribe': {
      // Blacklist + stop
      if (sequenceId) {
        await supabase.from('email_sequences').update({ status: 'stopped', updated_at: now }).eq('id', sequenceId);
      }

      await supabase.from('email_blacklist').upsert({
        client_id: client.id, email: reply.prospect_email, reason: 'unsubscribe', source: 'prospect_reply',
      }, { onConflict: 'client_id,email' });

      await supabase.from('email_replies').insert({
        email_sent_id: reply.email_sent_id, client_id: client.id, prospect_id: reply.prospect_id,
        prospect_email: reply.prospect_email, body: reply.body,
        sentiment: 'unsubscribe', sentiment_score: 1.0,
        action_taken: 'blacklisted', received_at: now, processed_at: now,
      });

      await supabase.from('crm_prospects').update({
        temperature: 'dead', status: 'perdu', email_sequence_status: 'stopped', updated_at: now,
      }).eq('id', reply.prospect_id);

      return 'blacklisted';
    }

    default:
      return 'notified';
  }
}

// ─── Blacklist Check ────────────────────────────────────────

export async function isBlacklisted(supabase: SupabaseClient, clientId: string, email: string): Promise<boolean> {
  const { data } = await supabase.from('email_blacklist').select('id').eq('client_id', clientId).eq('email', email).limit(1).maybeSingle();
  return !!data;
}

// ─── Autonomy Escalation (J+14 → level 1→2) ────────────────

export async function checkAutonomyEscalation(supabase: SupabaseClient, clientId: string): Promise<void> {
  const { data: profile } = await supabase.from('profiles').select('hugo_autonomy_level, created_at').eq('id', clientId).single();
  if (!profile || profile.hugo_autonomy_level >= 2) return;

  const daysSinceCreation = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceCreation >= 14) {
    await supabase.from('profiles').update({ hugo_autonomy_level: 2 }).eq('id', clientId);

    // Notify client about escalation
    await notifyClient(supabase, clientId, {
      type: 'autonomy_upgrade',
      urgency: 'low',
    });
  }
}

// ─── Client Notification ────────────────────────────────────

async function notifyClient(
  supabase: SupabaseClient,
  clientId: string,
  notification: {
    type: string;
    prospect_name?: string;
    prospect_company?: string;
    urgency: string;
    draft_body?: string;
  },
): Promise<void> {
  // Log notification in agent_logs (dashboard will pick this up)
  await supabase.from('agent_logs').insert({
    agent: 'email',
    action: 'client_notification',
    status: 'ok',
    data: {
      client_id: clientId,
      notification_type: notification.type,
      prospect_name: notification.prospect_name,
      prospect_company: notification.prospect_company,
      urgency: notification.urgency,
      has_draft: !!notification.draft_body,
    },
    created_at: new Date().toISOString(),
  });

  // For urgent notifications, also send via Resend to client email
  if (notification.urgency === 'urgent') {
    const { data: profile } = await supabase.from('profiles').select('email').eq('id', clientId).single();
    const RESEND_KEY = process.env.RESEND_API_KEY;

    if (profile?.email && RESEND_KEY) {
      const emoji = notification.type === 'meeting_request' ? '\uD83D\uDCDE' : '\uD83D\uDD25';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'KeiroAI Agents <contact@keiroai.com>',
          to: [profile.email],
          subject: `${emoji} HUGO — ${notification.type === 'meeting_request' ? 'RDV demande' : 'Reponse positive'} de ${notification.prospect_name || 'un prospect'}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:linear-gradient(135deg,#06b6d4,#0891b2);color:white;padding:20px;border-radius:12px 12px 0 0;">
              <h2 style="margin:0;">${emoji} HUGO — Action requise</h2>
            </div>
            <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
              <p><strong>${notification.prospect_name || 'Un prospect'}${notification.prospect_company ? ` (${notification.prospect_company})` : ''}</strong> a repondu.</p>
              <p>Type: <strong>${notification.type.replace(/_/g, ' ')}</strong></p>
              ${notification.draft_body ? `<div style="background:#f0fdf4;padding:12px;border-radius:8px;margin:12px 0;border-left:3px solid #22c55e;"><strong>Brouillon HUGO:</strong><br/>${notification.draft_body.substring(0, 300)}</div>` : ''}
              <p style="color:#888;font-size:12px;">Connectez-vous a votre espace KeiroAI pour valider ou modifier la reponse.</p>
            </div>
          </div>`,
        }),
      }).catch(() => {});
    }
  }
}
