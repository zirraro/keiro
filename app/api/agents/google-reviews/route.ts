import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getValidToken, getReviews, replyToReview, starRatingToNumber } from '@/lib/google-business-oauth';
import { generateReviewReply } from '@/lib/agents/theo-review-reply';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

export async function GET(req: NextRequest) {
  // Support CRON_SECRET for scheduled calls
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  let userId: string | null = null;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    userId = req.nextUrl.searchParams.get('user_id') || null;
    // If no user_id, find admin
    if (!userId) {
      const supabase = getSupabase();
      const { data: admin } = await supabase.from('profiles').select('id').eq('is_admin', true).limit(1).maybeSingle();
      userId = admin?.id || null;
    }
  } else {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    userId = user.id;
  }

  if (!userId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  const user = { id: userId };

  const supabase = getSupabase();

  // Check auto-reply setting
  const checkAuto = new URL(req.url).searchParams.get('check_auto');
  if (checkAuto) {
    const { data: p } = await supabase.from('profiles').select('google_reviews_auto_reply').eq('id', user.id).single();
    return NextResponse.json({ ok: true, auto_reply: !!p?.google_reviews_auto_reply });
  }

  // Get user's Google Business location
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_business_location_id, google_business_location_name, google_business_refresh_token')
    .eq('id', user.id)
    .single();

  // No refresh token → truly not connected.
  if (!profile?.google_business_refresh_token) {
    return NextResponse.json({ ok: true, reviews: [], connected: false, message: 'Google Business non connecte' });
  }

  // Tokens saved but no location picked yet — report connected so the UI
  // switches out of the preview banner, but return zero reviews and a
  // helpful message. This handles the "OAuth succeeded but the account has
  // no location" case that previously looked identical to "not connected".
  if (!profile.google_business_location_id) {
    return NextResponse.json({
      ok: true,
      connected: true,
      reviews: [],
      needsLocation: true,
      message: 'Google Business connecte, mais aucun etablissement trouve. Ajoute ton etablissement sur business.google.com puis reessaie.',
    });
  }

  // Get valid token (refreshes if needed)
  const accessToken = await getValidToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ ok: true, reviews: [], connected: false, message: 'Token Google expire' });
  }

  try {
    const reviews = await getReviews(accessToken, profile.google_business_location_id, 20);

    // Théo auto-reply flow: when the cron wakes us up with CRON_SECRET and
    // the client has google_reviews_auto_reply=true, we iterate every
    // unreplied review, classify it, generate a reply (or escalate), and
    // post it via replyToReview. When invoked by a UI user this block is
    // skipped — they'll see the raw reviews and reply manually.
    const { data: autoReplyProfile } = await supabase
      .from('profiles')
      .select('google_reviews_auto_reply')
      .eq('id', user.id)
      .maybeSingle();

    const shouldAutoReply = !!autoReplyProfile?.google_reviews_auto_reply && req.headers.get('authorization') === `Bearer ${cronSecret}`;

    const autoReport: { replied: number; escalated: number; skipped: number; details: Array<{ name: string; action: string; reason?: string }> } = {
      replied: 0, escalated: 0, skipped: 0, details: [],
    };

    if (shouldAutoReply) {
      const { data: dossier } = await supabase
        .from('business_dossiers')
        .select('company_name, business_type, brand_tone, main_products, target_audience, city, custom_fields')
        .eq('user_id', user.id)
        .maybeSingle();

      // Keep replies we already posted on the location — Théo can mirror
      // the house tone and avoid writing in a voice the client doesn't use.
      const pastReplies = reviews
        .map(r => r.reviewReply?.comment)
        .filter((x): x is string => !!x);

      for (const r of reviews) {
        if (r.reviewReply) continue; // already replied
        const ctx = {
          rating: starRatingToNumber(r.starRating),
          text: r.comment || '',
          author: r.reviewer.displayName,
          created_at: r.createTime,
          previous_replies: pastReplies,
        };

        const decision = await generateReviewReply(ctx, dossier || null);

        if (decision.action === 'reply') {
          const posted = await replyToReview(accessToken, r.name, decision.body).catch(() => false);
          if (posted) {
            autoReport.replied++;
            autoReport.details.push({ name: r.name, action: 'replied' });
            await supabase.from('agent_logs').insert({
              agent: 'gmaps',
              action: 'review_reply_sent',
              user_id: user.id,
              status: 'ok',
              data: {
                review_name: r.name,
                rating: ctx.rating,
                reply: decision.body.substring(0, 500),
                rationale: decision.rationale.substring(0, 300),
                auto: true,
              },
              created_at: new Date().toISOString(),
            }).throwOnError?.();
          } else {
            autoReport.skipped++;
            autoReport.details.push({ name: r.name, action: 'post_failed' });
          }
        } else {
          // Escalate — notify the client so they handle it themselves.
          autoReport.escalated++;
          autoReport.details.push({ name: r.name, action: 'escalated', reason: decision.reason });
          await supabase.from('client_notifications').insert({
            user_id: user.id,
            agent: 'gmaps',
            type: 'review_escalation',
            title: `Avis Google à gérer (${ctx.rating}⭐)`,
            message: `${ctx.author} : "${ctx.text.substring(0, 140)}${ctx.text.length > 140 ? '…' : ''}" — ${decision.reason}`,
            data: {
              review_name: r.name,
              rating: ctx.rating,
              author: ctx.author,
              text: ctx.text,
              reason: decision.reason,
              draft_for_human: decision.draft_for_human,
            },
          }).throwOnError?.();
          await supabase.from('agent_logs').insert({
            agent: 'gmaps',
            action: 'review_escalated',
            user_id: user.id,
            status: 'ok',
            data: {
              review_name: r.name,
              rating: ctx.rating,
              reason: decision.reason,
            },
            created_at: new Date().toISOString(),
          }).throwOnError?.();
        }

        // Respect Google API rate limits — keep it conservative.
        await new Promise(res => setTimeout(res, 1500));
      }
    }

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
      ...(shouldAutoReply ? { auto_reply_report: autoReport } : {}),
    });
  } catch (e: any) {
    console.error('[GoogleReviews] Fetch error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const body = await req.json();

  // Toggle auto-reply setting
  if (body.action === 'toggle_auto_reply') {
    const supabase = getSupabase();
    await supabase.from('profiles').update({ google_reviews_auto_reply: !!body.enabled }).eq('id', user.id);
    return NextResponse.json({ ok: true, auto_reply: !!body.enabled });
  }

  const { review_name, reply } = body;
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
      try {
        await supabase.from('agent_logs').insert({
          agent: 'gmaps',
          action: 'review_reply_sent',
          user_id: user.id,
          status: 'ok',
          data: { review_name, reply: reply.substring(0, 200) },
          created_at: new Date().toISOString(),
        });
      } catch { /* non-fatal */ }

      return NextResponse.json({ ok: true, sent: true });
    } else {
      return NextResponse.json({ ok: false, sent: false, error: 'Reply failed' });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
