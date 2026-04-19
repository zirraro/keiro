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
    // Fetch recent media + their comments
    try {
      const mediaPath = useIgaa ? '/me/media' : `/${igId}/media`;
      const media = await fetchGraph<{ data: Array<{ id: string; caption?: string; timestamp: string }> }>(
        mediaPath, { fields: 'id,caption,timestamp', limit: 10 }
      );

      const allComments: Array<{ media_id: string; comment_id: string; text: string; username: string; timestamp: string; replied: boolean }> = [];

      for (const post of media.data || []) {
        try {
          const comments = await fetchGraph<{ data: Array<{ id: string; text: string; username: string; timestamp: string }> }>(
            `/${post.id}/comments`, { fields: 'id,text,username,timestamp' }
          );

          for (const c of comments.data || []) {
            // Check if already replied
            const { data: existing } = await supabase
              .from('agent_logs')
              .select('id')
              .eq('agent', 'instagram_comments')
              .eq('action', 'reply_sent')
              .contains('data', { comment_id: c.id })
              .limit(1)
              .maybeSingle();

            allComments.push({
              media_id: post.id,
              comment_id: c.id,
              text: c.text,
              username: c.username,
              timestamp: c.timestamp,
              replied: !!existing,
            });
          }
        } catch {}
      }

      return NextResponse.json({ ok: true, comments: allComments, total: allComments.length });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'reply_comment') {
    // Reply to a specific comment
    const { comment_id, message } = body;
    if (!comment_id || !message) return NextResponse.json({ error: 'comment_id et message requis' }, { status: 400 });

    try {
      await graphPOST(`/${comment_id}/replies`, token, { message });

      await supabase.from('agent_logs').insert({
        agent: 'instagram_comments',
        action: 'reply_sent',
        status: 'success',
        data: { comment_id, message: message.substring(0, 200) },
        created_at: now,
      });

      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'auto_reply_all') {
    // Auto-reply to unreplied comments using AI
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 });

    // Load dossier for context
    const { data: dossier } = await supabase
      .from('business_dossiers')
      .select('company_name, business_type, brand_tone, main_products')
      .eq('user_id', (await supabase.from('profiles').select('id').eq('is_admin', true).single()).data?.id)
      .single();

    const brandContext = dossier
      ? `Commerce: ${dossier.company_name || ''}. Type: ${dossier.business_type || ''}. Ton: ${dossier.brand_tone || 'chaleureux'}. Produits: ${dossier.main_products || ''}.`
      : '';

    // Fetch unreplied comments
    const media = await graphGET<{ data: Array<{ id: string }> }>(
      `/${igId}/media`, token, { fields: 'id', limit: '5' }
    );

    let replied = 0;
    const anthropic = new Anthropic({ apiKey });

    for (const post of media.data || []) {
      try {
        const comments = await graphGET<{ data: Array<{ id: string; text: string; username: string }> }>(
          `/${post.id}/comments`, token, { fields: 'id,text,username' }
        );

        for (const c of comments.data || []) {
          // Skip if already replied
          const { data: existing } = await supabase
            .from('agent_logs')
            .select('id')
            .eq('agent', 'instagram_comments')
            .contains('data', { comment_id: c.id })
            .limit(1)
            .maybeSingle();

          if (existing) continue;

          // Skip spam
          if (c.text.length < 3 || /follow|dm me|check|click/i.test(c.text)) continue;

          // Generate reply
          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            messages: [{
              role: 'user',
              content: `Tu geres les commentaires Instagram d'un commerce. Reponds a ce commentaire de maniere naturelle, chaleureuse et engageante. Max 2 phrases.
${brandContext}
Commentaire de @${c.username}: "${c.text}"
Reponds UNIQUEMENT avec le texte de la reponse.`,
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
            });
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
