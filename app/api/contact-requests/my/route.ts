import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/contact-requests/my — Fetch authenticated user's own contact requests
export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: requests, error } = await supabaseAdmin
      .from('contact_requests')
      .select('id, subject, status, messages, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching user contact requests:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests: requests || [] });
  } catch (err: unknown) {
    console.error('GET /api/contact-requests/my error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/contact-requests/my — User replies to their own ticket
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId, message } = await req.json();

    if (!requestId || !message) {
      return NextResponse.json({ error: 'requestId and message are required' }, { status: 400 });
    }

    // Verify the request belongs to this user
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('contact_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const currentMessages = existing.messages || [];
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('contact_requests')
      .update({
        messages: [
          ...currentMessages,
          { from: 'user', text: message, at: new Date().toISOString() },
        ],
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating contact request:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, request: updated });
  } catch (err: unknown) {
    console.error('POST /api/contact-requests/my error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
