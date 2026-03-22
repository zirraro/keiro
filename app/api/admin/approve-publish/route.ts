import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const postId = request.nextUrl.searchParams.get('postId');
  const action = request.nextUrl.searchParams.get('action');
  const token = request.nextUrl.searchParams.get('token');

  if (!postId || !action || !token) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  // Verify token (simple hash of postId + CRON_SECRET)
  const expectedToken = Buffer.from(`${postId}:${process.env.CRON_SECRET || 'keiro'}`).toString('base64url').slice(0, 16);
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}` || 'https://keiroai.com';

  if (action === 'approve') {
    // Mark as approved → the next cron will auto-publish it
    await supabase.from('content_calendar').update({
      status: 'approved',
      updated_at: new Date().toISOString(),
    }).eq('id', postId);

    // Try to publish immediately by calling the content agent
    try {
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        await fetch(`${siteUrl}/api/agents/content`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cronSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'publish_single', postId }),
        });
      }
    } catch { /* will be picked up by next cron */ }

    // Redirect to admin page
    return NextResponse.redirect(`${siteUrl}/admin/dm-queue?tab=pub_instagram&approved=${postId}`);
  }

  if (action === 'regenerate') {
    // Regenerate the visual
    try {
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        await fetch(`${siteUrl}/api/agents/content`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cronSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'regenerate_visual', postId }),
        });
      }
    } catch { /* visual regeneration will happen async */ }

    // Send a new notification email after regeneration
    // The content agent will handle sending the new email after generating a new visual

    return NextResponse.redirect(`${siteUrl}/admin/dm-queue?tab=pub_instagram&regenerated=${postId}`);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
