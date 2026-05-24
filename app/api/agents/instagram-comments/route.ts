import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import Anthropic from '@anthropic-ai/sdk';
import { graphGET, graphPOST } from '@/lib/meta';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * POST /api/agents/instagram-comments
 * Manage Instagram comments: fetch, reply, moderate.
 * Actions: fetch_comments, reply_comment, auto_reply_all
 */
export async function POST(req: NextRequest) {
  // Auth: admin or CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const isCron = cronSecret && auth === `Bearer ${cronSecret}`;

  if (!isCron) {
    const { user, error } = await getAuthUser();
    if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  }

  const supabase = getSupabase();
  const body = await req.json();
  const action = body.action || 'fetch_comments';

  // Get IG tokens — prefer authenticated user, then user_id param, then admin fallback for monitoring only
  // We pull instagram_igaa_token as well because when FB page tokens are
  // expired or missing, IGAA tokens still work against graph.instagram.com.
  let profile: any = null;
  const targetUserId = body.user_id;
  const PROFILE_COLS = 'instagram_business_account_id, facebook_page_access_token, instagram_access_token, instagram_igaa_token';

  if (!isCron) {
    const { user } = await getAuthUser().catch(() => ({ user: null }));
    if (user) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select(PROFILE_COLS)
        .eq('id', user.id)
        .single();
      if (userProfile?.instagram_business_account_id || userProfile?.instagram_igaa_token) profile = userProfile;
    }
  }

  if (!profile && targetUserId) {
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('id', targetUserId)
      .single();
    if (targetProfile?.instagram_business_account_id || targetProfile?.instagram_igaa_token) profile = targetProfile;
  }

  // Admin fallback ONLY for fetch_comments (read-only), NOT for replying
  if (!profile && action === 'fetch_comments') {
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('is_admin', true)
      .single();
    profile = adminProfile;
  }

  if (!profile || !(profile?.facebook_page_access_token || profile?.instagram_igaa_token || profile?.instagram_access_token)) {
    return NextResponse.json({ error: 'Instagram non connecte' }, { status: 400 });
  }

  const igId = profile.instagram_business_account_id;
  // IGAA token takes priority (it's the only one guaranteed to work for DM +
  // comment APIs on graph.instagram.com). FB page token is the fallback.
  const useIgaa = !!profile.instagram_igaa_token;
  const token = useIgaa ? profile.instagram_igaa_token : profile.facebook_page_access_token;
  const now = new Date().toISOString();

  // When using IGAA we must hit graph.instagram.com and /me/media (the
  // token is bound to one account). With the FB page token we hit
  // graph.facebook.com and /{ig_id}/media.
  const IG_HOST = 'https://graph.instagram.com/v21.0';
  const fetchGraph = async <T>(path: string, params: Record<string, string | number>): Promise<T> => {
    if (useIgaa) {
      const qs = new URLSearchParams({ access_token: token, ...Object.fromEntries(Object.entries(params).map(([k,v])=>[k,String(v)])) });
      const res = await fetch(`${IG_HOST}${path}?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<T>;
    }
    return graphGET<T>(path, token, params);
  };

  if (action === 'fetch_comments') {
    // Fetch recent media + their comments.
    // Strategy: scan up to 100 most recent posts but only fetch
    // /<id>/comments for those with comments_count > 0. Comments often
    // live on older posts (not the 10 most recent), and skipping
    // empty posts saves a lot of Graph API calls.
    try {
      const mediaPath = useIgaa ? '/me/media' : `/${igId}/media`;
      // Page through up to 4 batches of 50 (200 posts total) to find
      // posts with comments. Comments live deep in the history on
      // long-running accounts — diagnosed on @keiro_ai which had 22
      // comments across 5 posts within the first 150.
      type Media = { id: string; caption?: string; timestamp: string; media_url?: string; thumbnail_url?: string; permalink?: string; media_type?: string; comments_count?: number };
      const collected: Media[] = [];
      let after: string | undefined;
      for (let page = 0; page < 4; page++) {
        const batch: any = await fetchGraph<{ data: Media[]; paging?: { cursors?: { after?: string } } }>(
          mediaPath,
          {
            fields: 'id,caption,timestamp,media_url,thumbnail_url,permalink,media_type,comments_count',
            limit: 50,
            ...(after ? { after } : {}),
          }
        );
        collected.push(...((batch?.data as Media[]) || []));
        after = batch?.paging?.cursors?.after;
        if (!after || (batch?.data || []).length < 50) break;
      }

      // Keep only posts that actually have comments — skip the empty
      // ones entirely to avoid useless API calls.
      const postsWithComments = collected.filter(p => (p.comments_count || 0) > 0);

      const allComments: Array<{
        media_id: string;
        comment_id: string;
        text: string;
        username: string;
        timestamp: string;
        replied: boolean;
        post: { caption: string; thumbnail_url: string | null; permalink: string | null; media_type: string | null; posted_at: string };
      }> = [];

      // Same self-username probe used by auto_reply_all — needed here
      // so the UI list doesn't surface Jade's own replies as 'pending
      // comments to reply to'.
      let selfUsernameFetch: string | null = null;
      try {
        const me = await fetchGraph<{ username: string }>(`/${igId}`, { fields: 'username' });
        selfUsernameFetch = (me?.username || '').toLowerCase() || null;
      } catch { /* non-fatal */ }

      for (const post of postsWithComments) {
        try {
          const comments = await fetchGraph<{ data: Array<{ id: string; text: string; username: string; timestamp: string; replied_to?: any }> }>(
            `/${post.id}/comments`, { fields: 'id,text,username,timestamp,replied_to' }
          );

          const postCtx = {
            caption: (post.caption || '').slice(0, 240),
            // For videos/reels, thumbnail_url is the frame image; for images, media_url is the image.
            thumbnail_url: post.thumbnail_url || post.media_url || null,
            permalink: post.permalink || null,
            media_type: post.media_type || null,
            posted_at: post.timestamp || '',
          };

          for (const c of comments.data || []) {
            // Hide our own replies from the listing.
            if (selfUsernameFetch && (c.username || '').toLowerCase() === selfUsernameFetch) continue;
            // Hide replies-to-replies: keep only top-level commenter
            // threads so the UI doesn't loop on its own.
            if (c.replied_to) continue;

            // Check if already replied (kept loose: any action with
            // this comment_id counts).
            const { data: existing } = await supabase
              .from('agent_logs')
              .select('id')
              .eq('agent', 'instagram_comments')
              .filter('data->>comment_id', 'eq', c.id)
              .limit(1)
              .maybeSingle();

            allComments.push({
              media_id: post.id,
              comment_id: c.id,
              text: c.text,
              username: c.username,
              timestamp: c.timestamp,
              replied: !!existing,
              post: postCtx,
            });
          }
        } catch {}
      }

      // Sort newest comment first so the UI shows the most recent on top.
      allComments.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

      return NextResponse.json({
        ok: true,
        comments: allComments,
        total: allComments.length,
        meta: { posts_scanned: collected.length, posts_with_comments: postsWithComments.length },
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'reply_comment') {
    // Reply to a specific comment. We accept either a body.message (sent
    // verbatim) or body.custom_reply (alias used by the new Comments UI).
    // If neither is provided we generate one via Claude using the brand
    // dossier so the bulk-reply button can fire on raw comment ids.
    const { comment_id, custom_reply } = body;
    let message = (body.message || custom_reply || '').trim();
    if (!comment_id) return NextResponse.json({ error: 'comment_id requis' }, { status: 400 });

    if (!message) {
      // Generate a contextual reply if the client didn't pass one. Pulled
      // out into a tiny inline helper rather than a full route because we
      // want minimal latency for the bulk "IA répond aux N" path.
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        try {
          const ant = new Anthropic({ apiKey });
          const r = await ant.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            system: `You write Instagram comment replies as the brand owner.

QUALITY BAR (non-negotiable):
- 1-2 sentences max. Conversational, like a real human reply, not a corporate template.
- Mirror the language of the original comment (French by default, switch if the commenter wrote in another language).
- Warm but specific. If the comment praises a product/dish/service, acknowledge that exact thing in your reply.
- BAN: "merci pour votre commentaire", "n'hésitez pas à", "cordialement", "nous vous remercions", any AI-sounding formal closure.
- BAN: emoji spam (max 1), hashtags, links, "DM-moi pour plus d'infos" (Meta flags this as spam pattern).
- NEVER say "IA", "intelligence artificielle", "automatisé", "généré par".
- If the comment is just an emoji or single word ("top", "🔥"), reply with a matching warm 1-line thanks — never paste a sales pitch.
- If the comment is a real question, answer it directly, not "DM-moi" deflection.`,
            messages: [{ role: 'user', content: `Reply briefly and naturally to this Instagram comment id ${comment_id}.` }],
          });
          message = r.content
            .filter((b): b is any => b.type === 'text')
            .map((b: any) => b.text)
            .join('')
            .slice(0, 600) || 'Merci !';
        } catch {
          message = 'Merci !';
        }
      } else {
        message = 'Merci !';
      }
    }

    // Resolve the user_id so the audit log row is scoped to the client
    // even when this endpoint is invoked from a cron with CRON_SECRET.
    let resolvedUserId: string | null = null;
    if (!isCron) {
      const { user } = await getAuthUser().catch(() => ({ user: null }));
      resolvedUserId = user?.id || null;
    }
    if (!resolvedUserId && targetUserId) resolvedUserId = targetUserId;

    try {
      // DEDUP GUARD — even for manual single-click replies, refuse if
      // we already replied to this comment. Uses the same .filter()
      // syntax as the auto_reply_all guard (was .or() which doesn't
      // reliably match a single condition on PostgREST).
      const { data: alreadySent } = await supabase
        .from('agent_logs')
        .select('id')
        .eq('agent', 'instagram_comments')
        .filter('data->>comment_id', 'eq', comment_id)
        .limit(1)
        .maybeSingle();
      if (alreadySent) {
        return NextResponse.json({
          ok: false,
          error: 'Une réponse a déjà été envoyée à ce commentaire — pas de double-envoi.',
          alreadyReplied: true,
        }, { status: 409 });
      }

      // ATOMIC RESERVATION — same pattern as auto_reply_all. INSERT a
      // pending row keyed by comment_id; UNIQUE INDEX rejects races.
      const { error: lockErr } = await supabase.from('agent_logs').insert({
        agent: 'instagram_comments',
        action: 'reply_comment',
        status: 'pending',
        ...(resolvedUserId ? { user_id: resolvedUserId } : {}),
        data: { comment_id, reserving: true },
        created_at: now,
      });
      if (lockErr) {
        if (String(lockErr.message).includes('duplicate')) {
          return NextResponse.json({
            ok: false,
            error: 'Une réponse a déjà été envoyée à ce commentaire — pas de double-envoi.',
            alreadyReplied: true,
          }, { status: 409 });
        }
        // Non-unique error → bubble up
        return NextResponse.json({ error: lockErr.message }, { status: 500 });
      }

      await graphPOST(`/${comment_id}/replies`, token, { message });

      // Promote the reservation to success
      await supabase.from('agent_logs').update({
        status: 'success',
        data: { comment_id, message_preview: message.substring(0, 200), method: useIgaa ? 'igaa' : 'fb_page' },
      })
      .eq('agent', 'instagram_comments')
      .eq('action', 'reply_comment')
      .eq('status', 'pending')
      .filter('data->>comment_id', 'eq', comment_id);

      return NextResponse.json({ ok: true, reply: message });
    } catch (e: any) {
      // Release the reservation so a retry can succeed later.
      try {
        await supabase.from('agent_logs').delete()
          .eq('agent', 'instagram_comments')
          .eq('action', 'reply_comment')
          .eq('status', 'pending')
          .filter('data->>comment_id', 'eq', comment_id);
      } catch { /* best-effort */ }
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'auto_reply_all') {
    // Auto-reply to unreplied comments using AI
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });

    // Resolve whose dossier we should use: prefer targetUserId from the
    // body (cron + worker call with user_id), otherwise the authenticated
    // user, otherwise fall back to admin for manual QA.
    let dossierUserId: string | null = targetUserId || null;
    if (!dossierUserId && !isCron) {
      const { user } = await getAuthUser().catch(() => ({ user: null }));
      dossierUserId = user?.id || null;
    }
    if (!dossierUserId) {
      dossierUserId = (await supabase.from('profiles').select('id').eq('is_admin', true).single()).data?.id || null;
    }

    const { data: dossier } = await supabase
      .from('business_dossiers')
      .select('company_name, business_type, brand_tone, main_products')
      .eq('user_id', dossierUserId)
      .maybeSingle();

    const brandContext = dossier
      ? `Commerce: ${dossier.company_name || ''}. Type: ${dossier.business_type || ''}. Ton: ${dossier.brand_tone || 'chaleureux'}. Produits: ${dossier.main_products || ''}.`
      : '';

    // Fetch unreplied comments
    const media = await graphGET<{ data: Array<{ id: string }> }>(
      `/${igId}/media`, token, { fields: 'id', limit: '5' }
    );

    let replied = 0;
    const anthropic = new Anthropic({ apiKey });

    // Resolve our own IG username so we can hard-skip self-authored
    // comments (and replies to comments). Without this, every reply
    // Jade posts becomes a 'new' comment on next sweep and she replies
    // to her own reply — recursive loop the founder caught on
    // 2026-05-23 with 8 cascading replies on a single thread.
    //
    // Fallback ladder: 1) Graph API live, 2) profiles.instagram_username
    // we saved on connect, 3) HARD ABORT — without a self username we
    // cannot dedup reliably, and the founder reported that a missing
    // selfUsername was causing double-replies despite all four guards.
    let selfUsername: string | null = null;
    try {
      const me = await graphGET<{ username: string }>(`/${igId}`, token, { fields: 'username' });
      selfUsername = (me?.username || '').toLowerCase() || null;
    } catch { /* fall through */ }
    if (!selfUsername) {
      try {
        const { data: row } = await supabase
          .from('profiles')
          .select('instagram_username')
          .eq('instagram_business_account_id', igId)
          .maybeSingle();
        selfUsername = (row?.instagram_username || '').toLowerCase() || null;
      } catch { /* fall through */ }
    }
    if (!selfUsername) {
      console.warn('[IG-Comments] No self username — aborting auto_reply_all to prevent loop replies');
      return NextResponse.json({
        ok: false,
        replied: 0,
        error: 'Self username unavailable — refusing to auto-reply to prevent duplicate / loop replies.',
      });
    }

    for (const post of media.data || []) {
      try {
        // Pull 'replied_to' so we can identify replies to other
        // comments (vs top-level). 'from' would be cleaner but
        // requires extra perms — username already serves the dedup.
        const comments = await graphGET<{ data: Array<{ id: string; text: string; username: string; replied_to?: any }> }>(
          `/${post.id}/comments`, token, { fields: 'id,text,username,replied_to' }
        );

        const allComments = comments.data || [];

        // Pre-compute the set of comment_ids that Jade has already
        // replied to, by walking the SAME list (our replies appear as
        // separate comments with replied_to.id pointing at the parent
        // AND username === selfUsername). This is more reliable than
        // a per-comment /replies fetch which sometimes misses freshly
        // posted replies due to Graph API eventual consistency.
        const repliedByUsParentIds = new Set<string>();
        for (const reply of allComments) {
          const parentId = reply?.replied_to?.id;
          const username = (reply?.username || '').toLowerCase();
          if (parentId && username === selfUsername) {
            repliedByUsParentIds.add(parentId);
          }
        }

        // Backfill agent_logs with rows for every comment we've
        // already replied to but that pre-date the constraint fix.
        // Fire-and-forget — duplicate inserts get caught by the
        // UNIQUE INDEX. This primes the dedup table so the GUARD 3
        // read-check works on the next pass too.
        for (const parentId of repliedByUsParentIds) {
          try {
            await supabase.from('agent_logs').insert({
              agent: 'instagram_comments',
              action: 'reply_sent',
              status: 'success',
              data: { comment_id: parentId, reply: '(prior reply detected via comment-list walk)', backfilled: true },
              created_at: now,
              ...(dossierUserId ? { user_id: dossierUserId } : {}),
            });
          } catch { /* duplicate is fine */ }
        }

        for (const c of allComments) {
          // GUARD 1 — never reply to ourselves. Our own replies appear
          // in this list and would re-trigger the agent infinitely.
          if ((c.username || '').toLowerCase() === selfUsername) continue;

          // GUARD 2 — never reply to a comment that is itself a REPLY
          // to another comment. Jade only addresses top-level
          // commenters. Without this, an extended thread keeps
          // generating new reply IDs forever.
          if (c.replied_to) continue;

          // GUARD 3a — in-memory comment-list dedup. If a sibling
          // comment in the same post has replied_to.id === c.id AND
          // username === self, we already replied. This is the
          // strongest guard because the data comes from the SAME
          // fetch as the parent comment (no eventual-consistency
          // window with a separate /replies endpoint).
          if (repliedByUsParentIds.has(c.id)) continue;

          // GUARD 3b — agent_logs read-side dedup. Backed by the
          // UNIQUE INDEX so even if a race slips past 3a, GUARD 5
          // will reject the duplicate insert atomically.
          const { data: existing } = await supabase
            .from('agent_logs')
            .select('id')
            .eq('agent', 'instagram_comments')
            .filter('data->>comment_id', 'eq', c.id)
            .limit(1)
            .maybeSingle();

          if (existing) continue;

          // GUARD 5 — ATOMIC LOCK. We reserve the comment_id by
          // inserting the agent_logs row BEFORE calling the Graph
          // API. A UNIQUE INDEX on (agent, data->>'comment_id')
          // ensures only one process can win this race. If another
          // run beat us, the insert throws unique_violation and we
          // skip cleanly. Founder reported 2026-05-24 that GUARD 3
          // was silently empty for weeks because the agent_logs
          // CHECK constraint rejected 'instagram_comments' — this
          // path now also relies on the constraint being fixed.
          const { error: lockErr } = await supabase.from('agent_logs').insert({
            agent: 'instagram_comments',
            action: 'reply_sent',
            status: 'pending',
            data: { comment_id: c.id, username: c.username, comment: c.text.substring(0, 100), reserving: true },
            created_at: now,
            ...(dossierUserId ? { user_id: dossierUserId } : {}),
          });
          if (lockErr) {
            // Unique violation = another run already replied; any
            // other error = log and skip to keep going.
            if (!String(lockErr.message).includes('duplicate')) {
              console.warn('[IG-Comments] reservation insert failed:', lockErr.message);
            }
            continue;
          }

          // Skip spam
          if (c.text.length < 3 || /follow|dm me|check|click/i.test(c.text)) continue;

          // Pull a quick profile snapshot of the commenter so the
          // reply can use their first name / niche / aspiration. Same
          // mechanism Jade uses for inbound DMs. Best-effort — falls
          // through silently if business_discovery rejects.
          let commenterPersonalisation = '';
          try {
            // igId + token are the IG business account + page token
            // declared at the top of this handler (lines 76-80).
            if (igId && token) {
              const { getInstagramProfileSnapshot, readProfileFromVisuals } = await import('@/lib/agents/ig-profile-snapshot');
              const snap = await getInstagramProfileSnapshot(c.username, igId, token);
              if (snap.exists) {
                const vision = await readProfileFromVisuals(snap).catch(() => null);
                const p = vision?.personalization || {};
                const bits: string[] = [];
                if (p.first_name) bits.push(`Prénom: ${p.first_name}`);
                if (p.role_title) bits.push(`Métier: ${p.role_title}`);
                if (p.niche) bits.push(`Niche: ${p.niche}`);
                if (p.location) bits.push(`Ville: ${p.location}`);
                if (snap.biography) bits.push(`Bio: "${snap.biography.substring(0, 200)}"`);
                if (bits.length) {
                  commenterPersonalisation = `\n\nProfil du commentateur (utilise ces infos pour personnaliser sans stalker) :\n${bits.join('\n')}`;
                }
              }
            }
          } catch { /* best-effort */ }

          // Generate reply — mirror the commenter's language. The
          // prompt now embeds the founder-validated 'crée du lien'
          // strategy (2026-05-23): one reply in 5-10 may propose a
          // shared future activity between clients with the same
          // passion. Builds community, not pitch.
          const { languagePromptDirective } = await import('@/lib/agents/language-detect');
          const langHint = languagePromptDirective(c.text);
          // Random ~12% chance to suggest a shared activity hook.
          // Avoids over-using the pattern (would feel scripted).
          const shouldSuggestShared = Math.random() < 0.12;

          // Emoji rotation guard — pull the last 8 emojis we used in
          // replies and forbid them this round. Founder 2026-05-24:
          // "j'ai dis pas tout le temps le meme emoji meme parfois pas
          // d'emoji on veut rester naturel au possible". Default mode
          // is NO emoji — only allow if it adds clear value.
          const recentEmojis = new Set<string>();
          try {
            const { data: recentReplies } = await supabase
              .from('agent_logs')
              .select('data')
              .eq('agent', 'instagram_comments')
              .eq('action', 'reply_sent')
              .eq('status', 'success')
              .order('created_at', { ascending: false })
              .limit(8);
            const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
            for (const r of recentReplies || []) {
              const txt = String(r.data?.reply || '');
              const found = txt.match(EMOJI_RE) || [];
              for (const e of found) recentEmojis.add(e);
            }
          } catch { /* best-effort */ }
          // Encourage no emoji ~65% of the time
          const allowEmoji = Math.random() < 0.35;
          const forbiddenEmojiList = Array.from(recentEmojis).join(' ');

          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            messages: [{
              role: 'user',
              content: `${langHint}

Tu gères les commentaires Instagram d'un commerce. Réponds comme le propriétaire — pas comme un community manager.

QUALITY BAR :
- Max 2 phrases courtes. Conversationnel, JAMAIS du "Merci pour votre commentaire".
- INTERDIT : "n'hésitez pas", "cordialement", "nous vous remercions", "DM-moi pour plus d'infos" (Meta tag ça comme spam).
- INTERDIT : "IA", "intelligence artificielle", "automatisé".
- ZÉRO hashtag, ZÉRO lien.
- Si le commentaire est juste "top" ou un emoji → réponse chaleureuse 1 ligne, jamais de pitch.
- Si c'est une vraie question → réponds directement, ne renvoie pas en DM.
- Si tu connais le prénom du commentateur, utilise-le naturellement.

RÈGLE EMOJI (importante, le founder a explicitement insisté 2026-05-24) :
${allowEmoji
  ? `- UN SEUL emoji max, SEULEMENT s'il apporte vraiment quelque chose. La plupart des réponses naturelles n'en ont pas. PRÉFÈRE ne PAS en mettre.\n${forbiddenEmojiList ? `- INTERDIT cette fois (déjà sur-utilisés ces derniers temps) : ${forbiddenEmojiList}` : ''}`
  : `- ZÉRO emoji cette fois. Réponse 100% texte. C'est plus naturel et ça évite la répétition.`}

STRATÉGIE "LIEN COMMUNAUTAIRE" (validée par le founder le 2026-05-23) :
${shouldSuggestShared
  ? `- ACTIVE: pour CE commentaire, propose subtilement une activité partagée future entre clients qui partagent cette passion. Ne le force pas si le commentaire n'a pas de passion identifiable.`
  : `- Réagis avec chaleur et spécificité, sans proposer d'activité partagée cette fois.`}
${brandContext}
${commenterPersonalisation}
Commentaire de @${c.username}: "${c.text}"
Réponds UNIQUEMENT avec le texte de la réponse.`,
            }],
          });

          let reply = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
          if (!reply) {
            // Release the reservation so a later run can retry this comment
            await supabase.from('agent_logs').delete()
              .eq('agent', 'instagram_comments')
              .eq('status', 'pending')
              .filter('data->>comment_id', 'eq', c.id);
            continue;
          }
          // Belt-and-braces: strip emojis client-side if the model
          // ignored our "no emoji" instruction this round.
          if (!allowEmoji) {
            reply = reply.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
          }

          try {
            await graphPOST(`/${c.id}/replies`, token, { message: reply });
            replied++;

            // Finalise the reservation row created at GUARD 5 by
            // promoting it from 'pending' to 'success' and storing
            // the actual reply text. The UNIQUE INDEX still protects
            // future runs from inserting a duplicate.
            await supabase.from('agent_logs').update({
              status: 'success',
              data: { comment_id: c.id, username: c.username, comment: c.text.substring(0, 100), reply: reply.substring(0, 200), auto: true },
            })
            .eq('agent', 'instagram_comments')
            .eq('status', 'pending')
            .filter('data->>comment_id', 'eq', c.id);

            // CRM touch — if this commenter exists in our prospect base
            // (by IG handle), record the touch so the fiche reflects the
            // social interaction. Founder ask 2026-05-17: "veille à ce que
            // les agents alimentent la fiche client à chaque touchpoint".
            try {
              const handle = (c.username || '').toLowerCase().replace(/^@/, '');
              if (handle && dossierUserId) {
                const { data: prospect } = await supabase
                  .from('crm_prospects')
                  .select('id, status, temperature')
                  .eq('user_id', dossierUserId)
                  .ilike('instagram', handle)
                  .limit(1)
                  .maybeSingle();
                if (prospect) {
                  // Bump temperature one notch on engagement (cold → warm → hot)
                  const tempBump: Record<string, string> = { cold: 'warm', warm: 'hot' };
                  const nextTemp = tempBump[prospect.temperature || 'cold'] || prospect.temperature;
                  await supabase.from('crm_prospects').update({
                    last_contacted_at: now,
                    last_contact_channel: 'instagram_comment',
                    ...(nextTemp ? { temperature: nextTemp } : {}),
                    updated_at: now,
                  }).eq('id', prospect.id);
                  await supabase.from('crm_activities').insert({
                    prospect_id: prospect.id,
                    type: 'comment_replied',
                    description: `Jade a répondu au commentaire de @${handle}`,
                    data: { channel: 'instagram', comment_id: c.id, reply: reply.substring(0, 200) },
                    created_at: now,
                  });
                }
              }
            } catch { /* CRM enrichment is best-effort */ }
          } catch (graphErr: any) {
            // Graph POST failed (rate limit, token expired, comment
            // deleted, etc). Release the reservation so a later run
            // can retry. Without this we'd permanently block the
            // comment from ever getting a reply.
            console.warn('[IG-Comments] Graph reply failed, releasing reservation:', graphErr?.message);
            await supabase.from('agent_logs').delete()
              .eq('agent', 'instagram_comments')
              .eq('status', 'pending')
              .filter('data->>comment_id', 'eq', c.id);
          }

          // Rate limit
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, replied });
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
}
