import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const maxDuration = 30;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase non configuré');
  return createClient(url, key);
}

/**
 * POST /api/agents/whatsapp
 *
 * Actions:
 *   - send_template: Send a WhatsApp template to a prospect (first contact / outside 24h window)
 *   - send_followup: Send a free-form follow-up within the 24h conversation window
 *
 * Auth: CRON_SECRET header (for cron/admin use)
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    const body = await request.json();
    const { action, prospect_id, template_name, template_params, message, org_id } = body as {
      action: 'send_template' | 'send_followup';
      prospect_id: string;
      template_name?: string;
      template_params?: string[];
      message?: string;
      org_id?: string;
    };

    if (!action || !prospect_id) {
      return NextResponse.json({ ok: false, error: 'action and prospect_id required' }, { status: 400 });
    }

    // Fetch prospect
    const { data: prospect, error: prospectErr } = await supabase
      .from('crm_prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (prospectErr || !prospect) {
      return NextResponse.json({ ok: false, error: 'Prospect not found' }, { status: 404 });
    }

    const phone = prospect.whatsapp_phone || prospect.phone;
    if (!phone) {
      return NextResponse.json({ ok: false, error: 'Prospect has no phone number' }, { status: 400 });
    }

    // ── Check 24h window ──
    const lastMsg = prospect.whatsapp_last_message_at
      ? new Date(prospect.whatsapp_last_message_at)
      : null;
    const isWithin24h = lastMsg && (Date.now() - lastMsg.getTime()) < 24 * 60 * 60 * 1000;

    if (action === 'send_template') {
      // Template messages can be sent anytime (first contact)
      if (!template_name) {
        return NextResponse.json({ ok: false, error: 'template_name required for send_template' }, { status: 400 });
      }

      const result = await sendWhatsAppTemplate(phone, template_name, template_params);

      if (result.success) {
        // Save outbound message
        await supabase.from('whatsapp_conversations').insert({
          phone_number: phone,
          prospect_id: prospect.id,
          ...(org_id ? { org_id } : {}),
          role: 'assistant',
          message: `[Template: ${template_name}]${template_params ? ' ' + template_params.join(', ') : ''}`,
          message_type: 'template',
          whatsapp_message_id: result.messageId || null,
          created_at: now,
        });

        // Update prospect
        await supabase.from('crm_prospects').update({
          whatsapp_phone: phone,
          updated_at: now,
        }).eq('id', prospect.id);

        // Log
        await supabase.from('agent_logs').insert({
          agent: 'whatsapp',
          action: 'send_template',
          ...(org_id ? { org_id } : {}),
          data: {
            prospect_id: prospect.id,
            phone,
            template: template_name,
            success: true,
          },
          created_at: now,
        });
      }

      return NextResponse.json({ ok: result.success, messageId: result.messageId });

    } else if (action === 'send_followup') {
      // Free-form messages only within 24h window
      if (!isWithin24h && !prospect.whatsapp_opted_in) {
        return NextResponse.json({
          ok: false,
          error: 'Outside 24h conversation window. Use send_template instead.',
        }, { status: 400 });
      }

      if (!message) {
        return NextResponse.json({ ok: false, error: 'message required for send_followup' }, { status: 400 });
      }

      const result = await sendWhatsAppMessage(phone, message);

      if (result.success) {
        await supabase.from('whatsapp_conversations').insert({
          phone_number: phone,
          prospect_id: prospect.id,
          ...(org_id ? { org_id } : {}),
          role: 'assistant',
          message,
          message_type: 'text',
          whatsapp_message_id: result.messageId || null,
          created_at: now,
        });

        await supabase.from('agent_logs').insert({
          agent: 'whatsapp',
          action: 'send_followup',
          ...(org_id ? { org_id } : {}),
          data: {
            prospect_id: prospect.id,
            phone,
            message_preview: message.slice(0, 100),
            within_24h: isWithin24h,
            success: true,
          },
          created_at: now,
        });
      }

      return NextResponse.json({ ok: result.success, messageId: result.messageId });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[WhatsApp Agent] Error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
