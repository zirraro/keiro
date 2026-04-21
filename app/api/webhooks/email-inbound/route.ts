import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  classifyInbound,
  loadReplyContext,
  generateReply,
  sendReplyViaBrevo,
  type InboundEmail,
} from '@/lib/agents/hugo-reply';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/webhooks/email-inbound
 *
 * Public endpoint that accepts ANY normalized inbound-email payload:
 *   { from_email, from_name?, subject?, body, message_id?, in_reply_to? }
 *
 * Also tolerates Brevo Inbound Parsing JSON (items[].From, .Subject,
 * .Text, .ParsedHeaders, ...) if the user routes an MX to parse@in.getbrevo.com
 * and points Brevo to this URL.
 *
 * Returns 200 even on logic skips so upstream senders don't retry and
 * duplicate events. The 'result' field reports what actually happened.
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true, result: 'skip_bad_json' });
  }

  const normalized = normalizePayload(payload);
  if (!normalized || !normalized.from_email || !normalized.body) {
    return NextResponse.json({ ok: true, result: 'skip_missing_fields' });
  }

  // Idempotency — identical message-id twice in quick succession shouldn't
  // double-reply. Keyed on message-id + from-email.
  if (normalized.message_id) {
    const { data: existing } = await supabase
      .from('agent_logs')
      .select('id')
      .eq('agent', 'email')
      .eq('action', 'inbound_processed')
      .contains('data', { message_id: normalized.message_id })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, result: 'skip_duplicate' });
    }
  }

  // Classify FIRST — auto-notifications get dropped before we burn a Sonnet call.
  const classification = await classifyInbound(normalized.body, normalized.subject);

  if (classification === 'auto_notification') {
    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: 'inbound_processed',
      status: 'ok',
      data: { message_id: normalized.message_id, from: normalized.from_email, classification, decision: 'ignore' },
      created_at: now,
    });
    return NextResponse.json({ ok: true, result: 'auto_notification_ignored' });
  }

  // Load the prospect + owning client + dossier (Léo's enrichment data).
  const ctx = await loadReplyContext(supabase, normalized.from_email);
  if (!ctx) {
    // Unknown sender — might be cold inbound to the shared inbox. Log for
    // manual review but don't reply from Hugo's voice.
    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: 'inbound_processed',
      status: 'ok',
      data: { message_id: normalized.message_id, from: normalized.from_email, classification, decision: 'no_prospect_match' },
      created_at: now,
    });
    return NextResponse.json({ ok: true, result: 'no_prospect_match' });
  }

  const { prospect, dossier, client } = ctx;
  const ownerId = prospect.user_id || prospect.created_by;

  // Handle destructive signals (unsubscribe, negative, meeting) without generating a reply.
  if (classification === 'unsubscribe') {
    await supabase.from('crm_prospects').update({
      temperature: 'dead',
      status: 'perdu',
      email_sequence_status: 'stopped',
      updated_at: now,
    }).eq('id', prospect.id);
    await supabase.from('email_blacklist').upsert({
      client_id: ownerId,
      email: normalized.from_email,
      reason: 'unsubscribe',
      source: 'prospect_reply',
    }, { onConflict: 'client_id,email' });
    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'email_replied',
      description: 'Demande de désabonnement — blacklisté',
      data: { classification: 'unsubscribe' },
      created_at: now,
    });
    await supabase.from('agent_logs').insert({
      agent: 'email', action: 'inbound_processed', status: 'ok',
      user_id: ownerId,
      data: { message_id: normalized.message_id, from: normalized.from_email, classification, decision: 'blacklisted' },
      created_at: now,
    });
    return NextResponse.json({ ok: true, result: 'blacklisted' });
  }

  if (classification === 'negative') {
    await supabase.from('crm_prospects').update({
      temperature: 'dead',
      status: 'perdu',
      email_sequence_status: 'stopped',
      updated_at: now,
    }).eq('id', prospect.id);
    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'email_replied',
      description: 'Réponse négative — séquence stoppée',
      data: { classification: 'negative' },
      created_at: now,
    });
    await supabase.from('agent_logs').insert({
      agent: 'email', action: 'inbound_processed', status: 'ok',
      user_id: ownerId,
      data: { message_id: normalized.message_id, from: normalized.from_email, classification, decision: 'stopped' },
      created_at: now,
    });
    return NextResponse.json({ ok: true, result: 'stopped' });
  }

  // needs_reply or meeting_request — generate + send a reply.
  const drafted = await generateReply({
    prospect,
    dossier,
    inbound: normalized,
    classification,
  });

  if (!drafted) {
    // Couldn't generate — surface for the human without staying silent.
    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: 'email_replied',
      description: `Réponse reçue mais Hugo n'a pas pu drafter — à regarder à la main`,
      data: { classification, inbound_preview: normalized.body.substring(0, 300) },
      created_at: now,
    });
    await supabase.from('crm_prospects').update({
      temperature: 'hot',
      status: classification === 'meeting_request' ? 'demo' : 'repondu',
      updated_at: now,
    }).eq('id', prospect.id);
    return NextResponse.json({ ok: true, result: 'reply_generation_failed' });
  }

  // Brevo is our only SMTP — same sender we use for the outbound campaign.
  // Using the client's own "from" name improves authenticity.
  const senderName = dossier?.company_name || client?.first_name || 'KeiroAI';
  const sent = await sendReplyViaBrevo({
    toEmail: normalized.from_email,
    toName: normalized.from_name,
    subject: drafted.subject,
    body: drafted.body,
    inReplyTo: normalized.message_id,
    senderEmail: 'contact@keiroai.com', // TODO: switch to per-client sender once each client has a verified Brevo sender
    senderName,
  });

  // Update CRM state — prospect now warm/hot, logged as replied.
  await supabase.from('crm_prospects').update({
    temperature: 'hot',
    status: classification === 'meeting_request' ? 'demo' : 'repondu',
    updated_at: now,
  }).eq('id', prospect.id);

  await supabase.from('crm_activities').insert({
    prospect_id: prospect.id,
    type: 'email_replied',
    description: sent
      ? `Hugo a répondu automatiquement (${classification})`
      : `Hugo a drafté une réponse mais Brevo a échoué`,
    data: {
      classification,
      sent,
      reply_subject: drafted.subject,
      reply_body_preview: drafted.body.substring(0, 300),
      inbound_preview: normalized.body.substring(0, 300),
    },
    created_at: now,
  });

  await supabase.from('agent_logs').insert({
    agent: 'email',
    action: 'inbound_processed',
    status: sent ? 'ok' : 'error',
    user_id: ownerId,
    data: {
      message_id: normalized.message_id,
      from: normalized.from_email,
      classification,
      decision: sent ? 'auto_replied' : 'reply_failed',
      subject_out: drafted.subject,
    },
    created_at: now,
  });

  return NextResponse.json({ ok: true, result: sent ? 'auto_replied' : 'reply_failed' });
}

function normalizePayload(raw: any): InboundEmail | null {
  if (!raw || typeof raw !== 'object') return null;

  // 1. Already-normalized payload (manual POST from our own tooling)
  if (raw.from_email) {
    return {
      from_email: String(raw.from_email).toLowerCase().trim(),
      from_name: raw.from_name ? String(raw.from_name) : undefined,
      subject: raw.subject ? String(raw.subject) : undefined,
      body: String(raw.body || ''),
      message_id: raw.message_id ? String(raw.message_id) : undefined,
      in_reply_to: raw.in_reply_to ? String(raw.in_reply_to) : undefined,
    };
  }

  // 2. Brevo Inbound Parsing — payload looks like { items: [{ Uuid, From:{Address,Name}, Subject, RawTextBody, ParsedHeaders: { Message-Id, In-Reply-To }, ... }] }
  const items = raw.items || (raw.From ? [raw] : null);
  if (Array.isArray(items) && items.length > 0) {
    const it = items[0];
    const from = it.From || it.from || {};
    const headers = it.ParsedHeaders || it.Headers || {};
    const body = it.RawTextBody || it.TextBody || it.HtmlBody || it.RawHtmlBody || '';
    if (!from?.Address && !from?.address && !from?.email) return null;
    return {
      from_email: String(from.Address || from.address || from.email).toLowerCase().trim(),
      from_name: from.Name || from.name,
      subject: it.Subject || it.subject,
      body: stripQuotedReply(String(body)),
      message_id: headers['Message-Id'] || headers['message-id'],
      in_reply_to: headers['In-Reply-To'] || headers['in-reply-to'],
    };
  }

  return null;
}

/**
 * Drop quoted-reply tail ("On Tue, Apr 21… wrote:") so only the prospect's
 * new text reaches the classifier. Keeps the prompt small and focused.
 */
function stripQuotedReply(body: string): string {
  // Common French + English reply headers.
  const patterns = [
    /\n-+\s*Message d'origine\s*-+[\s\S]*$/i,
    /\nLe\s+\w+\s+\d+[\w\s,./:@-]+a\s+écrit\s*:[\s\S]*$/i,
    /\nOn\s+\w+,?\s+\w+\s+\d+,.*wrote:[\s\S]*$/i,
    /\nDe\s*:\s*.*\nEnvoyé\s*:[\s\S]*$/i,
    /\nFrom:\s*.*\nSent:[\s\S]*$/i,
    /\n>\s.*(\n>.*)+$/, // trailing "> quoted" block
  ];
  let out = body;
  for (const p of patterns) {
    out = out.replace(p, '');
  }
  return out.trim();
}
