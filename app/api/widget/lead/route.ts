import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

/**
 * POST /api/widget/lead
 * Capture email/phone leads from embedded forms on client websites.
 * Adds prospect to CRM and triggers Hugo email agent.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // Handle both JSON and form-encoded
    let data: Record<string, string> = {};
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await req.json();
    } else {
      const formData = await req.formData();
      formData.forEach((v, k) => { data[k] = String(v); });
    }

    const { widget_key, email, phone, name } = data;
    if (!widget_key || (!email && !phone)) {
      return NextResponse.json({ error: 'widget_key and email or phone required' }, { status: 400, headers });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Validate widget key
    const { data: config } = await supabase
      .from('widget_configs')
      .select('org_id, user_id')
      .eq('widget_key', widget_key)
      .eq('is_active', true)
      .single();

    if (!config) {
      return NextResponse.json({ error: 'Invalid widget key' }, { status: 403, headers });
    }

    // Add to CRM prospects
    await supabase.from('crm_prospects').insert({
      email: email || null,
      phone: phone || null,
      name: name || null,
      source: 'widget_form',
      status: 'new',
      temperature: 'warm',
      org_id: config.org_id,
      notes: `Capture via formulaire integre. Origine: ${origin}`,
    });

    // Log for Hugo agent
    await supabase.from('agent_logs').insert({
      agent: 'email',
      action: 'lead_captured',
      status: 'success',
      data: { email, phone, name, source: 'widget_form', origin },
      created_at: new Date().toISOString(),
      ...(config.org_id ? { org_id: config.org_id } : {}),
    });

    // Redirect back or return JSON based on accept header
    if (ct.includes('form')) {
      // Form submission — redirect to thank you
      const redirectUrl = data.redirect || origin || 'https://keiroai.com';
      return NextResponse.redirect(`${redirectUrl}?subscribed=true`, { status: 303, headers });
    }

    return NextResponse.json({ ok: true, message: 'Lead captured' }, { headers });
  } catch (err: any) {
    console.error('[Widget Lead] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers });
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
