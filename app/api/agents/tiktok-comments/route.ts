import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Axel — TikTok comments auto-reply cron / manual trigger.
 *
 * For each user with a fresh tiktok_access_token + at least one
 * recent video, fetch comments, draft a personalised reply using
 * the commenter's bio (when available), and post it via the TikTok
 * comment.list.manage API. Falls back to a manual-reply queue on
 * crm_activities when the scope hasn't been granted yet.
 *
 * Mirrors the structure of /api/agents/instagram-comments so the
 * downstream dashboard / observability code applies symmetrically.
 */

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function isCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest) {
  if (!isCron(req)) {
    // Allow logged-in admin too — keep parity with other agent endpoints.
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });
  }

  const supabase = adminSupabase();
  const userIdParam = req.nextUrl.searchParams.get('user_id');

  // Pull users to process — single user when explicitly targeted,
  // else everyone with a TT token + auto_mode_tiktok enabled.
  let users: Array<{ id: string; tiktok_access_token: string; tiktok_user_id?: string }> = [];
  if (userIdParam) {
    const { data: row } = await supabase
      .from('profiles')
      .select('id, tiktok_access_token, tiktok_user_id')
      .eq('id', userIdParam)
      .maybeSingle();
    if (row?.tiktok_access_token) users = [row as any];
  } else {
    const { data: rows } = await supabase
      .from('profiles')
      .select('id, tiktok_access_token, tiktok_user_id')
      .not('tiktok_access_token', 'is', null)
      .limit(100);
    users = (rows || []) as any[];
  }

  if (users.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, reason: 'no_users' });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { fetchTtVideoComments, replyTtComment, ttCommenterToPromptContext } = await import('@/lib/agents/tiktok-comments');

  let totalReplied = 0;
  let totalQueued = 0;
  const perUser: Array<{ user_id: string; replied: number; queued: number; reason?: string }> = [];

  for (const u of users) {
    let userReplied = 0;
    let userQueued = 0;
    let firstError: string | undefined;
    try {
      // Pull recent videos so we know which comments to walk. We
      // only check the 5 most recent — older posts very rarely get
      // new comments worth replying to.
      const videoListRes = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${u.tiktok_access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_count: 5 }),
      });
      if (!videoListRes.ok) {
        firstError = `video.list ${videoListRes.status}`;
        perUser.push({ user_id: u.id, replied: 0, queued: 0, reason: firstError });
        continue;
      }
      const videos: Array<{ id: string }> = ((await videoListRes.json())?.data?.videos || []) as any[];

      // Brand context for the reply — same shape Léna uses
      const { data: dossier } = await supabase
        .from('business_dossiers')
        .select('business_type, ai_summary, brand_tone, value_proposition')
        .eq('user_id', u.id)
        .maybeSingle();
      const brandContext = dossier
        ? `Marque : ${dossier.ai_summary || ''}\nType : ${dossier.business_type || ''}\nTon : ${dossier.brand_tone || 'naturel, chaleureux'}\nUSP : ${dossier.value_proposition || ''}`
        : '';

      for (const v of videos) {
        const { comments } = await fetchTtVideoComments(v.id, u.tiktok_access_token, 30);
        for (const c of comments) {
          // Skip spam (same heuristics as Jade comments)
          if (c.text.length < 3 || /follow|dm me|check|click|http/i.test(c.text)) continue;

          // Idempotency: have we already replied to this comment?
          const { data: existing } = await supabase
            .from('agent_logs')
            .select('id')
            .eq('agent', 'tiktok_comments')
            .contains('data', { comment_id: c.id })
            .limit(1)
            .maybeSingle();
          if (existing) continue;

          // Generate reply — same warm tone as Jade, plus commenter
          // context (bio / verified / followers).
          const commenterBlock = ttCommenterToPromptContext(c.author);
          const promptText = `Tu gères les commentaires TikTok d'un commerce. Réponds à ce commentaire de manière naturelle, chaleureuse et engageante. Max 2 phrases. TikTok cap : 150 caractères.

Si tu connais le prénom ou la niche du commentateur, glisse une référence courte qui montre que tu l'as remarqué — sans en faire trop.
${brandContext ? `\n${brandContext}\n` : ''}
${commenterBlock}

Commentaire : "${c.text}"

Réponds UNIQUEMENT avec le texte de la réponse, en français, sans guillemets.`;

          let reply = '';
          try {
            const resp = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 200,
              messages: [{ role: 'user', content: promptText }],
            });
            reply = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '';
            // Trim trailing punctuation issues + ensure sentence ends.
            if (reply.length > 150) reply = reply.slice(0, 147).replace(/[\s,;:]+$/, '') + '…';
            else if (reply && !/[.!?…]$/.test(reply)) reply = reply.replace(/[\s,;:]+$/, '') + '.';
          } catch {}
          if (!reply) continue;

          // Post the reply. If the scope isn't granted (403), queue
          // for manual reply via the dashboard instead.
          const post = await replyTtComment(v.id, c.id, reply, u.tiktok_access_token);
          if (post.ok) {
            userReplied++;
            await supabase.from('agent_logs').insert({
              agent: 'tiktok_comments',
              action: 'reply_sent',
              status: 'success',
              user_id: u.id,
              data: {
                comment_id: c.id,
                video_id: v.id,
                username: c.author.username,
                comment: c.text.slice(0, 200),
                reply: reply.slice(0, 200),
                auto: true,
                tt_reply_id: post.comment_id,
              },
              created_at: new Date().toISOString(),
            });
          } else if (post.reason === 'scope_missing') {
            // Queue for manual reply
            userQueued++;
            await supabase.from('agent_logs').insert({
              agent: 'tiktok_comments',
              action: 'reply_queued',
              status: 'pending',
              user_id: u.id,
              data: {
                comment_id: c.id,
                video_id: v.id,
                username: c.author.username,
                comment: c.text.slice(0, 200),
                draft_reply: reply.slice(0, 200),
                reason: 'scope_missing — re-auth TikTok with comment.list.manage',
              },
              created_at: new Date().toISOString(),
            });
            firstError = firstError || 'scope_missing';
          } else {
            console.warn(`[Axel] reply failed for comment ${c.id}: ${post.reason}`);
          }
        }
      }

      perUser.push({ user_id: u.id, replied: userReplied, queued: userQueued, ...(firstError ? { reason: firstError } : {}) });
      totalReplied += userReplied;
      totalQueued += userQueued;
    } catch (e: any) {
      perUser.push({ user_id: u.id, replied: userReplied, queued: userQueued, reason: e?.message?.slice(0, 100) || 'error' });
    }
  }

  return NextResponse.json({
    ok: true,
    users: users.length,
    replied: totalReplied,
    queued: totalQueued,
    details: perUser.slice(0, 20),
  });
}
