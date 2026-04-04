import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin as checkIsAdmin } from '@/lib/credits/server';
import { getAgentAvatar } from '@/lib/agents/avatar';
import { getClientPrompt } from '@/lib/agents/client-prompts';
import { formatDossierForPrompt, loadBusinessDossier } from '@/lib/agents/client-context';
import { enrichAgentContext } from '@/lib/agents/enrich-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const FREE_DAILY_MESSAGE_LIMIT = 10;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/agents/client-chat
 * Client-facing chat with an AI agent.
 * Body: { agent_id: string, message: string }
 * Response: { reply: string, agent_name: string }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Connexion requise', requires_auth: true },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdmin();

    // 2. Load user profile (plan, credits)
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_plan, credits_balance, full_name, business_type, business_description')
      .eq('id', user.id)
      .single();

    if (!profile) {
      // Don't block — create minimal profile and continue
      console.warn(`[ClientChat] Profile not found for ${user.id}, continuing without profile`);
    }

    // 3. Chat is FREE for everyone — agents are already gated by plan (blurred/locked)
    // If a user can access the agent page, they can use the chat
    const isAdminUser = await checkIsAdmin(user.id);

    // Parse body
    const body = await request.json().catch(() => ({}));
    const { agent_id, message } = body as { agent_id?: string; message?: string };

    if (!agent_id || !message) {
      return NextResponse.json(
        { ok: false, error: 'agent_id et message sont requis' },
        { status: 400 },
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { ok: false, error: 'Message trop long (max 2000 caracteres)' },
        { status: 400 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'API IA non configuree' },
        { status: 500 },
      );
    }

    // 4. Rate limit: free plan = 10 messages/day, paid = unlimited
    const plan = profile?.subscription_plan || 'free';
    if (plan === 'free' && !isAdminUser) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { count: todayMessageCount } = await supabase
        .from('client_agent_chats')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('updated_at', todayStart.toISOString());

      if ((todayMessageCount ?? 0) >= FREE_DAILY_MESSAGE_LIMIT) {
        return NextResponse.json(
          {
            ok: false,
            error: `Limite journaliere atteinte (${FREE_DAILY_MESSAGE_LIMIT} messages/jour en plan gratuit). Passez a un plan superieur pour un acces illimite.`,
            rateLimited: true,
          },
          { status: 429 },
        );
      }
    }

    // 5. Load business dossier for context
    let dossierContext = '';
    try {
      const dossier = await loadBusinessDossier(supabase, user.id);
      if (dossier) {
        dossierContext = formatDossierForPrompt(dossier);
      }
    } catch (e: any) {
      console.warn('[ClientChat] Failed to load dossier (non-fatal):', e?.message);
    }

    // 6. Load agent avatar info
    const avatar = await getAgentAvatar(supabase, agent_id);
    const agentName = avatar.display_name || agent_id;

    // 6b. Enrich context with sector knowledge + live API data
    let enrichedContext = '';
    try {
      const dossier = await loadBusinessDossier(supabase, user.id);
      const enrichment = await enrichAgentContext(
        agent_id,
        profile?.business_type || dossier?.business_type || null,
        dossier?.google_maps_url || null,
      );
      const enrichParts: string[] = [];
      if (enrichment.sectorContext) enrichParts.push(enrichment.sectorContext);
      if (enrichment.liveDataContext) enrichParts.push(enrichment.liveDataContext);
      if (enrichParts.length) enrichedContext = '\n\n=== DONNEES SECTORIELLES & LIVE ===\n' + enrichParts.join('\n\n');
    } catch (e: any) {
      console.warn('[ClientChat] Enrichment failed (non-fatal):', e?.message);
    }

    // 6.5 Detect URLs in message and scrape content
    let scrapedContext = '';
    const urlMatch = message.match(/https?:\/\/[^\s<>"']+/g);
    if (urlMatch && urlMatch.length > 0) {
      for (const url of urlMatch.slice(0, 2)) { // Max 2 URLs per message
        try {
          console.log(`[ClientChat] Scraping URL: ${url}`);
          const scrapeRes = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KeiroAI/1.0)' },
            signal: AbortSignal.timeout(8000),
          });
          if (scrapeRes.ok) {
            const html = await scrapeRes.text();
            // Extract text content from HTML (strip tags, scripts, styles)
            const text = html
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<nav[\s\S]*?<\/nav>/gi, '')
              .replace(/<footer[\s\S]*?<\/footer>/gi, '')
              .replace(/<header[\s\S]*?<\/header>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 5000);

            if (text.length > 50) {
              scrapedContext += `\n\n--- CONTENU DE ${url} ---\n${text}\n--- FIN ---\n`;
              console.log(`[ClientChat] Scraped ${text.length} chars from ${url}`);
            }
          }
        } catch (e: any) {
          console.warn(`[ClientChat] Scrape failed for ${url}:`, e.message?.substring(0, 100));
        }
      }
    }

    // 6c. Load RAG learnings for this agent (shared knowledge pool)
    let ragContext = '';
    try {
      const { getActiveLearnings, getAllHistoricalLearnings, formatLearningsForPrompt } = await import('@/lib/agents/learning');
      const [agentLearnings, globalLearnings] = await Promise.all([
        getActiveLearnings(supabase, agent_id, undefined, undefined),
        getAllHistoricalLearnings(supabase, { minConfidence: 40, limit: 20 }),
      ]);
      if ((agentLearnings || []).length > 0 || (globalLearnings || []).length > 0) {
        ragContext = '\n\n=== CONNAISSANCES & APPRENTISSAGES ===\n' + formatLearningsForPrompt(agentLearnings || [], globalLearnings || []);
      }
    } catch (e: any) {
      console.warn('[ClientChat] RAG load failed (non-fatal):', e?.message);
    }

    // 7. Build system prompt using client-facing prompt + enriched context + RAG
    const systemPrompt = getClientPrompt(agent_id, dossierContext, agentName) + enrichedContext + scrapedContext + ragContext;

    // 8. Load last 20 messages from client_agent_chats for conversation history
    const { data: chatRow } = await supabase
      .from('client_agent_chats')
      .select('id, messages')
      .eq('user_id', user.id)
      .eq('agent_id', agent_id)
      .single();

    const existingMessages: Array<{ role: string; content: string; timestamp: string }> =
      Array.isArray(chatRow?.messages) ? chatRow.messages : [];

    // Take last 20 messages for context window
    const recentMessages = existingMessages.slice(-20);

    // 9. Call Claude API (Haiku for speed/cost)
    const claudeMessages = [
      ...recentMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Boosted system prompt — works with any model (Gemini, Haiku, Sonnet)
    const boostedRules = `

=== REGLES ABSOLUES ===

INTERDICTIONS (ne fais JAMAIS ca):
- "Je traite ta demande" / "C'est noté" / "Je m'en occupe" → INTERDIT. Ca ne veut RIEN dire.
- Réponses vagues sans action concrète → INTERDIT.
- Ignorer une demande d'action → INTERDIT.

OBLIGATIONS (fais TOUJOURS ca):
- Le client demande quelque chose ? AGIS et MONTRE le résultat. Ex: "C'est fait ! Voilà ton post Instagram..."
- Le client pose une question ? RÉPONDS avec des CHIFFRES et des FAITS (utilise les actions pour chercher).
- Ton: pro, amical, tutoiement, enthousiaste mais pas excessif. Comme un collègue expert.
- Tu te souviens de TOUT (historique ci-dessus). Ne demande JAMAIS une info déjà donnée.
- Tu connais les données de TOUS les agents (RAG ci-dessus). Utilise-les.

=== ACTIONS CROSS-AGENTS ===
Tu peux déclencher N'IMPORTE quelle action, même si tu n'es pas l'agent en charge.
Hugo peut générer un post. Lena peut envoyer des emails. Léo peut scanner les DMs.

Pour exécuter une action, INCLUS le tag DANS ta réponse:
- Post Instagram: [ACTION:{"type":"generate_post","platform":"instagram","format":"post","pillar":"tips"}]
- Reel Instagram: [ACTION:{"type":"generate_post","platform":"instagram","format":"reel","pillar":"trends"}]
- Post TikTok: [ACTION:{"type":"generate_post","platform":"tiktok","format":"video"}]
- Post LinkedIn: [ACTION:{"type":"generate_post","platform":"linkedin","format":"text"}]
- Envoyer emails: [ACTION:{"type":"send_emails"}]
- Prospecter Google Maps: [ACTION:{"type":"prospect","query":"restaurant Paris"}]
- Voir posts planifiés: [ACTION:{"type":"list_posts"}]
- Scanner DMs: [ACTION:{"type":"scan_dms"}]
- Répondre commentaires: [ACTION:{"type":"reply_comments"}]

COMMENT UTILISER: Explique ce que tu fais PUIS mets le tag.
Ex: "Je te génère un post Instagram tout de suite ! [ACTION:{\\"type\\":\\"generate_post\\",\\"platform\\":\\"instagram\\"}]"
Le système exécute l'action et ajoute "Résultat: ..." automatiquement.
N'utilise les actions QUE quand le client DEMANDE explicitement.`;

    const fullSystemPrompt = systemPrompt + boostedRules;

    // Choose model based on plan + agent type
    const premiumPlans = ['business', 'elite', 'agence'];
    const premiumAgents = ['comptable', 'finance']; // Louis always gets Sonnet (devis, factures, Excel)
    const isPremium = premiumPlans.includes(plan) || premiumAgents.includes(agent_id);

    let reply = '';

    if (isPremium) {
      // Premium: Claude Sonnet — best quality
      console.log(`[ClientChat] Using Claude Sonnet for premium plan=${plan}, user=${user.id}, agent=${agent_id}`);
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: fullSystemPrompt,
        temperature: 0.7,
        messages: claudeMessages,
      });
      reply = response.content[0].type === 'text' ? response.content[0].text : '';
      console.log(`[ClientChat] Sonnet response (${response.usage.input_tokens + response.usage.output_tokens} tokens)`);
    } else {
      // Standard: Gemini Flash — best value, free/near-free
      console.log(`[ClientChat] Using Gemini Flash for plan=${plan}, user=${user.id}, agent=${agent_id}`);
      try {
        const { callGeminiChat } = await import('@/lib/agents/gemini');
        const historyStr = recentMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
        reply = await callGeminiChat({
          system: fullSystemPrompt + (historyStr ? `\n\nHISTORIQUE:\n${historyStr}` : ''),
          message: message,
          history: [],
        });
      } catch (geminiErr: any) {
        console.warn(`[ClientChat] Gemini failed, falling back to Haiku:`, geminiErr.message?.substring(0, 100));
        // Fallback to Claude Haiku if Gemini fails
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: fullSystemPrompt,
          temperature: 0.7,
          messages: claudeMessages,
        });
        reply = response.content[0].type === 'text' ? response.content[0].text : '';
      }
      console.log(`[ClientChat] Response received: ${reply.substring(0, 80)}...`);
    }

    // 9.4 Detect and save dossier updates from Clara's onboarding interview
    // Supports both <dossier_update>...</dossier_update> and [dossier_update]...[/dossier_update]
    const dossierMatch = reply.match(/<dossier_update>\s*(\{[\s\S]*?\})\s*<\/dossier_update>/) ||
                          reply.match(/\[dossier_update\]\s*(\{[\s\S]*?\})\s*\[\/dossier_update\]/);
    if (dossierMatch) {
      try {
        const dossierUpdates = JSON.parse(dossierMatch[1]);
        if (Object.keys(dossierUpdates).length > 0) {
          const { upsertBusinessDossier } = await import('@/lib/agents/client-context');
          await upsertBusinessDossier(supabase, user.id, dossierUpdates);
          console.log(`[ClientChat] Dossier updated: ${Object.keys(dossierUpdates).join(', ')}`);
        }
      } catch (e: any) {
        console.warn('[ClientChat] Dossier update parse error:', e.message);
      }
      // Remove the dossier block from visible reply
      reply = reply.replace(/<dossier_update>[\s\S]*?<\/dossier_update>/, '')
                    .replace(/\[dossier_update\][\s\S]*?\[\/dossier_update\]/, '').trim();
    }

    // 9.5 Detect and execute ACTION from agent response
    // Format: [ACTION:{"type":"publish","platform":"instagram"}]
    const actionMatch = reply.match(/\[ACTION:\{.*?\}\]/);
    if (actionMatch) {
      try {
        const actionJson = JSON.parse(actionMatch[0].replace('[ACTION:', '').replace(']', ''));
        console.log(`[ClientChat] Action detected:`, actionJson);

        // Execute the action
        const actionType = actionJson.type;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com';
        let actionResult = '';

        if (actionType === 'generate_post') {
          const res = await fetch(`${baseUrl}/api/agents/content`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
            body: JSON.stringify({ action: 'generate_post', platform: actionJson.platform || 'instagram', format: actionJson.format || 'post', pillar: actionJson.pillar || 'tips', draftOnly: actionJson.draft || false, user_id: user.id }),
          });
          const data = await res.json();
          actionResult = data.ok ? `Post ${data.post?.platform || 'instagram'} créé${data.instagram_permalink ? ` et publié: ${data.instagram_permalink}` : ' (en brouillon)'}` : `Erreur: ${data.error || 'échec'}`;
        } else if (actionType === 'scan_dms') {
          const res = await fetch(`${baseUrl}/api/agents/dm-instagram/auto-reply`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
          });
          const data = await res.json();
          actionResult = `${data.replied || 0} DMs répondus, ${data.total_conversations || 0} conversations scannées`;
        } else if (actionType === 'reply_comments') {
          const res = await fetch(`${baseUrl}/api/agents/instagram-comments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
            body: JSON.stringify({ action: 'auto_reply_all' }),
          });
          const data = await res.json();
          actionResult = `${data.replied || data.comments_replied || 0} commentaires répondus`;
        } else if (actionType === 'send_emails') {
          // Cross-agent: any agent can trigger emails
          const res = await fetch(`${baseUrl}/api/agents/email/daily?slot=morning&force=true&user_id=${user.id}`, {
            headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
          });
          const data = await res.json();
          actionResult = `${data.stats?.success || 0} emails envoyés`;
        } else if (actionType === 'prospect') {
          const res = await fetch(`${baseUrl}/api/agents/gmaps`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
            body: JSON.stringify({ query: actionJson.query }),
          });
          const data = await res.json();
          actionResult = `${data.imported || 0} prospects trouvés sur Google Maps`;
        } else if (actionType === 'list_posts') {
          const res = await fetch(`${baseUrl}/api/agents/content`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
            body: JSON.stringify({ action: 'calendar', user_id: user.id }),
          });
          const data = await res.json();
          const posts = data.posts || [];
          const scheduled = posts.filter((p: any) => p.status === 'approved').length;
          const published = posts.filter((p: any) => p.status === 'published').length;
          const drafts = posts.filter((p: any) => p.status === 'draft').length;
          actionResult = `${posts.length} posts au total: ${published} publiés, ${scheduled} programmés, ${drafts} brouillons`;
        }

        if (actionResult) {
          reply = reply.replace(/\[ACTION:\{.*?\}\]/, '').trim();
          reply += `\n\n✅ **Résultat:** ${actionResult}`;
        }

        await supabase.from('agent_logs').insert({
          agent: agent_id, action: 'chat_action_executed', status: 'ok',
          data: { action: actionJson, result: actionResult, user_id: user.id },
          created_at: new Date().toISOString(),
        });
      } catch (e: any) {
        console.warn('[ClientChat] Action execution error:', e.message);
        reply = reply.replace(/\[ACTION:\{.*?\}\]/, '').trim();
      }
    }

    // 9.6 Detect and apply setting updates from agent response
    const settingMatch = reply.match(/\[SETTING_UPDATE:\{.*?\}\]/);
    if (settingMatch) {
      try {
        const jsonStr = settingMatch[0].replace('[SETTING_UPDATE:', '').replace(']', '');
        const setting = JSON.parse(jsonStr);
        if (setting.key && setting.value !== undefined) {
          // Save to localStorage via client response (agent_logs for server-side tracking)
          await supabase.from('agent_logs').insert({
            agent: agent_id,
            action: 'setting_updated',
            status: 'ok',
            data: { key: setting.key, value: setting.value, updated_by: 'chat', agent_name: agentName },
            created_at: new Date().toISOString(),
          });
          console.log(`[ClientChat] Setting update: ${setting.key} = ${setting.value}`);
        }
      } catch { /* silent */ }
      // Remove the setting block from the visible reply
      reply = reply.replace(/\[SETTING_UPDATE:\{.*?\}\]/, '').trim();
    }

    // 10. Save both user message and agent reply to client_agent_chats
    const now = new Date().toISOString();
    const newMessages = [
      ...existingMessages,
      { role: 'user', content: message, timestamp: now },
      { role: 'assistant', content: reply, timestamp: now },
    ];

    if (chatRow?.id) {
      // Update existing chat row
      await supabase
        .from('client_agent_chats')
        .update({
          messages: newMessages,
          updated_at: now,
        })
        .eq('id', chatRow.id);
    } else {
      // Create new chat row
      await supabase.from('client_agent_chats').insert({
        user_id: user.id,
        agent_id: agent_id,
        messages: newMessages,
        created_at: now,
        updated_at: now,
      });
    }

    // 10.5 Share key insights from this conversation to RAG (cross-agent learning)
    // Only save if the reply contains substantial info (not just greetings)
    if (reply.length > 100 && !reply.includes('Bonjour') && existingMessages.length >= 2) {
      try {
        const { saveLearning } = await import('@/lib/agents/learning');
        await saveLearning(supabase, {
          agent: agent_id,
          category: 'general',
          learning: `Client conversation: "${message.substring(0, 100)}" → Agent response key: ${reply.substring(0, 150)}`,
          evidence: `chat_${agent_id}_${user.id}_${new Date().toISOString().split('T')[0]}`,
          confidence: 15,
        });
      } catch {}
    }

    // 11. Chat is free — no credit deduction
    const newBalance: number | undefined = undefined;

    // Extract setting update for frontend
    const settingUpdate = settingMatch ? (() => {
      try {
        const jsonStr = settingMatch[0].replace('[SETTING_UPDATE:', '').replace(']', '');
        return JSON.parse(jsonStr);
      } catch { return null; }
    })() : null;

    return NextResponse.json({
      ok: true,
      reply,
      message: reply, // alias for compatibility
      agent_name: agentName,
      newBalance,
      ...(settingUpdate ? { setting_update: settingUpdate } : {}),
    });
  } catch (error: any) {
    console.error('[ClientChat] Error:', error?.message, error?.stack?.slice(0, 500));
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/agents/client-chat?agent_id=marketing
 * Load conversation history for a specific agent.
 * Response: { messages: [{role, content, timestamp}], agent: {name, avatar_url} }
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Connexion requise', requires_auth: true },
        { status: 401 },
      );
    }

    const agentId = request.nextUrl.searchParams.get('agent_id');
    if (!agentId) {
      return NextResponse.json(
        { ok: false, error: 'agent_id parameter requis' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // Load conversation history
    const { data: chatRow } = await supabase
      .from('client_agent_chats')
      .select('messages')
      .eq('user_id', user.id)
      .eq('agent_id', agentId)
      .single();

    const messages: Array<{ role: string; content: string; timestamp: string }> =
      Array.isArray(chatRow?.messages) ? chatRow.messages : [];

    // Load agent avatar info
    const avatar = await getAgentAvatar(supabase, agentId);

    return NextResponse.json({
      ok: true,
      messages,
      agent: {
        name: avatar.display_name,
        avatar_url: avatar.avatar_url,
        avatar_3d_url: avatar.avatar_3d_url,
        title: avatar.title,
        gradient_from: avatar.gradient_from,
        gradient_to: avatar.gradient_to,
      },
    });
  } catch (error: any) {
    console.error('[ClientChat] GET Error:', error?.message);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 },
    );
  }
}
