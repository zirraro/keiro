import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getValidToken, getReviews, replyToReview, starRatingToNumber } from '@/lib/google-business-oauth';

export const runtime = 'nodejs';

/**
 * GET /api/agents/google-reviews
 * Fetch Google Business reviews for the authenticated user.
 *
 * POST /api/agents/google-reviews
 * Reply to a review.
 * Body: { review_name: string, reply: string }
 */

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = getSupabase();

  // Get user's Google Business location
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_business_location_id, google_business_location_name, google_business_refresh_token')
    .eq('id', user.id)
    .single();

  if (!profile?.google_business_location_id || !profile?.google_business_refresh_token) {
    return NextResponse.json({ ok: true, reviews: [], connected: false, message: 'Google Business non connecte' });
  }

  // Get valid token (refreshes if needed)
  const accessToken = await getValidToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ ok: true, reviews: [], connected: false, message: 'Token Google expire' });
  }

  try {
    const reviews = await getReviews(accessToken, profile.google_business_location_id, 20);

    return NextResponse.json({
      ok: true,
      connected: true,
      location: profile.google_business_location_name,
      reviews: reviews.map(r => ({
        name: r.name,
        author: r.reviewer.displayName,
        rating: starRatingToNumber(r.starRating),
        text: r.comment,
        date: r.createTime,
        replied: !!r.reviewReply,
        replyText: r.reviewReply?.comment || null,
        replyDate: r.reviewReply?.updateTime || null,
      })),
    });
  } catch (e: any) {
    console.error('[GoogleReviews] Fetch error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const { review_name, reply } = await req.json();
  if (!review_name || !reply?.trim()) {
    return NextResponse.json({ error: 'review_name et reply requis' }, { status: 400 });
  }

  const supabase = getSupabase();
  const accessToken = await getValidToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ error: 'Token Google expire — reconnectez Google Business' }, { status: 401 });
  }

  try {
    const success = await replyToReview(accessToken, review_name, reply.trim());
    if (success) {
      // Log the reply
      await supabase.from('agent_logs').insert({
        agent: 'gmaps',
        action: 'review_reply_sent',
        user_id: user.id,
        status: 'ok',
        data: { review_name, reply: reply.substring(0, 200) },
        created_at: new Date().toISOString(),
      }).catch(() => {});

      return NextResponse.json({ ok: true, sent: true });
    } else {
      return NextResponse.json({ ok: false, sent: false, error: 'Reply failed' });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
