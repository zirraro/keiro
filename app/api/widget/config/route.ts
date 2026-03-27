import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET /api/widget/config
 * Get user's widget configs + embed code
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = getSupabase();
  const { data: configs } = await supabase
    .from('widget_configs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';

  const widgetsWithCode = (configs || []).map(c => ({
    ...c,
    embed_code: `<script src="${siteUrl}/embed/widget.js" data-key="${c.widget_key}" data-agent="${c.agent_type}" data-color="${c.accent_color || '#8b5cf6'}" data-position="${c.position || 'right'}"${c.greeting_message ? ` data-greeting="${c.greeting_message}"` : ''}${c.auto_open_seconds ? ` data-auto-open="${c.auto_open_seconds}"` : ''}></script>`,
  }));

  return NextResponse.json({ ok: true, widgets: widgetsWithCode });
}

/**
 * POST /api/widget/config
 * Create a new widget config
 * Body: { agent_type, greeting_message?, accent_color?, position?, auto_open_seconds? }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = getSupabase();
  const body = await req.json();

  // Resolve org_id
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  const { data: config, error: insertErr } = await supabase
    .from('widget_configs')
    .insert({
      user_id: user.id,
      org_id: orgMember?.org_id || null,
      agent_type: body.agent_type || 'chatbot',
      greeting_message: body.greeting_message || 'Bonjour ! Comment puis-je vous aider ?',
      accent_color: body.accent_color || '#8b5cf6',
      position: body.position || 'right',
      auto_open_seconds: body.auto_open_seconds || null,
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  const embedCode = `<script src="${siteUrl}/embed/widget.js" data-key="${config.widget_key}" data-agent="${config.agent_type}" data-color="${config.accent_color}" data-position="${config.position}"${config.greeting_message ? ` data-greeting="${config.greeting_message}"` : ''}${config.auto_open_seconds ? ` data-auto-open="${config.auto_open_seconds}"` : ''}></script>`;

  return NextResponse.json({ ok: true, widget: config, embed_code: embedCode });
}

/**
 * DELETE /api/widget/config?id=xxx
 * Delete a widget config
 */
export async function DELETE(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = getSupabase();
  await supabase.from('widget_configs').delete().eq('id', id).eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
