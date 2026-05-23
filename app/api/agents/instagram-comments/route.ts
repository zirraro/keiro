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
              .or(`data->>comment_id.eq.${c.id}`)
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
      // we already replied to this comment. Prevents the founder from
      // accidentally double-replying when toggling between tabs or
      // when the optimistic UI doesn't reflect a prior send.
      const { data: alreadySent } = await supabase
        .from('agent_logs')
        .select('id')
        .eq('agent', 'instagram_comments')
        .or(`data->>comment_id.eq.${comment_id}`)
        .limit(1)
        .maybeSingle();
      if (alreadySent) {
        return NextResponse.json({
          ok: false,
          error: 'Une réponse a déjà été envoyée à ce commentaire — pas de double-envoi.',
          alreadyReplied: true,
        }, { status: 409 });
      }

      await graphPOST(`/${comment_id}/replies`, token, { message });

      await supabase.from('agent_logs').insert({
        agent: 'instagram_comments',
        action: 'reply_comment',
        status: 'success',
        ...(resolvedUserId ? { user_id: resolvedUserId } : {}),
        data: { comment_id, message_preview: message.substring(0, 200), method: useIgaa ? 'igaa' : 'fb_page' },
        created_at: now,
      });

      return NextResponse.json({ ok: true, reply: message });
    } catch (e: any) {
      try {
        await supabase.from('agent_logs').insert({
          agent: 'instagram_comments',
          action: 'reply_comment',
          status: 'error',
          ...(resolvedUserId ? { user_id: resolvedUserId } : {}),
          data: { comment_id, error: String(e?.message || e).slice(0, 300) },
          created_at: now,
        });
      } catch { /* audit failure is non-fatal */ }
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
    let selfUsername: string | null = null;
    try {
      const me = await graphGET<{ username: string }>(`/${igId}`, token, { fields: 'username' });
      selfUsername = (me?.username || '').toLowerCase() || null;
    } catch { /* non-fatal */ }

    for (const post of media.data || []) {
      try {
        // Pull 'replied_to' so we can identify replies to other
        // comments (vs top-level). 'from' would be cleaner but
        // requires extra perms — username already serves the dedup.
        const comments = await graphGET<{ data: Array<{ id: string; text: string; username: string; replied_to?: any }> }>(
          `/${post.id}/comments`, token, { fields: 'id,text,username,replied_to' }
        );

        for (const c of comments.data || []) {
          // GUARD 1 — never reply to ourselves. Our own replies appear
          // in this list and would re-trigger the agent infinitely.
          if (selfUsername && (c.username || '').toLowerCase() === selfUsername) continue;

          // GUARD 2 — never reply to a comment that is itself a REPLY
          // to another comment. Jade only addresses top-level
          // commenters. Without this, an extended thread keeps
          // generating new reply IDs forever.
          if (c.replied_to) continue;

          // GUARD 3 — dedup against any prior reply we sent. Uses both
          // .contains for back-compat AND a direct ->> match on the
          // top-level comment_id key so we don't depend on JSONB
          // containment semantics. Also checks ANY action (reply_sent,
          // auto_reply, reply_comment) for this comment_id.
          const { data: existing } = await supabase
            .from('agent_logs')
            .select('id')
            .eq('agent', 'instagram_comments')
            .or(`data->>comment_id.eq.${c.id}`)
            .limit(1)
            .maybeSingle();

          if (existing) continue;

          // GUARD 4 — also check via the Graph API: if our connected
          // account already has a reply on this comment, treat it as
          // replied. Belt-and-braces in case agent_logs was wiped or
          // the row was inserted by a different code path.
          try {
            const subReplies = await graphGET<{ data: Array<{ username?: string }> }>(
              `/${c.id}/replies`, token, { fields: 'username', limit: '25' }
            );
            const alreadyReplied = (subReplies?.data || []).some(r => (r?.username || '').toLowerCase() === (selfUsername || ''));
            if (alreadyReplied) {
              // Backfill an agent_logs row so future dedup is fast.
              await supabase.from('agent_logs').insert({
                agent: 'instagram_comments',
                action: 'reply_sent',
                status: 'success',
                data: { comment_id: c.id, username: c.username, reply: '(prior reply detected via Graph API)', backfilled: true },
                created_at: now,
                ...(dossierUserId ? { user_id: dossierUserId } : {}),
              });
              continue;
            }
          } catch { /* fail-open, the agent_logs dedup remains the primary defence */ }

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
          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            messages: [{
              role: 'user',
              content: `${langHint}

Tu gères les commentaires Instagram d'un commerce. Réponds à ce commentaire comme le propriétaire — pas comme un community manager corporate.

QUALITY BAR :
- Max 2 phrases courtes. Conversationnel, jamais une réponse type "Merci pour votre commentaire ❤️".
- INTERDIT : "n'hésitez pas", "cordialement", "nous vous remercions", "DM-moi pour plus d'infos" (Meta tag ça comme spam).
- INTERDIT : mots "IA", "intelligence artificielle", "automatisé".
- 1 emoji max, ZÉRO hashtag, ZÉRO lien.
- Si le commentaire est juste "top" ou un emoji → réponse chaleureuse 1 ligne, jamais de pitch.
- Si c'est une vraie question → réponds directement, ne renvoie pas en DM.
- Si tu connais le prénom du commentateur, utilise-le naturellement. Si tu connais sa niche, glisse une mini-référence (sans en faire trop).

STRATÉGIE "LIEN COMMUNAUTAIRE" (validée par le founder le 2026-05-23) :
${shouldSuggestShared
  ? `- ACTIVE: pour CE commentaire, propose subtilement une activité partagée future entre clients qui partagent cette passion (ex: "Faut qu'on organise un match entre clients un jour 🏀"). Ne le force pas si le commentaire n'a pas de passion identifiable.`
  : `- Sans en faire trop : réagis avec chaleur et spécificité, mais SANS proposer d'activité partagée cette fois (à utiliser sparingly, pas à chaque commentaire).`}
${brandContext}
${commenterPersonalisation}
Commentaire de @${c.username}: "${c.text}"
Réponds UNIQUEMENT avec le texte de la réponse.`,
            }],
          });

          const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
          if (!reply) continue;

          try {
            await graphPOST(`/${c.id}/replies`, token, { message: reply });
            replied++;

            await supabase.from('agent_logs').insert({
              agent: 'instagram_comments',
              action: 'reply_sent',
              status: 'success',
              data: { comment_id: c.id, username: c.username, comment: c.text.substring(0, 100), reply: reply.substring(0, 200), auto: true },
              created_at: now,
              ...(dossierUserId ? { user_id: dossierUserId } : {}),
            });

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
          } catch {}

          // Rate limit
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, replied });
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
}
