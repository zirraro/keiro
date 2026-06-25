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

// Quality model for client-facing comment replies. Haiku produced generic,
// templated replies the founder rejected ("pas terrible du tout") — Sonnet
// gives the warmth, specificity and brand voice the quality bar demands.
const COMMENT_REPLY_MODEL = 'claude-sonnet-4-6';

/**
 * Shared, high-quality system prompt for Jade's Instagram comment replies —
 * used by BOTH the suggest/manual path and the auto-reply path so the voice is
 * consistent. The good/bad few-shot is what lifts the model off generic
 * templates and onto a real owner's voice.
 */
function buildCommentReplySystem(opts: {
  targetLang: string;
  brandContext?: string;
  postContext?: string;
  commenterInfo?: string;
  allowEmoji: boolean;
  forbiddenEmojis?: string;
  shouldSuggestShared?: boolean;
  directives?: string;
}): string {
  const { targetLang, brandContext, postContext, commenterInfo, allowEmoji, forbiddenEmojis, shouldSuggestShared, directives } = opts;
  const isFr = targetLang === 'French';
  return `You ARE the owner of this business replying to a comment on your own Instagram post. Not a community manager, not a brand account — the actual person behind the shop, with real warmth and a little personality.${directives || ''}

LANGUAGE LOCK (non-negotiable): The comment is in ${targetLang}. Write your ENTIRE reply in ${targetLang}. Not a single word in another language — not even the greeting or a "thanks".

QUALITY BAR — this is the whole point, hit it every time:
- 1–2 short sentences. Spontaneous and human, NEVER a template.
- Be SPECIFIC to THIS comment and THIS post: name the exact product / dish / detail they reacted to. Generic praise back ("merci beaucoup !", "ça nous fait plaisir") is forbidden — it reads like a bot.
- Add something real: a genuine reaction, a small insider detail, or a light open question that invites them to keep talking.
- Match the commenter's exact energy, register and language.
- If it's a real question, answer it CONCRETELY from the business info below. Never deflect.
- If it's just an emoji or one word ("top", "🔥"), reply with a warm, specific one-liner still tied to the post — never a pitch.

SUBTLE CONVERSION (the goal IS to convert — but lightly):
- Quietly put the business and what makes it great forward. Make the reader a little more curious / more sold WITHOUT it reading like an ad.
- A light, natural CTA is welcome ABOUT ONCE every few replies — and only when it fits: "${isFr ? 'passe tester' : 'come try it'}", "${isFr ? 'viens voir' : 'come see'}", "${isFr ? 'le lien est en bio' : 'link in bio'}", a gentle invitation. Vary it; never the same line twice.
- Tone dial: warm human FIRST, soft nudge SECOND. Most of the reply is genuine connection; the promotion is a light touch at the end, not the whole message.
- If they ask to buy/sign up, answer plainly and helpfully — that's a hot lead, guide them.

HARD BANS (instant fail):
- "${isFr ? 'merci pour votre commentaire' : 'thanks for your comment'}", "${isFr ? "n'hésitez pas" : 'feel free to'}", "${isFr ? 'cordialement' : 'best regards'}", "${isFr ? 'nous vous remercions' : 'we thank you'}".
- DM deflection as an answer-dodge: "${isFr ? 'on te répond en DM' : 'we will DM you'}", "${isFr ? 'DM-moi pour plus d\'infos' : 'DM me for more info'}". If they asked a question, ANSWER it here — then you may add a light invite.
- Desperate / pushy selling: no "${isFr ? 'on peut démarrer dès cette semaine' : 'we can start this week'}", no price-dropping, no repeated CTAs, no begging. One soft touch max.
- No hashtags, no links in the text body (the bio link can be referenced in words).
- Never the words "IA", "AI", "intelligence artificielle", "automatisé", "chatbot".

${allowEmoji
  ? `EMOJI: at most ONE, and only if it genuinely adds warmth. Most natural replies have none — prefer zero.${forbiddenEmojis ? ` Do NOT use these (over-used lately): ${forbiddenEmojis}` : ''}`
  : `EMOJI: none this time. Plain text only — it reads more natural and avoids repetition.`}

${shouldSuggestShared ? `COMMUNITY HOOK (do it this time, subtly): if the comment reveals a clear passion, lightly hint at a shared future moment around it — invitation feel, never a pitch.\n` : ''}GOOD vs BAD (illustrative — ice-cream shop post, French):
  Comment: "Super bon ! Vous l'avez au melon ?"
  ❌ "Merci beaucoup, ça nous fait super plaisir 🙏"  (generic, ignores the question, zero pull)
  ❌ "Bonne question ! On te répond en DM 👌"  (DM dodge = spam flag)
  ❌ "Pas encore ! Mais viens vite, profite de -20%, on peut te réserver un pot dès cette semaine !!"  (desperate/pushy = fail)
  ✅ "Pas encore le melon, mais la pastèque maison cartonne en ce moment — passe la tester ce week-end, tu m'en diras des nouvelles 😏"  (answers + warm + ONE light invite)
${brandContext ? `\nYOUR BUSINESS: ${brandContext}` : ''}${postContext ? `\nTHE POST they commented on: ${postContext}` : ''}${commenterInfo || ''}

Output ONLY the reply text in ${targetLang}. Nothing else — no quotes, no preamble.`;
}

/**
 * Generate a single high-quality comment reply with full context (post caption,
 * brand dossier, commenter snapshot). Shared by the suggest path and the manual
 * single-reply path. Returns the reply text, or null if generation failed.
 */
async function generateCommentReply(args: {
  supabase: any;
  anthropic: Anthropic;
  comment_id: string;
  token: string;
  igId?: string;
  targetUserId?: string | null;
  fetchCommenter?: boolean;
}): Promise<string | null> {
  const { supabase, anthropic, comment_id, token, igId, targetUserId, fetchCommenter } = args;

  // 1. Comment text + the caption of the post it was made on (one call).
  let commentText = '';
  let commenterUsername = '';
  let postCaption = '';
  try {
    const cmt = await graphGET<{ text?: string; username?: string; media?: { caption?: string } }>(
      `/${comment_id}`, token, { fields: 'text,username,media{caption}' }
    );
    commentText = cmt?.text || '';
    commenterUsername = cmt?.username || '';
    postCaption = cmt?.media?.caption || '';
  } catch { /* fall back to language-blind reply */ }

  // 2. Language of the comment.
  const { detectLanguage } = await import('@/lib/agents/language-detect');
  const lang = detectLanguage(commentText);
  const LANG_LABEL: Record<string, string> = { fr: 'French', en: 'English', es: 'Spanish', de: 'German', unknown: 'French' };
  const targetLang = LANG_LABEL[lang] || 'French';

  // 3. Brand dossier so the reply is on-brand and can answer questions.
  let brandContext = '';
  if (targetUserId) {
    try {
      const { data: dossier } = await supabase
        .from('business_dossiers')
        .select('company_name, business_type, brand_tone, main_products')
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (dossier) {
        brandContext = [
          dossier.company_name && `"${dossier.company_name}"`,
          dossier.business_type,
          dossier.main_products && `offers: ${dossier.main_products}`,
          dossier.brand_tone && `tone: ${dossier.brand_tone}`,
        ].filter(Boolean).join(' — ');
      }
    } catch { /* best-effort */ }
  }

  // 4. Owner's typed directives for this agent (tone / blacklist).
  let directives = '';
  try {
    const { directiveBlockFor } = await import('@/lib/agents/typed-directives');
    directives = await directiveBlockFor(supabase, targetUserId || null, 'instagram_comments');
  } catch { /* best-effort */ }

  // 5. Commenter snapshot (optional — adds first-name / niche personalisation).
  let commenterInfo = '';
  if (fetchCommenter && commenterUsername && igId) {
    try {
      const { getInstagramProfileSnapshot, readProfileFromVisuals } = await import('@/lib/agents/ig-profile-snapshot');
      const snap = await getInstagramProfileSnapshot(commenterUsername, igId, token);
      if (snap.exists) {
        const vision = await readProfileFromVisuals(snap).catch(() => null);
        const p = vision?.personalization || {};
        const bits: string[] = [];
        if (p.first_name) bits.push(`first name ${p.first_name}`);
        if (p.niche) bits.push(`niche ${p.niche}`);
        if (snap.biography) bits.push(`bio "${String(snap.biography).slice(0, 150)}"`);
        if (bits.length) commenterInfo = `\nABOUT @${commenterUsername} (use to personalise naturally, never creepy): ${bits.join(', ')}`;
      }
    } catch { /* best-effort */ }
  }

  // 6. Emoji rotation — default to none, forbid recently over-used ones.
  const allowEmoji = Math.random() < 0.35;
  let forbiddenEmojis = '';
  try {
    const { data: recent } = await supabase
      .from('agent_logs')
      .select('data')
      .eq('agent', 'instagram_comments')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(8);
    const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
    const set = new Set<string>();
    for (const r of recent || []) {
      const m = String(r.data?.reply || r.data?.message_preview || '').match(EMOJI_RE) || [];
      for (const e of m) set.add(e);
    }
    forbiddenEmojis = Array.from(set).join(' ');
  } catch { /* best-effort */ }

  const shouldSuggestShared = Math.random() < 0.12;

  const system = buildCommentReplySystem({
    targetLang,
    brandContext,
    postContext: postCaption ? `"${postCaption.slice(0, 240)}"` : '',
    commenterInfo,
    allowEmoji,
    forbiddenEmojis,
    shouldSuggestShared,
    directives,
  });

  try {
    const r = await anthropic.messages.create({
      model: COMMENT_REPLY_MODEL,
      max_tokens: 200,
      system,
      messages: [{
        role: 'user',
        content: commentText
          ? `Comment from @${commenterUsername || 'user'}: "${commentText}"\n\nWrite your reply now.`
          : `Reply to comment id ${comment_id}. Write your reply now.`,
      }],
    });
    let reply = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    reply = reply.replace(/^["'«»\s]+|["'«»\s]+$/g, '').trim();
    if (!allowEmoji && reply) {
      reply = reply.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
    }
    return reply || null;
  } catch {
    return null;
  }
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
      // Page through recent media to find posts with comments. Capped at 2
      // pages (100 posts) — each page is a SEQUENTIAL Graph call (cursor
      // pagination can't be parallelised), so 4 pages cost ~2s of pure
      // listing latency before we even read a comment. Comments on active
      // accounts sit on recent posts; 100 is plenty. We also EARLY-EXIT as
      // soon as we've found posts with comments after the first page.
      type Media = { id: string; caption?: string; timestamp: string; media_url?: string; thumbnail_url?: string; permalink?: string; media_type?: string; comments_count?: number };
      const collected: Media[] = [];
      let after: string | undefined;
      for (let page = 0; page < 2; page++) {
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
        // Early exit: if the posts seen so far already include some with
        // comments, no need to keep paging deeper.
        if (collected.some(p => (p.comments_count || 0) > 0)) break;
        if (!after || (batch?.data || []).length < 50) break;
      }

      // Keep only posts that actually have comments — skip the empty
      // ones entirely to avoid useless API calls.
      const postsWithComments = collected.filter(p => (p.comments_count || 0) > 0);

      // Same self-username probe used by auto_reply_all — needed here
      // so the UI list doesn't surface Jade's own replies as 'pending
      // comments to reply to'.
      let selfUsernameFetch: string | null = null;
      try {
        const me = await fetchGraph<{ username: string }>(`/${igId}`, { fields: 'username' });
        selfUsernameFetch = (me?.username || '').toLowerCase() || null;
      } catch { /* non-fatal */ }

      // Fetch every post's comments IN PARALLEL (was sequential — the main
      // source of the slow tab load when several posts have comments).
      const perPost = await Promise.all(postsWithComments.map(async (post) => {
        try {
          // Resolve the commenter handle from BOTH `username` (root) and
          // `from{username}`. On Instagram Login the root `username` is often
          // empty for third-party commenters while `from.username` is set.
          const comments = await fetchGraph<{ data: Array<{ id: string; text: string; username?: string; timestamp: string; replied_to?: any; from?: { id?: string; username?: string } }> }>(
            `/${post.id}/comments`, { fields: 'id,text,username,timestamp,replied_to,from{id,username}' }
          );
          const postCtx = {
            caption: (post.caption || '').slice(0, 240),
            thumbnail_url: post.thumbnail_url || post.media_url || null,
            permalink: post.permalink || null,
            media_type: post.media_type || null,
            posted_at: post.timestamp || '',
          };
          return (comments.data || [])
            .filter((c) => {
              const u = (c.username || c.from?.username || '').toLowerCase();
              if (selfUsernameFetch && u === selfUsernameFetch) return false; // hide our own replies
              if (c.replied_to) return false;                                  // hide replies-to-replies
              return true;
            })
            .map((c) => ({
              media_id: post.id,
              comment_id: c.id,
              text: c.text,
              username: c.username || c.from?.username || '',
              timestamp: c.timestamp,
              post: postCtx,
            }));
        } catch { return []; }
      }));
      const flat = perPost.flat();

      // ONE batched lookup of our replies for these comments (was an N+1
      // query — one DB round-trip per comment). Gives us replied state, the
      // reply TEXT (shown under the comment) and the reply DATE (date filter).
      const repliedMap = new Map<string, { reply: string; replied_at: string }>();
      const ids = flat.map((c) => c.comment_id).filter(Boolean);
      if (ids.length) {
        const { data: logs } = await supabase
          .from('agent_logs')
          .select('data, created_at')
          .eq('agent', 'instagram_comments')
          .filter('data->>comment_id', 'in', `(${ids.join(',')})`)
          .order('created_at', { ascending: false });
        for (const row of logs || []) {
          const cid = (row as any).data?.comment_id;
          if (cid && !repliedMap.has(cid)) {
            repliedMap.set(cid, {
              reply: (row as any).data?.reply || (row as any).data?.message_preview || '',
              replied_at: (row as any).created_at,
            });
          }
        }
      }

      const allComments = flat.map((c) => {
        const r = repliedMap.get(c.comment_id);
        return {
          ...c,
          replied: !!r,
          reply_text: r?.reply || null,
          replied_at: r?.replied_at || null,
        };
      });

      // Sort newest comment first so the UI shows the most recent on top.
      allComments.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

      return NextResponse.json({
        ok: true,
        comments: allComments,
        total: allComments.length,
        meta: { posts_scanned: collected.length, posts_with_comments: postsWithComments.length },
      }, {
        // Short private cache so re-opening the tab within 20s is instant
        // instead of re-hitting the Graph API every click.
        headers: { 'Cache-Control': 'private, max-age=20' },
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'suggest_reply') {
    // Generate a high-quality DRAFT reply WITHOUT posting it. Powers the
    // "Suggest" button — the owner reviews/edits, then sends via reply_comment.
    // (Previously the Suggest button inserted a hardcoded "On te répond en DM"
    //  string — a Meta spam-flag AND exactly the template the quality bar bans.)
    const { comment_id } = body;
    if (!comment_id) return NextResponse.json({ error: 'comment_id requis' }, { status: 400 });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });
    // Resolve whose brand dossier to use: explicit user_id, else the authed user.
    let suggestUid: string | null = targetUserId || null;
    if (!suggestUid && !isCron) {
      const { user } = await getAuthUser().catch(() => ({ user: null }));
      suggestUid = user?.id || null;
    }
    const reply = await generateCommentReply({
      supabase,
      anthropic: new Anthropic({ apiKey }),
      comment_id,
      token,
      igId,
      targetUserId: suggestUid,
      fetchCommenter: true,
    });
    if (!reply) return NextResponse.json({ ok: false, error: 'generation_failed' }, { status: 502 });
    return NextResponse.json({ ok: true, reply });
  }

  if (action === 'reply_comment') {
    // Reply to a specific comment. We accept either a body.message (sent
    // verbatim) or body.custom_reply (alias used by the new Comments UI).
    // If neither is provided we generate one with full context (post caption +
    // brand dossier + commenter snapshot) so the bulk-reply button is high
    // quality, not a generic template.
    const { comment_id, custom_reply } = body;
    let message = (body.message || custom_reply || '').trim();
    if (!comment_id) return NextResponse.json({ error: 'comment_id requis' }, { status: 400 });

    if (!message) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        // Resolve dossier owner: explicit user_id, else the authed user.
        let genUid: string | null = targetUserId || null;
        if (!genUid && !isCron) {
          const { user } = await getAuthUser().catch(() => ({ user: null }));
          genUid = user?.id || null;
        }
        const gen = await generateCommentReply({
          supabase,
          anthropic: new Anthropic({ apiKey }),
          comment_id,
          token,
          igId,
          targetUserId: genUid,
          fetchCommenter: true,
        });
        message = gen || 'Merci !';
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

      // CRM touch — cohérence avec auto_reply_all : toute réponse à un commentaire
      // alimente la fiche prospect si le commentateur est dans le CRM (founder :
      // "tous les agents alimentent la fiche à chaque touchpoint"). Best-effort,
      // utilise le username déjà connu du panneau (zéro appel Graph en plus).
      try {
        const handle = String(body.username || '').toLowerCase().replace(/^@/, '');
        const crmUid = resolvedUserId || targetUserId;
        if (handle && crmUid) {
          const { data: prospect } = await supabase
            .from('crm_prospects').select('id, temperature')
            .eq('user_id', crmUid).ilike('instagram', handle).limit(1).maybeSingle();
          if (prospect) {
            const tempBump: Record<string, string> = { cold: 'warm', warm: 'hot' };
            const nextTemp = tempBump[(prospect as any).temperature || 'cold'] || (prospect as any).temperature;
            await supabase.from('crm_prospects').update({
              last_contacted_at: now, last_contact_channel: 'instagram_comment',
              ...(nextTemp ? { temperature: nextTemp } : {}), updated_at: now,
            }).eq('id', (prospect as any).id);
            await supabase.from('crm_activities').insert({
              prospect_id: (prospect as any).id, type: 'comment_replied',
              description: `Jade a répondu au commentaire de @${handle}`,
              data: { channel: 'instagram', comment_id, reply: message.substring(0, 200) }, created_at: now,
            });
          }
        }
      } catch { /* CRM enrichment is best-effort */ }

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

    // Fetch unreplied comments. Pull the caption too so each reply can be
    // specific to the post it's under (quality bar — generic replies rejected).
    const media = await graphGET<{ data: Array<{ id: string; caption?: string }> }>(
      `/${igId}/media`, token, { fields: 'id,caption', limit: '5' }
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
          const { languagePromptDirective, detectLanguage } = await import('@/lib/agents/language-detect');
          const langHint = languagePromptDirective(c.text);
          const detectedLang = detectLanguage(c.text);
          // Build a hard language-enforcement directive used twice in
          // the prompt — once at the top and once just before the
          // response instruction. The mid-prompt French context was
          // overwhelming the model's language signal and replies came
          // back in French on English comments. Founder spotted this
          // 2026-05-24: "si les commentaires sont dans une autre
          // langue de bien repondre dans cette langue".
          const LANG_LABEL: Record<string, string> = {
            fr: 'French', en: 'English', es: 'Spanish', de: 'German', unknown: 'French',
          };
          const targetLang = LANG_LABEL[detectedLang] || 'French';
          const langLock = detectedLang !== 'fr' && detectedLang !== 'unknown'
            ? `\n\n⚠️ HARD LANGUAGE LOCK — The commenter wrote in ${targetLang}. YOUR ENTIRE REPLY MUST BE WRITTEN IN ${targetLang.toUpperCase()}. Not a single French word. Even the greeting, even "thanks", even one-word replies. ${targetLang.toUpperCase()} ONLY.\n`
            : '';
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

          // Typed directives (tone / blacklist) for this owner.
          let igDirectives = '';
          try {
            const { directiveBlockFor } = await import('@/lib/agents/typed-directives');
            igDirectives = await directiveBlockFor(supabase, dossierUserId || null, 'instagram_comments');
          } catch { /* best-effort */ }

          const response = await anthropic.messages.create({
            model: COMMENT_REPLY_MODEL,
            max_tokens: 200,
            system: buildCommentReplySystem({
              targetLang,
              brandContext,
              postContext: post.caption ? `"${String(post.caption).slice(0, 240)}"` : '',
              commenterInfo: commenterPersonalisation
                ? `\nABOUT @${c.username} (personalise naturally, never creepy): ${commenterPersonalisation.replace(/\n+/g, ' ').trim()}`
                : '',
              allowEmoji,
              forbiddenEmojis: forbiddenEmojiList,
              shouldSuggestShared,
              directives: igDirectives,
            }),
            messages: [{
              role: 'user',
              content: `${langHint}${langLock}\nComment from @${c.username}: "${c.text}"\n\nWrite your reply now.`,
            }],
          });

          let reply = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
          reply = reply.replace(/^["'«»\s]+|["'«»\s]+$/g, '').trim();
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
          // Language post-check: if the comment was English/Spanish/German
          // but the model still wrote French, regenerate ONCE with a
          // harder lock. Belt-and-braces against the model defaulting to
          // its strongest training prior.
          if (detectedLang !== 'fr' && detectedLang !== 'unknown') {
            const replyLang = detectLanguage(reply);
            if (replyLang === 'fr' || replyLang !== detectedLang) {
              console.warn(`[IG-Comments] Lang mismatch: expected ${detectedLang}, got ${replyLang}. Forcing regeneration.`);
              try {
                const retry = await anthropic.messages.create({
                  model: COMMENT_REPLY_MODEL,
                  max_tokens: 200,
                  system: `You write Instagram comment replies. Reply ONLY in ${targetLang}. The comment is in ${targetLang}, so YOUR REPLY must be in ${targetLang}. No French allowed. No mixed language. Casual, conversational tone — like a business owner, not a community manager. Max 2 short sentences. No hashtags, no links, no "DM me", no AI mention.`,
                  messages: [{
                    role: 'user',
                    content: `Comment from @${c.username}: "${c.text}"\n\nReply now, in ${targetLang} only. Plain text, nothing else.`
                  }],
                });
                const retryText = retry.content[0].type === 'text' ? retry.content[0].text.trim() : '';
                if (retryText) reply = retryText;
                if (!allowEmoji) {
                  reply = reply.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
                }
              } catch { /* keep original reply as fallback */ }
            }
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
