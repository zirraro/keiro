import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendWhatsAppMessage,
  markAsRead,
  verifyWebhookSignature,
} from '@/lib/whatsapp';
import {
  detectBusinessType,
  detectEmail,
  detectPhone,
  detectPlanInterest,
  detectObjection,
} from '@/lib/agents/chatbot-detection';
import {
  getChatbotSystemPrompt,
} from '@/lib/agents/chatbot-prompt';
import { getWhatsAppSystemPrompt } from '@/lib/agents/whatsapp-prompt';
import { calculateScore, calculateTemperature } from '@/lib/agents/scoring';
import { callGeminiChat } from '@/lib/agents/gemini';

export const runtime = 'nodejs';
export const maxDuration = 30;

const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'arrêter', 'arreter', 'désabonner', 'desabonner', 'non merci'];

/**
 * Strip control characters (except newline/tab) and limit length.
 */
function sanitizeInput(text: string): string {
  return text
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, 2000);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase non configuré');
  return createClient(url, key);
}

/**
 * Normalise a phone number to E.164 format (digits only, with country code).
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, '');
}

// ─── GET: Meta webhook verification ─────────────────────────────────
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp Webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Verification failed', { mode, tokenMatch: token === verifyToken });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ─── POST: Incoming messages from WhatsApp ──────────────────────────
export async function POST(request: NextRequest) {
  // Read raw body for signature verification
  const rawBody = await request.text();

  // Verify signature
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[WhatsApp Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Always return 200 quickly to Meta (they retry on non-2xx)
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Meta sends a wrapper with entry[].changes[].value
  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (!value?.messages) continue;

      for (const msg of value.messages) {
        try {
          await handleIncomingMessage(msg, value.metadata);
        } catch (err: any) {
          console.error('[WhatsApp Webhook] Error handling message:', err.message);
        }
      }

      // Mark statuses (delivery receipts) — no action needed, just acknowledge
    }
  }

  return NextResponse.json({ ok: true });
}

// ─── Handle a single incoming WhatsApp message ──────────────────────
async function handleIncomingMessage(
  msg: any,
  metadata: any,
) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const senderPhone = normalizePhone(msg.from);
  const waMessageId = msg.id;

  // Extract message text
  let messageText = '';
  let messageType = msg.type || 'text';

  if (msg.type === 'text') {
    messageText = msg.text?.body || '';
  } else if (msg.type === 'interactive') {
    // Button reply
    messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
    messageType = 'interactive';
  } else if (msg.type === 'reaction') {
    // Reactions — just log, don't generate AI response
    console.log('[WhatsApp] Reaction received from', senderPhone);
    return;
  } else {
    // Image, video, audio, document, location, etc. — acknowledge but don't process
    messageText = '[media]';
    messageType = msg.type;
  }

  // ── Sanitize input ──
  if (messageText && messageText !== '[media]') {
    messageText = sanitizeInput(messageText);
  }

  // ── Deduplication: skip if this WhatsApp message ID was already processed ──
  {
    const { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('whatsapp_message_id', waMessageId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      console.log('[WhatsApp] Duplicate message skipped:', waMessageId);
      return;
    }
  }

  // ── Opt-out detection ──
  if (messageText) {
    const lower = messageText.toLowerCase().trim();
    if (OPT_OUT_KEYWORDS.some((kw) => lower === kw || lower === kw + '.')) {
      // Update prospect status
      const { data: optOutProspect } = await supabase
        .from('crm_prospects')
        .select('id')
        .or(`whatsapp_phone.eq.${senderPhone},phone.eq.${senderPhone}`)
        .limit(1)
        .maybeSingle();

      if (optOutProspect) {
        await supabase
          .from('crm_prospects')
          .update({
            temperature: 'dead',
            email_sequence_status: 'paused',
            whatsapp_opted_in: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', optOutProspect.id);
      }

      await sendWhatsAppMessage(
        senderPhone,
        "Vous avez été désabonné. Envoyez 'bonjour' pour reprendre.",
      );

      // Save the opt-out message to conversation history
      await supabase.from('whatsapp_conversations').insert({
        phone_number: senderPhone,
        prospect_id: optOutProspect?.id || null,
        role: 'user',
        message: messageText,
        message_type: messageType,
        whatsapp_message_id: waMessageId,
        created_at: new Date().toISOString(),
      });

      console.log('[WhatsApp] Opt-out processed for', senderPhone);
      return;
    }
  }

  if (!messageText || messageText === '[media]') {
    // Send a friendly nudge for unsupported message types
    await sendWhatsAppMessage(
      senderPhone,
      "Salut ! Je ne peux lire que les messages texte pour l'instant. Dis-moi comment je peux t'aider ?",
    );
    return;
  }

  // Mark as read (blue ticks)
  await markAsRead(waMessageId);

  // ── 1. Find or create prospect by phone ──
  let prospect: any = null;
  const { data: existingProspect } = await supabase
    .from('crm_prospects')
    .select('*')
    .eq('whatsapp_phone', senderPhone)
    .single();

  if (existingProspect) {
    prospect = existingProspect;
    // Update last message time
    await supabase
      .from('crm_prospects')
      .update({
        whatsapp_last_message_at: now,
        whatsapp_opted_in: true,
        updated_at: now,
      })
      .eq('id', prospect.id);
  } else {
    // Also check regular phone field
    const { data: byPhone } = await supabase
      .from('crm_prospects')
      .select('*')
      .eq('phone', senderPhone)
      .single();

    if (byPhone) {
      prospect = byPhone;
      await supabase
        .from('crm_prospects')
        .update({
          whatsapp_phone: senderPhone,
          whatsapp_opted_in: true,
          whatsapp_last_message_at: now,
          updated_at: now,
        })
        .eq('id', prospect.id);
    } else {
      // Create new prospect
      const score = calculateScore({ source: 'whatsapp', phone: senderPhone });
      const temperature = calculateTemperature(score);
      const { data: newProspect } = await supabase
        .from('crm_prospects')
        .insert({
          phone: senderPhone,
          whatsapp_phone: senderPhone,
          whatsapp_opted_in: true,
          whatsapp_last_message_at: now,
          source: 'whatsapp',
          status: 'identifie',
          score,
          temperature,
          email_sequence_status: 'not_started',
          email_sequence_step: 0,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      prospect = newProspect;
    }
  }

  if (!prospect) {
    console.error('[WhatsApp] Failed to find or create prospect for', senderPhone);
    return;
  }

  // ── 2. Save user message to whatsapp_conversations ──
  await supabase.from('whatsapp_conversations').insert({
    phone_number: senderPhone,
    prospect_id: prospect.id,
    role: 'user',
    message: messageText,
    message_type: messageType,
    whatsapp_message_id: waMessageId,
    created_at: now,
  });

  // ── 3. Load conversation history (last 10 messages) ──
  const { data: historyRows } = await supabase
    .from('whatsapp_conversations')
    .select('role, message')
    .eq('phone_number', senderPhone)
    .order('created_at', { ascending: false })
    .limit(10);

  const history = (historyRows || [])
    .reverse()
    .map((h: any) => ({
      role: h.role as 'user' | 'assistant',
      content: h.message,
    }));

  // ── 4. Run detection ──
  const detectedType = detectBusinessType(messageText);
  const detectedEmail = detectEmail(messageText);
  const detectedPhone = detectPhone(messageText);
  const detectedPlan = detectPlanInterest(messageText);
  const detectedObjection = detectObjection(messageText);

  // Update prospect with detected info
  const updates: Record<string, any> = { updated_at: now };
  if (detectedType && !prospect.type) updates.type = detectedType;
  if (detectedEmail && !prospect.email) updates.email = detectedEmail;
  if (detectedPlan) updates.plan_interest = detectedPlan;
  if (Object.keys(updates).length > 1) {
    const newScore = calculateScore({ ...prospect, ...updates, source: prospect.source || 'whatsapp' });
    updates.score = newScore;
    updates.temperature = calculateTemperature(newScore, { ...prospect, ...updates });
    await supabase.from('crm_prospects').update(updates).eq('id', prospect.id);
  }

  // ── 5. Build elite WhatsApp prompt ──
  const systemPrompt = getWhatsAppSystemPrompt({
    companyName: 'KeiroAI',
    prospectName: prospect.first_name || undefined,
    prospectCompany: prospect.company || undefined,
    prospectType: prospect.type || undefined,
  });
  const whatsappContext = '';

  let assistantMessage: string;
  try {
    // Remove the last entry (current message) from history since we pass it separately
    const historyForAI = history.slice(0, -1);
    assistantMessage = await callGeminiChat({
      system: systemPrompt + whatsappContext,
      history: historyForAI,
      message: messageText,
      maxTokens: 300, // WhatsApp = short messages
      thinking: true,
    });
  } catch (aiErr: any) {
    console.error('[WhatsApp] AI error:', aiErr.message);
    // Fallback
    const low = messageText.toLowerCase();
    if (low.includes('prix') || low.includes('combien') || low.includes('tarif')) {
      assistantMessage = "Le plan Fondateurs c'est 149€/mois — la plupart des pros le choisissent. 1 client en plus et c'est remboursé. Tu veux les détails ?";
    } else if (low.includes('bonjour') || low.includes('salut') || low.includes('hello')) {
      assistantMessage = "Salut ! Bienvenue sur KeiroAI. Tu cherches à booster tes réseaux sociaux ? Dis-moi ton secteur !";
    } else {
      assistantMessage = "KeiroAI crée ton contenu pro en 3 min — images, vidéos, textes. C'est quoi ton activité ?";
    }
  }

  // ── 6. Send reply via WhatsApp ──
  const sendResult = await sendWhatsAppMessage(senderPhone, assistantMessage);

  // ── 7. Save assistant message ──
  await supabase.from('whatsapp_conversations').insert({
    phone_number: senderPhone,
    prospect_id: prospect.id,
    role: 'assistant',
    message: assistantMessage,
    message_type: 'text',
    whatsapp_message_id: sendResult.messageId || null,
    created_at: new Date().toISOString(),
  });

  // ── 8. Log to agent_logs ──
  let action = 'whatsapp_conversation';
  if (detectedEmail) action = 'whatsapp_lead_email';
  else if (detectedPlan) action = 'whatsapp_plan_interest';
  else if (detectedObjection) action = 'whatsapp_objection';
  else if (detectedType) action = 'whatsapp_business_type';

  await supabase.from('agent_logs').insert({
    agent: 'whatsapp',
    action,
    data: {
      phone: senderPhone,
      prospect_id: prospect.id,
      detected: {
        type: detectedType,
        email: detectedEmail,
        phone: detectedPhone,
        plan: detectedPlan,
        objection: detectedObjection,
      },
      message_sent: sendResult.success,
    },
    created_at: now,
  });

  console.log(`[WhatsApp] Processed message from ${senderPhone} → replied: ${sendResult.success}`);
}
