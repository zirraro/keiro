import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { graphPOST } from '@/lib/meta';
import { callGeminiChat } from '@/lib/agents/gemini';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ─── Webhook verification (GET) ─────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || 'keiroai_webhook_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[InstagramWebhook] Verification OK');
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ ok: true, status: 'Instagram DM webhook actif' });
}

// ─── Incoming message handler (POST) ────────────────────────

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  try {
    // Parse body first, verify signature if available
    const rawBody = await req.text();
    var body: any;
    try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

    // Verify signature (warn but don't block — allows debugging in test mode)
    const APP_SECRET = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
    if (APP_SECRET) {
      const signature = req.headers.get('x-hub-signature-256') || '';
      const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
      if (signature && signature !== expected) {
        console.warn('[InstagramWebhook] Invalid signature — processing anyway for debug');
      }
    }

    console.log(`[InstagramWebhook] Received: object=${body.object}, entries=${body.entry?.length || 0}`);

    // Instagram sends messaging events under entry[].messaging[]
    const entries = body.entry || [];

    // Non-DM events (comments / mentions / story_insights / ig_account_review)
    // arrive under entry.changes[]. Two jobs here:
    //  1) any change means "stats moved" → refresh cached counts (Léna + AMI).
    //  2) a NEW comment, when the owner's comment auto-reply toggle is ON, gets
    //     replied to in real time (within seconds) instead of waiting for the
    //     periodic cron. We delegate to /reply_comment so the quality
    //     generation + dedup + reservation logic is reused as-is.
    const cronSecret = process.env.CRON_SECRET;
    // Internal base URL for the self-call. The server cannot fetch its OWN
    // public domain from inside (loopback to https://keiroai.com fails on the
    // VPS — "fetch failed"), so we hit the local app port directly. Override
    // with INTERNAL_API_URL if the topology changes.
    const selfOrigin = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

    for (const entry of entries) {
      const changes = entry.changes || [];
      if (changes.length === 0) continue;
      const igBusinessId: string | undefined = entry.id;
      if (!igBusinessId) continue;

      let ownerId: string | null = null;
      try {
        const { data: ownerProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('instagram_business_account_id', igBusinessId)
          .maybeSingle();
        ownerId = ownerProfile?.id || null;
        if (ownerId) {
          const { bumpInstagramInsights } = await import('@/lib/meta/insights-shared');
          // fire-and-forget — webhook must ack fast
          bumpInstagramInsights(supabase, ownerId).catch(() => {});
        }
      } catch { /* non-fatal */ }

      // ── Real-time comment auto-reply ──
      const commentChanges = changes.filter((ch: any) => ch?.field === 'comments' && ch?.value?.id);
      if (ownerId && commentChanges.length > 0 && cronSecret) {
        let commentsAutoOn = false;
        try {
          const { data: cfg } = await supabase
            .from('org_agent_configs')
            .select('config')
            .eq('user_id', ownerId)
            .eq('agent_id', 'instagram_comments')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          commentsAutoOn = cfg?.config?.auto_mode === true;
        } catch { /* default OFF */ }

        for (const ch of commentChanges) {
          const v = ch.value;
          if (v.parent_id) continue;                                   // only top-level comments
          if (String(v.from?.id || '') === String(igBusinessId)) continue; // never reply to ourselves (loop guard)
          if (!commentsAutoOn) {
            console.log(`[InstagramWebhook] comment ${v.id} for ${ownerId} — auto-reply OFF, surfaces in panel on next load`);
            continue;
          }
          // fire-and-forget; reply_comment dedups so duplicate webhook
          // deliveries can't double-reply.
          fetch(`${selfOrigin}/api/agents/instagram-comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
            body: JSON.stringify({ action: 'reply_comment', comment_id: v.id, user_id: ownerId }),
          })
            .then(() => console.log(`[InstagramWebhook] comment auto-reply fired for ${v.id}`))
            .catch((e: any) => console.warn('[InstagramWebhook] comment auto-reply failed:', e?.message));
        }
      }
    }

    for (const entry of entries) {
      const messaging = entry.messaging || [];

      for (const event of messaging) {
        const senderId = event.sender?.id;
        const recipientId = event.recipient?.id;
        const message = event.message;
        const timestamp = event.timestamp;

        if (!senderId || !message?.text) continue;

        // Skip echo messages (messages we sent)
        if (message.is_echo) continue;

        const messageText = message.text;
        const messageId = message.mid;

        console.log(`[InstagramWebhook] DM from ${senderId}: ${messageText.substring(0, 100)}`);

        // ─── Dedup check ────────────────────────────────
        if (messageId) {
          const { data: existing } = await supabase
            .from('agent_logs')
            .select('id')
            .eq('agent', 'dm_instagram')
            .eq('action', 'webhook_dm_received')
            .contains('data', { message_id: messageId })
            .limit(1)
            .maybeSingle();

          if (existing) continue;
        }

        // ─── 2026-06-03 — Respect AI toggle (Meta Human Agent protocol) ───
        // The polling cron already gated on auto_mode=false; the webhook
        // was bypassing it which meant the toggle didn't fully stop Jade.
        // Now consistent: if the business owner has flipped AI OFF, the
        // webhook still LOGS the inbound (so the inbox sees it) but does
        // NOT generate or send a reply. Human takes over.
        let aiAutoMode = true;
        try {
          const { data: ownerForToggle } = await supabase
            .from('profiles')
            .select('id')
            .eq('instagram_business_account_id', recipientId)
            .maybeSingle();
          if (ownerForToggle?.id) {
            const { data: cfgRows } = await supabase
              .from('org_agent_configs')
              .select('config, created_at')
              .eq('user_id', ownerForToggle.id)
              .eq('agent_id', 'dm_instagram')
              .order('created_at', { ascending: false })
              .limit(1);
            const explicit = cfgRows?.[0]?.config?.auto_mode;
            if (explicit === false) aiAutoMode = false;
          }
        } catch { /* on doubt, default to ON */ }

        // ─── Find prospect by Instagram ID or create ────
        let prospect: any = null;

        // Try to find by instagram field (could be the IG-scoped user ID)
        const { data: existingProspect } = await supabase
          .from('crm_prospects')
          .select('*')
          .eq('instagram', senderId)
          .limit(1)
          .maybeSingle();

        if (existingProspect) {
          prospect = existingProspect;
        } else {
          // Create new prospect from DM
          const { data: newProspect } = await supabase
            .from('crm_prospects')
            .insert({
              first_name: 'Instagram',
              last_name: `User ${senderId.substring(0, 6)}`,
              instagram: senderId,
              source: 'dm_instagram',
              status: 'contacte',
              temperature: 'warm',
              score: 20,
              priorite: 'B',
              notes: `Premier DM recu via Instagram: "${messageText.substring(0, 200)}"`,
            })
            .select()
            .single();

          prospect = newProspect;
        }

        if (!prospect) {
          console.error('[InstagramWebhook] Failed to find/create prospect');
          continue;
        }

        // 2026-06-03 v2 — Founder correction:
        //   mrzirraro@gmail.com = compte admin (génération ILLIMITÉE, on teste)
        //   samzirrar (le prospect test côté IG) = peut demander ILLIMITÉ
        //   Tout autre prospect = max 3 visuels avec évaluation conversion à chaque étape
        const ADMIN_OR_TEST_SENDERS = new Set(['samzirrar', '4338968213006871']);
        const isUnlimitedSender = ADMIN_OR_TEST_SENDERS.has((event.sender?.username || '').toLowerCase())
          || ADMIN_OR_TEST_SENDERS.has(senderId);
        // (Note: 'isTestAccount' var name kept for backward compat with the rest
        // of the prompt — but now means "unlimited generation allowed".)
        const isTestAccount = false; // never skip; we route by isUnlimitedSender instead

        // ─── Fetch prospect's Instagram profile info + ENRICH CRM ──────
        // Founder ask 2026-06-03: Jade doit analyser le profil IG, mettre à
        // jour la fiche CRM existante OU créer une nouvelle, puis générer
        // un visuel ultra-perso APRÈS avoir cerné business + objectifs.
        let prospectProfileInfo = '';
        let enrichedProspect = false;
        try {
          // Get admin token for Business Discovery
          const { data: adminForDiscovery } = await supabase
            .from('profiles')
            .select('instagram_business_account_id, facebook_page_access_token')
            .eq('is_admin', true)
            .not('facebook_page_access_token', 'is', null)
            .limit(1)
            .maybeSingle();

          if (adminForDiscovery?.instagram_business_account_id && adminForDiscovery?.facebook_page_access_token) {
            // Try to get the sender's username from the message event or conversation
            const senderUsername = event.sender?.username || null;
            if (senderUsername) {
              const discoveryRes = await fetch(
                `https://graph.facebook.com/v21.0/${adminForDiscovery.instagram_business_account_id}?fields=business_discovery.fields(username,name,biography,followers_count,media_count,profile_picture_url,media.limit(3){caption,timestamp,like_count,comments_count,media_url,media_type}).username(${senderUsername})&access_token=${adminForDiscovery.facebook_page_access_token}`,
                { signal: AbortSignal.timeout(8000) }
              );
              if (discoveryRes.ok) {
                const disc = await discoveryRes.json();
                const bd = disc.business_discovery;
                if (bd) {
                  prospectProfileInfo = `\n\nPROFIL INSTAGRAM DU PROSPECT:
- Username: @${bd.username}
- Nom: ${bd.name || '?'}
- Bio: ${bd.biography || 'aucune'}
- Abonnés: ${bd.followers_count || '?'}
- Posts: ${bd.media_count || '?'}`;
                  if (bd.media?.data?.length > 0) {
                    prospectProfileInfo += '\n- Derniers posts:';
                    for (const m of bd.media.data.slice(0, 3)) {
                      prospectProfileInfo += `\n  • ${m.caption?.substring(0, 80) || 'Sans légende'} (${m.like_count || 0} likes, ${m.media_type})`;
                    }
                  }
                  // 2026-06-03 — Enrichissement CRM agressif: enregistre TOUT ce qui
                  // peut servir à Jade pour personnaliser le visuel et la convo.
                  const updates: Record<string, any> = { updated_at: now };
                  if (bd.name && (!prospect.company || prospect.company === 'Instagram')) updates.company = bd.name;
                  if (bd.followers_count) updates.abonnes = bd.followers_count;
                  if (bd.username) updates.instagram = `@${bd.username}`;
                  // Bio → notes (concaténation, pas écrasement)
                  if (bd.biography && (!prospect.notes || prospect.notes.length < 50)) {
                    const bizContextNote = `Bio IG: ${bd.biography.substring(0, 200)}`;
                    const recentCaps = (bd.media?.data || []).slice(0, 3).map((m: any) => m.caption?.substring(0, 80)).filter(Boolean).join(' | ');
                    updates.notes = recentCaps
                      ? `${bizContextNote}\n\nDerniers posts: ${recentCaps}`
                      : bizContextNote;
                  }
                  if (bd.profile_picture_url) updates.avatar_url = bd.profile_picture_url;
                  await supabase.from('crm_prospects').update(updates).eq('id', prospect.id);
                  // Refresh local prospect object so the prompt sees fresh data
                  Object.assign(prospect, updates);
                  enrichedProspect = true;
                  console.log(`[InstagramWebhook] Enriched prospect with Business Discovery: @${bd.username}, ${bd.followers_count} followers, ${bd.media_count} posts`);

                  // Activity log → traceable in CRM history
                  try {
                    await supabase.from('crm_activities').insert({
                      prospect_id: prospect.id,
                      type: 'enrichment',
                      description: `Profil IG analysé automatiquement par Jade (Business Discovery)`,
                      data: {
                        username: bd.username,
                        followers: bd.followers_count,
                        bio: bd.biography?.substring(0, 200),
                        media_count: bd.media_count,
                      },
                      created_at: now,
                    });
                  } catch { /* non-fatal */ }
                }
              }
            }
          }
        } catch (discErr: any) {
          console.warn('[InstagramWebhook] Business Discovery failed (non-fatal):', discErr.message?.substring(0, 100));
        }

        // ─── Load conversation history ──────────────────
        const { data: recentLogs } = await supabase
          .from('agent_logs')
          .select('data, created_at')
          .eq('agent', 'dm_instagram')
          .or(`action.eq.webhook_dm_received,action.eq.dm_auto_reply`)
          .contains('data', { prospect_id: prospect.id })
          .order('created_at', { ascending: false })
          .limit(10);

        // Build proper multi-turn history for the model (last inbound is
        // passed separately as `message`, so excluded here).
        const historyTurns: Array<{ role: 'user' | 'assistant'; content: string }> = (recentLogs || [])
          .reverse()
          .map(log => ({
            role: (log.data?.direction === 'outbound' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: String(log.data?.reply_sent || log.data?.message || '').trim(),
          }))
          .filter(h => h.content.length > 0);
        // Text block kept for backwards compat with the system prompt body
        const history = historyTurns.map(h => `${h.role}: ${h.content}`).join('\n');

        // ─── Generate AI response with conversion strategy ───────────────────────
        // Load RAG learnings for better responses
        let ragContext = '';
        try {
          const { getActiveLearnings, getAllHistoricalLearnings, formatLearningsForPrompt } = await import('@/lib/agents/learning');
          const [own, global] = await Promise.all([
            getActiveLearnings(supabase, 'dm_instagram', undefined, undefined),
            getAllHistoricalLearnings(supabase, { minConfidence: 40, limit: 10 }),
          ]);
          if ((own || []).length > 0 || (global || []).length > 0) {
            ragContext = '\n\nCONNAISSANCES ACQUISES:\n' + formatLearningsForPrompt(own || [], global || []);
          }
        } catch {}

        // Load business dossier for personalized responses
        let businessContext = '';
        try {
          const { loadBusinessDossier, formatDossierForPrompt } = await import('@/lib/agents/client-context');
          const ownerProfile = await supabase.from('profiles').select('id').eq('instagram_business_account_id', recipientId).maybeSingle();
          if (ownerProfile?.data?.id) {
            const dossier = await loadBusinessDossier(supabase, ownerProfile.data.id);
            if (dossier) businessContext = '\n\nMON BUSINESS:\n' + formatDossierForPrompt(dossier);
          }
        } catch {}

        // Load showcase images for prospect's business type
        let showcaseContext = '';
        try {
          const prospectType = prospect.type || 'restaurant';
          const { data: showcaseImages } = await supabase
            .from('showcase_images')
            .select('image_url, title, business_type')
            .eq('business_type', prospectType)
            .eq('is_active', true)
            .limit(3);
          if (showcaseImages && showcaseImages.length > 0) {
            showcaseContext = `\n\nEXEMPLES DE VISUELS IA DISPONIBLES POUR ${prospectType.toUpperCase()}:\n` +
              showcaseImages.map((img: any, i: number) => `${i + 1}. "${img.title}" — ${img.image_url}`).join('\n') +
              `\nTu peux envoyer ces liens comme exemples concrets au prospect !`;
          }
        } catch {}

        // Track images already sent to this prospect to avoid duplicates
        let alreadySentImages: string[] = [];
        try {
          const { data: sentLogs } = await supabase
            .from('agent_logs')
            .select('data')
            .eq('agent', 'dm_instagram')
            .eq('action', 'dm_auto_reply')
            .contains('data', { prospect_id: prospect.id })
            .order('created_at', { ascending: false })
            .limit(10);
          alreadySentImages = (sentLogs || []).map(l => l.data?.image_sent).filter(Boolean);
        } catch {}

        const { languagePromptDirective: langFn, detectLanguage: detectLangFn } = await import('@/lib/agents/language-detect');
        const langDirective = langFn(messageText);
        const webhookDetectedLang = detectLangFn(messageText);
        const WEBHOOK_LANG_LABEL: Record<string, string> = {
          fr: 'French', en: 'English', es: 'Spanish', de: 'German', unknown: 'French',
        };
        const webhookTargetLang = WEBHOOK_LANG_LABEL[webhookDetectedLang] || 'French';
        const webhookLangLock = webhookDetectedLang !== 'fr' && webhookDetectedLang !== 'unknown'
          ? `\n⚠️ HARD LANGUAGE LOCK — The prospect wrote in ${webhookTargetLang}. YOUR ENTIRE REPLY MUST BE IN ${webhookTargetLang.toUpperCase()}. No French allowed when the prospect writes in ${webhookTargetLang}.\n`
          : '';
        const systemPrompt = `${langDirective}${webhookLangLock}

Tu es Victor, fondateur de KeiroAI — un VRAI COMMERCIAL EXPERT NIVEAU ÉLITE.
Tu vends comme un humain : tu DISCUTES, tu CERNES les objectifs et envies, tu CONVAINCS, et tu CLOSES.

🎯 OBJECTIF DE LA CONVERSATION (dans l'ordre — pas brûler les étapes) :
  1. Comprendre QUI est le prospect et ce qu'il fait
  2. Comprendre ses VRAIS objectifs et frustrations (manque de temps ? manque d'idées ? envie de plus de clients ?)
  3. Proposer la SOLUTION KEIROAI adaptée à SON cas (Créateur si c'est pour lui-même, Pro si business établi)
  4. Closer vers (a) essai gratuit 7j SI le prospect est chaud, OU (b) rdv Calendly de 15min POUR convaincre en live

CE QUE TU PROPOSES :
KeiroAI = on génère pour toi des images et vidéos pro avec l'IA, publiées automatiquement sur Instagram/TikTok/LinkedIn. Le business owner n'a rien à faire — il valide ou laisse en auto. On surfe sur les tendances pour attirer l'attention.

🚫 INTERDICTION ABSOLUE — N'ENVOIE PAS UN VISUEL AU 1er MESSAGE
Tu n'es PAS un bot qui balance des images en boucle. Tu es un commercial qui DISCUTE d'abord.
- Au 1er msg : pas de visuel. Question ouverte pour comprendre.
- Au 2-3ème msg : pas de visuel non plus. Tu creuses ses objectifs/frustrations.
- Tu n'envoies un visuel QUE quand :
  (a) le prospect te demande explicitement de voir un exemple, OU
  (b) tu as identifié son business + un objectif précis et tu proposes "tu veux que je te montre ce que ça pourrait donner pour [son business / son objectif spécifique] ?"
  Si oui à (b), tu attends sa confirmation avant de générer.

🎨 GÉNÉRER UN VISUEL ULTRA-PERSONNALISÉ
Quand tu envoies un visuel, demande d'abord au prospect ce qu'il aimerait voir :
"Tu préférerais voir un exemple de quoi ? Une promo, un produit phare, une ambiance, un avant/après ?"
Puis génère du SUR-MESURE en fonction de SA réponse + son business :
[GENERATE_IMAGE:très specifique en anglais avec son secteur, son type d'offre, l'ambiance qu'il a évoquée]

Exemples bien faits :
- "Bijouterie artisanale à Bordeaux" + "produit phare" → [GENERATE_IMAGE:elegant artisanal jewelry photography, handcrafted gold ring on dark velvet, Bordeaux luxury boutique aesthetic, soft warm light, premium product shot, no text]
- "Pizzeria napolitaine, ambiance familiale" + "promo soir" → [GENERATE_IMAGE:authentic Neapolitan pizzeria evening atmosphere, wood-fired pizza close-up steaming, warm family dinner ambiance, golden hour lighting, vibrant food photography, no text]
- "Coach sportif outdoor" + "avant/après motivation" → [GENERATE_IMAGE:outdoor fitness coach transformation, athletic person training at sunrise in nature, motivational composition, dynamic action shot, no text]

JAMAIS [SEND_SHOWCASE:generic] — image random sans rapport, ça brûle le prospect.
JAMAIS [SEND_SHOWCASE:autre_type] générique — toujours préférer [GENERATE_IMAGE:description sur-mesure].

COMMENT TU PARLES :
- Comme un pote entrepreneur. Court, direct, naturel. JAMAIS scripté.
- ZÉRO emoji. Aucun. Jamais.
- 1-3 phrases max par message. Surtout pas de pavé.
- Tutoiement. Décontracté mais pro.
- TERMINE TOUJOURS PAR UNE QUESTION OUVERTE qui fait avancer la vente.
- JAMAIS de "n'hésite pas", "je suis là pour", "nos agents", "notre système", "IA".
- JAMAIS parler de bug, erreur, système. Tout est fluide.
- JAMAIS de listes à puces.
- Tu NE VENDS PAS la gestion de DMs. Tu vends la GÉNÉRATION D'IMAGES ET VIDÉOS.

INFOS CRM SUR CE PROSPECT :
- Entreprise : ${prospect.company || 'inconnue'}
- Type : ${prospect.type || 'inconnu'}
- Spécialité : ${(prospect.notes || '').substring(0, 100) || 'aucune'}
- Instagram : @${prospect.instagram || ''}

📋 PLAYBOOK COMMERCIAL (suis l'ordre, n'invente pas) :

ÉTAPE 1 — DÉCOUVERTE (msg 1-2)
${prospect.company && prospect.type
  ? `Tu CONNAIS déjà son business (${prospect.company}, ${prospect.type}). Commence par valider : "Salut, tu gères bien ${prospect.company} ? J'ai vu votre compte, sympa ce que vous faites. T'es satisfait du contenu que tu publies en ce moment, ou tu cherches à monter en volume / qualité ?"`
  : `Tu ne connais PAS son business. Demande naturellement : "Salut, tu es dans quel domaine ? Je veux voir si KeiroAI peut t'aider concrètement avant de te raconter n'importe quoi."`}

ÉTAPE 2 — QUALIFICATION DES OBJECTIFS (msg 2-4)
Quand tu sais ce qu'il fait, creuse :
- "C'est quoi le pain point principal en ce moment ? Le temps pour créer du contenu, les idées, la régularité, ou les résultats ?"
- "Tu publies combien de fois par semaine actuellement ?"
- "T'aimerais voir quel genre de visuels pour ton business idéalement ?"

ÉTAPE 3 — DÉMONSTRATION SUR-MESURE (msg 4-5)
APRÈS avoir cerné son business + ses objectifs, propose :
"Tu veux que je te génère un exemple de visuel adapté à [son objectif précis] pour [son business] ? Dis-moi quel genre d'ambiance / produit tu voudrais mettre en avant et je te montre."
Quand il répond → [GENERATE_IMAGE:description ultra-spécifique combinant son business + ce qu'il a dit]

ÉTAPE 4 — CLOSING (msg 5-6)
Selon le signal d'achat :
(a) PROSPECT CHAUD ("ça m'intéresse", "comment je m'inscris", "c'est combien") :
    → Essai gratuit direct : "Parfait. L'essai gratuit 7 jours est sur keiroai.com/pricing — tu choisis Créateur (49€/mois après) ou Pro (99€). 0 euro débité pendant 7j, tu annules en 1 clic."
(b) PROSPECT INTÉRESSÉ MAIS HÉSITE ("à voir", "j'sais pas trop", questions multiples) :
    → RDV Calendly 15min : "Le mieux c'est qu'on se cale 15 min en visio, je te montre concrètement en live et tu décides après. Tu peux choisir un créneau ici : ${process.env.NEXT_PUBLIC_SETUP_CALL_URL || 'https://cal.com/keiroai/setup-30min'}"
(c) PROSPECT TIÈDE / EXPLORATEUR :
    → Continue à creuser, propose un autre angle, ne brusque pas.

${isUnlimitedSender ? `
🧪 COMPTE TEST ILLIMITÉ — ${alreadySentImages.length} visuels déjà envoyés
Ce prospect est en mode test (samzirrar / admin). Tu peux générer AUTANT de visuels que demandé avec [GENERATE_IMAGE:...]. Pas de limite. Continue à discuter, génère à la demande, propose des angles différents. C'est le compte qui sert à valider notre flow.
` : `
IMAGES — POLITIQUE 3 VISUELS MAX AVEC ÉVALUATION (2026-06-03 v2) :
- IMAGES DÉJÀ ENVOYÉES : ${alreadySentImages.length}/3

${alreadySentImages.length === 0
  ? `📍 PREMIER VISUEL — règles strictes :
- NE génère PAS avant d'avoir : (a) cerné son business ET (b) son objectif spécifique
- Le prospect doit avoir confirmé qu'il veut voir un exemple OU tu lui as proposé et il a accepté
- [GENERATE_IMAGE:description ultra-spécifique combinant son business + son angle]
- Citation obligatoire dans le brief : secteur précis + angle exact (produit phare / ambiance / promo / avant-après / mix univers)`
  : alreadySentImages.length === 1
    ? `📍 2ème VISUEL POSSIBLE — uniquement si tu sens encore une chance de conversion :
- Évalue d'abord : le prospect est-il encore engagé ? Pose-t-il des questions ? Y a-t-il un angle DIFFÉRENT qui pourrait l'aider à se projeter ?
- Si OUI → propose un angle complémentaire et ATTEND qu'il valide (ex: "Si tu veux je te montre aussi sur [autre angle complementaire], dis-moi.")
- Si OUI et il dit oui → génère [GENERATE_IMAGE:angle DIFFÉRENT du premier]
- Si NON (silence, désintérêt, "merci je vais voir") → STOP visuels, propose direct RDV ou essai gratuit, lien Cal.com.
- NE PROPOSE PAS de 2e visuel si tu n'es pas sûr qu'il y a opportunité — passe à la conversion direct.`
    : alreadySentImages.length === 2
      ? `📍 3ème ET DERNIER VISUEL — uniquement si signal d'achat fort :
- Le prospect a-t-il dit explicitement quelque chose comme "ah ouais, et est-ce que ça peut faire ___ ?" ou "intéressant, c'est combien ?" ?
- Si OUI signal d'achat fort → génère [GENERATE_IMAGE:dernier angle qui répond direct à sa demande]
- Si NON → STOP, close direct avec lien essai 7j (keiroai.com/pricing) ou RDV Cal.com.
- C'est ton dernier shot visuel. Après ça, focus 100% conversion.`
      : `🛑 STOP VISUELS — 3 exemples envoyés.
Plus d'images. Close direct :
- Si prospect chaud : "Tu as vu 3 angles, le mieux est de tester pour de vrai. C'est gratuit 7 jours sur keiroai.com/pricing — 0€ débité, tu annules en 1 clic."
- Si prospect hésite : "On cale 15 min en visio, je te montre le workspace live + tu décides. ${process.env.NEXT_PUBLIC_SETUP_CALL_URL || 'https://cal.com/keiroai/setup-30min'}"
- Si prospect refuse poliment 2 fois → handoff humain : marque la conversation [HANDOFF_HUMAN:no_traction_after_3_visuals]`}

🔄 CACHE DES VISUELS — réutilisation intelligente :
Le système check d'abord s'il y a un visuel pertinent déjà généré pour ce secteur dans le cache (économie Bytedance). Si match trouvé → renvoyé direct, pas de nouvelle génération. Si pas de match → nouvelle génération, ajoutée au cache pour les prospects futurs du même secteur. Tu n'as rien à faire de spécial — le routing est automatique.

🎯 TON OBJECTIF = CONVERTIR (pas passer la main)
Tu es l'agent de conversion principal. Ton job : closer le prospect en automatique (essai 7j gratuit ou RDV Calendly). Le handoff humain est l'EXCEPTION, pas le mode par défaut. Tu insistes intelligemment, tu cherches les angles, tu n'abandonnes pas au 1er obstacle.

🚪 HANDOFF HUMAIN — uniquement si TU NE PEUX VRAIMENT PAS convertir
Émets [HANDOFF_HUMAN:<raison_précise>] SEULEMENT dans ces cas extrêmes :
- Prospect ouvertement hostile ou insultant (pas juste sceptique)
- Question légale/RGPD/contrat custom qui dépasse vraiment ton scope
- Demande d'intégration technique très spécifique nécessitant un dev
- Le prospect a déjà refusé 2 fois ton essai gratuit ET ton RDV Calendly de façon catégorique ("non vraiment pas", pas juste "à voir")

⚠️ Tu N'ABANDONNES JAMAIS sur :
- "à voir" → propose un visuel custom ou un cas client similaire
- "j'ai pas le temps" → propose le rdv 15 min comme low-effort
- "c'est cher" → décompose la valeur ROI (1 client gagné = plan amorti)
- "je vais réfléchir" → propose l'essai gratuit no-risk
- Silence → relance avec un angle business spécifique 24h plus tard

Le client est notifié dans son espace KeiroAI quand tu fais un handoff. Pas en push intrusif.
`}

PSYCHOLOGIE DE CLOSING :
- Tu es un closer bienveillant. Tu sens le moment où le prospect est prêt.
- Après LE visuel unique : "Ça te parle ?" → évalue l'intérêt → propose essai 7j ou RDV
- Si oui → propose essai gratuit OU rdv selon son niveau d'engagement
- Ne brusque jamais. Si le prospect hésite, repose une question ouverte sur son business.

INTERDICTIONS ABSOLUES :
- Ne dis JAMAIS "je t'envoie un exemple" sans mettre [GENERATE_IMAGE:...]
- Ne dis JAMAIS "le système a bugué", "excuses pour le couac", "problème technique"
- Ne dis JAMAIS que tu es une IA ou un agent
- Ne parle JAMAIS de DMs, automatisation de DMs, gestion de messages
- Ne t'excuse JAMAIS. Pas de "désolé", "pardon"
- Si le prospect dit "rien reçu" / "toujours rien" : génère UN AUTRE visuel personnalisé avec [GENERATE_IMAGE:...] basé sur son business. Pas [SEND_SHOWCASE:generic].

PROSPECT : ${prospect.company || prospect.first_name || 'Inconnu'} (${prospect.type || 'type inconnu'})
${prospectProfileInfo}
${history ? `\nCONVERSATION :\n${history}` : ''}${businessContext}${ragContext}`;

        let aiReply = '';
        try {
          aiReply = await callGeminiChat({ system: systemPrompt, message: messageText, history: historyTurns, thinking: true });
          // Clean up AI response
          aiReply = aiReply.replace(/\*\*/g, '').replace(/```[\s\S]*?```/g, '').trim();
          if (aiReply.length > 500) aiReply = aiReply.substring(0, 500);
        } catch (aiErr: any) {
          console.error('[InstagramWebhook] AI error:', aiErr.message?.substring(0, 200));
          aiReply = '';
        }

        // ─── Log incoming message ───────────────────────
        await supabase.from('agent_logs').insert({
          agent: 'dm_instagram',
          action: 'webhook_dm_received',
          data: {
            prospect_id: prospect.id,
            sender_id: senderId,
            message: messageText.substring(0, 500),
            message_id: messageId,
            direction: 'inbound',
          },
          created_at: now,
        });

        // 2026-06-03 — Update inbound timestamp so the polling cron and
        // Noah's brief know a fresh prospect message arrived. Without this,
        // dms_incoming_24h stays at 0 and the reply % can't be computed.
        // Also if the prospect was flagged 'needs_human', flip the row
        // back to 'engaged' so the polling cron picks it up again.
        try {
          await supabase.from('crm_prospects')
            .update({
              dm_last_inbound_at: now,
              updated_at: now,
              // Only clear needs_human — leave dead/lost alone.
              dm_status: prospect.dm_status === 'needs_human' ? 'engaged' : prospect.dm_status,
            })
            .eq('id', prospect.id);
        } catch { /* non-fatal */ }

        await supabase.from('crm_activities').insert({
          prospect_id: prospect.id,
          type: 'dm_instagram',
          description: `DM Instagram recu: "${messageText.substring(0, 200)}"`,
          data: { direction: 'inbound', message: messageText.substring(0, 500) },
          created_at: now,
        });

        // ─── 2026-06-03 — Detect handoff tag avant traitement image ───
        // Jade peut émettre [HANDOFF_HUMAN:raison] quand la conversation
        // ne peut pas être conclue par l'agent. Pas d'envoi de reply auto,
        // le prospect est marqué needs_human et l'owner reprend la main.
        const handoffMatch = aiReply.match(/\[HANDOFF_HUMAN(?:\s*:\s*([^\]]*))?\]/i);
        if (handoffMatch) {
          const reason = (handoffMatch[1] || 'agent_request').trim().slice(0, 200);
          try {
            await supabase.from('crm_prospects').update({
              dm_status: 'needs_human',
              dm_message: `[HANDOFF] ${reason}`,
              updated_at: now,
            }).eq('id', prospect.id);
            await supabase.from('crm_activities').insert({
              prospect_id: prospect.id,
              type: 'dm_handoff',
              description: `Jade demande l'intervention humaine: ${reason}`,
              data: { channel: 'instagram', reason, source: 'webhook', last_message: messageText.slice(0, 500) },
              created_at: now,
            });
            // Notif in-app à l'owner
            const { data: ownerForHandoff } = await supabase
              .from('profiles')
              .select('id')
              .eq('instagram_business_account_id', recipientId)
              .maybeSingle();
            if (ownerForHandoff?.id) {
              await supabase.from('client_notifications').insert({
                user_id: ownerForHandoff.id,
                agent: 'dm_instagram',
                type: 'dm_handoff',
                title: `Jade te passe la main sur un DM (${reason.substring(0, 60)})`,
                message: `Le prospect ${prospect.company || senderId} attend ta réponse. Va sur Jade pour reprendre la conversation.`,
                data: { prospect_id: prospect.id, sender_id: senderId, reason },
              });
            }
          } catch (handoffErr: any) { console.warn('[InstagramWebhook] Handoff persist failed:', handoffErr?.message); }
          console.log(`[InstagramWebhook] HANDOFF_HUMAN for ${senderId}: ${reason} — skip auto-send`);
          continue; // pas d'envoi automatique, c'est à l'humain de reprendre
        }

        // ─── Detect image actions in AI reply ──────────
        let imageToSend: string | null = null;

        // Check if Jade wants to send a showcase image
        const showcaseMatch = aiReply.match(/\[SEND_SHOWCASE:([^\]]+)\]/);
        if (showcaseMatch) {
          const bType = showcaseMatch[1].trim().toLowerCase();
          aiReply = aiReply.replace(/\[SEND_SHOWCASE:[^\]]+\]/, '').trim();

          // EXACT MATCH ONLY — don't send wrong business type images.
          // "generic" is intentionally excluded so the AI can't send a random
          // unrelated image when it doesn't know the prospect's sector.
          // Without a match, the code below forces GENERATE_IMAGE instead.
          const EXACT_DB_TYPES = ['restaurant', 'boutique', 'coach', 'coiffeur', 'caviste', 'fleuriste'];
          const TYPE_MAP: Record<string, string> = {
            'bar': 'caviste', 'cafe': 'restaurant', 'brasserie': 'restaurant',
            'salon': 'coiffeur', 'barbier': 'coiffeur',
            'boulangerie': 'restaurant', 'patisserie': 'restaurant', 'traiteur': 'restaurant',
          };
          const mappedType = TYPE_MAP[bType] || bType;
          const hasExactMatch = EXACT_DB_TYPES.includes(mappedType);
          // If the AI emitted [SEND_SHOWCASE:generic] (or an unknown/unmapped
          // type), rewrite the reply so the GENERATE_IMAGE block below can
          // produce a visual targeted to what we actually know about the
          // prospect instead of firing a random showcase image.
          if (!hasExactMatch && !aiReply.includes('[GENERATE_IMAGE:')) {
            const genHint = prospect.company && prospect.type
              ? `${prospect.type} marketing post for ${prospect.company}, professional social media visual, modern premium style`
              : `professional social media marketing visual for a small local business, modern premium aesthetic`;
            aiReply += ` [GENERATE_IMAGE:${genHint}]`;
            console.log(`[InstagramWebhook] Rewriting showcase "${bType}" → GENERATE_IMAGE fallback`);
          }

          if (hasExactMatch) {
            // Use showcase image ONLY if exact type match exists
            try {
              const { data: imgs } = await supabase
                .from('showcase_images')
                .select('id, image_url, usage_count')
                .eq('business_type', mappedType)
                .eq('is_active', true)
                .order('usage_count', { ascending: true })
                .limit(10);

              if (imgs && imgs.length > 0) {
                const unsent = imgs.filter((img: any) => !alreadySentImages.includes(img.image_url));
                const picked = unsent.length > 0 ? unsent[0] : imgs[Math.floor(Math.random() * imgs.length)];
                imageToSend = picked.image_url;
                console.log(`[InstagramWebhook] Exact showcase match: ${mappedType} → ${(imageToSend || '').substring(0, 60)}`);
                supabase.from('showcase_images').update({ usage_count: ((picked as any).usage_count || 0) + 1 }).eq('id', picked.id).then(() => {});
              }
            } catch (e: any) { console.warn(`[InstagramWebhook] Showcase error:`, e.message?.substring(0, 80)); }
          }

          // NO exact match → generate via Seedream (personalized to the ACTUAL business)
          if (!imageToSend) {
            console.log(`[InstagramWebhook] No exact showcase for "${bType}" — generating via Seedream`);
            // Force generation by setting showcaseMatch (will be caught by auto-generate block below)
          }

          console.log(`[InstagramWebhook] Showcase: requested="${bType}" mapped="${mappedType}" found=${!!imageToSend} (already sent: ${alreadySentImages.length})`);
        }

        // Check if Jade wants to generate a personalized image.
        // 2026-06-03 v2 — Politique :
        //   - samzirrar/admin → illimité (compte test)
        //   - tout autre prospect → max 3 visuels avec évaluation conversion
        //   - AVANT de générer : check cache visuels existants (économie Bytedance)
        const generateMatch = aiReply.match(/\[GENERATE_IMAGE:([^\]]+)\]/);
        const shouldSkipGen = !isUnlimitedSender && alreadySentImages.length >= 3;
        let cacheReuseId: string | null = null;
        if (generateMatch && !imageToSend && !shouldSkipGen) {
          const imgPrompt = generateMatch[1].trim();
          aiReply = aiReply.replace(/\[GENERATE_IMAGE:[^\]]+\]/, '').trim();

          // 2026-06-03 v3 — Cache cross-client RETIRÉ.
          // Founder décision : trop risqué de réutiliser entre clients
          // (zones géographiques proches, clients qui se connaissent,
          // photos liées à business spécifique). Le cache est gardé en DB
          // pour audit/learning mais PLUS DE LOOKUP pour réutilisation.
          const prospectSector = (prospect.type || '').toLowerCase().trim();
          // (no cache lookup — always generate fresh)

          // STEP 2: génération via le router (Flux Schnell default, Seedream pour complex)
          if (!imageToSend) {
            try {
              const { generateImage, detectImageComplexity } = await import('@/lib/visuals/image-provider');
              const complexity = detectImageComplexity(imgPrompt);
              const genResult = await generateImage({
                prompt: imgPrompt,
                complexity,
                size: '1024x1024',
                callTag: `webhook_dm_${senderId.substring(0, 8)}`,
              });
              if (genResult?.url) {
                imageToSend = genResult.url;
                console.log(`[InstagramWebhook] Image generated via ${genResult.provider} (${genResult.cost_eur_estimate}€): ${genResult.url.substring(0, 80)}`);

                // Cache (audit-only, plus utilisé pour réutilisation cross-client)
                // mais on garde la trace pour analyse / réutilisation MANUELLE
                // (un visuel qui a converti pourrait être pertinent pour ce client lui-même)
                try {
                  const promptHash = imgPrompt.toLowerCase().replace(/[^a-z0-9]+/g, '').substring(0, 80);
                  await supabase.from('dm_visual_cache').insert({
                    image_url: genResult.url,
                    prompt: imgPrompt.substring(0, 500),
                    prompt_hash: promptHash,
                    sector: prospectSector || null,
                    business_type: prospect.type || null,
                    sub_angle: imgPrompt.split(',')[0]?.substring(0, 80) || null,
                    original_sender_id: senderId,
                    source_agent: `jade_webhook_${genResult.provider}`,
                    usage_count: 1,
                    last_used_at: now,
                  });
                } catch (cacheSaveErr: any) {
                  console.warn('[InstagramWebhook] Cache save failed:', cacheSaveErr?.message?.substring(0, 100));
                }
              }
            } catch (genErr: any) {
              console.warn('[InstagramWebhook] Image generation failed:', genErr.message?.substring(0, 100));
            }
          }
        }

        // If no image found from showcase but AI wanted to send one, generate via Seedream
        // 2026-06-03 — Skip pour compte test + 1-max policy
        if (!imageToSend && (showcaseMatch || generateMatch) && (isUnlimitedSender || alreadySentImages.length < 3)) {
          try {
            const seedreamUrl = process.env.SEEDREAM_API_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
            const seedreamKey = (process.env.SEEDREAM_API_KEY || process.env.ARK_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c').replace(/\\n/g, '').trim();
            if (seedreamUrl && seedreamKey) {
              // Build a rich prompt from prospect info + what they told us
              const bizType = showcaseMatch ? showcaseMatch[1] : (prospect.type || 'business');
              const bizName = prospect.company || '';
              // Use the conversation to understand what the prospect actually does
              const lastUserMsg = messageText.toLowerCase();
              // Use prospect specialty if available for ultra-precise visuals
              const specialty = (prospect.notes || '').split(' — ')[0] || bizType;
              const autoPrompt = `Stunning Instagram marketing visual for a ${specialty}${bizName ? ` named "${bizName}"` : ''}, featuring ${specialty} products beautifully styled, cinematic composition, professional product photography, soft natural lighting with warm tones, luxury premium feel, modern minimalist aesthetic, social media ready, ultra high quality, photorealistic`;
              console.log(`[InstagramWebhook] Auto-generating image: ${autoPrompt.substring(0, 80)}`);
              const genRes = await fetch(seedreamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${seedreamKey}` },
                body: JSON.stringify({ prompt: autoPrompt, width: 1080, height: 1080, num_images: 1 }),
                signal: AbortSignal.timeout(30000),
              });
              if (genRes.ok) {
                const genData = await genRes.json();
                const generatedUrl = genData.images?.[0]?.url || genData.data?.[0]?.url || genData.url;
                if (generatedUrl) {
                  imageToSend = generatedUrl;
                  console.log(`[InstagramWebhook] Auto-generated image: ${generatedUrl.substring(0, 80)}`);
                }
              }
            }
          } catch (e: any) {
            console.warn('[InstagramWebhook] Auto-generate failed:', e.message?.substring(0, 80));
          }
        }

        // Image will be sent as attachment first, URL in text as fallback

        // ─── Small delay to appear more human (not instant bot reply) ──
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000)); // 2-5s delay

        // ─── Defense-in-depth: never auto-reply outside the 24h window ──
        // The webhook normally fires on a fresh inbound (<24h), but if Meta
        // re-delivers a stale event we must NOT send a standard auto-reply:
        // outside the Meta 24h messaging window only a HUMAN may reply
        // (with the HUMAN_AGENT tag, triggered from the panel). This guard
        // is independent of the AI toggle — it can never be bypassed.
        const inboundAgeMs = timestamp ? (Date.now() - Number(timestamp)) : 0;
        if (inboundAgeMs > 24 * 60 * 60 * 1000) {
          console.log(`[InstagramWebhook] Inbound is ${Math.round(inboundAgeMs / 3600000)}h old (>24h) for ${recipientId} — human reply required, no auto-reply`);
          await supabase.from('agent_logs').insert({
            agent: 'dm_instagram',
            action: 'webhook_skipped_outside_24h',
            status: 'ok',
            data: { sender_id: senderId, recipient_id: recipientId, message_age_hours: Math.round(inboundAgeMs / 3600000) },
            created_at: now,
          });
          continue;
        }

        // ─── Send auto-reply if we have one AND AI toggle is ON ─────────
        // The AI toggle is the Meta Human Agent protocol switch: when the
        // business owner flips it OFF, the webhook stops sending replies
        // (the human takes over via the panel). Inbound is still logged
        // so the inbox shows the conversation.
        if (!aiAutoMode) {
          console.log(`[InstagramWebhook] AI toggle OFF for ${recipientId} — inbound logged but no auto-reply sent`);
          await supabase.from('agent_logs').insert({
            agent: 'dm_instagram',
            action: 'webhook_skipped_ai_off',
            status: 'ok',
            data: { sender_id: senderId, recipient_id: recipientId, reason: 'auto_mode_off' },
            created_at: now,
          });
          continue;
        }

        if (aiReply) {
          // 2026-06-03 FIX CRITIQUE — webhook sélectionnait `facebook_page_access_token`
          // ou `instagram_access_token` (legacy) en priorité, JAMAIS `instagram_igaa_token`.
          // Or depuis 2024 Meta n'accepte plus que IGAA pour les DMs (graph.instagram.com).
          // Le webhook recevait les events mais échouait systématiquement à envoyer
          // → action `webhook_send_failed`. Mon test manuel via curl IGAA confirme
          // que le token IGAA fonctionne parfaitement.
          let profile = null;
          const { data: directMatch } = await supabase
            .from('profiles')
            .select('id, instagram_business_account_id, instagram_igaa_token, facebook_page_access_token, instagram_access_token')
            .eq('instagram_business_account_id', recipientId)
            .limit(1)
            .maybeSingle();
          profile = directMatch;

          // Fallback: admin profile if recipientId not matched
          if (!profile?.instagram_igaa_token && !profile?.facebook_page_access_token) {
            const { data: adminMatch } = await supabase
              .from('profiles')
              .select('id, instagram_business_account_id, instagram_igaa_token, facebook_page_access_token, instagram_access_token')
              .eq('is_admin', true)
              .not('instagram_igaa_token', 'is', null)
              .limit(1)
              .maybeSingle();
            if (adminMatch?.instagram_igaa_token) {
              profile = adminMatch;
              console.log(`[InstagramWebhook] Using admin profile fallback (recipientId ${recipientId} not found)`);
            }
          }

          const sendFromId = profile?.instagram_business_account_id || recipientId;

          if (profile?.instagram_igaa_token || profile?.facebook_page_access_token || profile?.instagram_access_token) {
            try {
              let sendSuccess = false;

              // 1. IGAA token (graph.instagram.com) — MÉTHODE PRINCIPALE depuis 2024
              // C'est le SEUL token que Meta accepte de manière fiable pour les DMs.
              if (!sendSuccess && profile?.instagram_igaa_token) {
                try {
                  const igaaRes = await fetch('https://graph.instagram.com/v21.0/me/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                      recipient: JSON.stringify({ id: senderId }),
                      message: JSON.stringify({ text: aiReply }),
                      access_token: profile.instagram_igaa_token,
                    }),
                  });
                  if (igaaRes.ok) { sendSuccess = true; console.log('[InstagramWebhook] Reply sent via IGAA token (primary)'); }
                  else { console.warn('[InstagramWebhook] IGAA send failed:', (await igaaRes.text()).substring(0, 200)); }
                } catch (e: any) { console.warn('[InstagramWebhook] IGAA send error:', e.message?.substring(0, 100)); }
              }

              // 2. Facebook page token (graph.facebook.com) — fallback legacy
              if (!sendSuccess && profile?.facebook_page_access_token) {
                try {
                  const fbRes = await fetch(`https://graph.facebook.com/v21.0/${sendFromId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                      recipient: JSON.stringify({ id: senderId }),
                      message: JSON.stringify({ text: aiReply }),
                      access_token: profile.facebook_page_access_token,
                    }),
                  });
                  if (fbRes.ok) { sendSuccess = true; console.log('[InstagramWebhook] Reply sent via Facebook page token (fallback)'); }
                  else { console.warn('[InstagramWebhook] FB send failed:', (await fbRes.text()).substring(0, 150)); }
                } catch (e: any) { console.warn('[InstagramWebhook] FB send error:', e.message?.substring(0, 100)); }
              }

              // 3. Legacy instagram_access_token — last resort
              if (!sendSuccess && profile?.instagram_access_token && profile.instagram_access_token !== profile?.instagram_igaa_token) {
                try {
                  const igRes = await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      recipient: { id: senderId },
                      message: { text: aiReply },
                      access_token: profile.instagram_access_token,
                    }),
                  });
                  if (igRes.ok) { sendSuccess = true; console.log('[InstagramWebhook] Reply sent via legacy IG token'); }
                  else { console.warn('[InstagramWebhook] Legacy IG send failed:', (await igRes.text()).substring(0, 150)); }
                } catch (e: any) { console.warn('[InstagramWebhook] Legacy IG send error:', e.message?.substring(0, 100)); }
              }

              if (!sendSuccess) {
                console.error('[InstagramWebhook] ALL send methods failed for', senderId);
                // 2026-06-03 — Log the failure so the admin digest + UI banner
                // surfaces "Token IG révoqué — reconnecte" instead of silent
                // failure. Founder: "j'ai toujours pas de réponses en auto"
                // even though Jade *generated* the reply (just couldn't ship it).
                await supabase.from('agent_logs').insert({
                  agent: 'dm_instagram',
                  action: 'webhook_send_failed',
                  status: 'error',
                  data: {
                    sender_id: senderId,
                    recipient_id: recipientId,
                    reason: 'token_invalid_or_revoked',
                    reply_drafted: aiReply.substring(0, 200),
                    error: 'All Graph API send methods failed — token likely revoked',
                  },
                  created_at: now,
                });
                // Also notify the owner in-app so they fix it within minutes.
                try {
                  const { data: ownerForNotif } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('instagram_business_account_id', recipientId)
                    .maybeSingle();
                  if (ownerForNotif?.id) {
                    await supabase.from('client_notifications').insert({
                      user_id: ownerForNotif.id,
                      agent: 'dm_instagram',
                      type: 'token_revoked',
                      title: 'Token Instagram révoqué — reconnecte ton compte',
                      message: `Jade a préparé une réponse pour un DM mais n'a pas pu l'envoyer (token expiré ou révoqué côté Meta). Reconnecte ton Instagram dans le panel pour relancer l'auto-reply.`,
                      data: { sender_id: senderId, reply_drafted: aiReply.substring(0, 200) },
                    });
                  }
                } catch { /* non-fatal */ }
              }

              // Send image via Instagram API.
              // 2026-06-03 v2 — Verify delivery via Meta API response.
              // Now captures the message_id returned by Meta for traceability.
              // If Meta returns success, message_id confirms attachment landed.
              // If failure → image_delivery='failed' + retry with text fallback.
              let imgMessageId: string | null = null;
              let imgError: string | null = null;

              if (imageToSend && sendSuccess) {
                await new Promise(r => setTimeout(r, 1500));
                let imgSent = false;

                // 1. IGAA token (primary, post-2024 standard)
                if (!imgSent && profile?.instagram_igaa_token) {
                  try {
                    const igaaImgRes = await fetch('https://graph.instagram.com/v21.0/me/messages', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: new URLSearchParams({
                        recipient: JSON.stringify({ id: senderId }),
                        message: JSON.stringify({ attachment: { type: 'image', payload: { url: imageToSend, is_reusable: true } } }),
                        access_token: profile.instagram_igaa_token,
                      }),
                    });
                    const igaaJson = await igaaImgRes.json().catch(() => ({}));
                    if (igaaImgRes.ok && igaaJson.message_id) {
                      imgSent = true;
                      imgMessageId = igaaJson.message_id;
                      console.log(`[InstagramWebhook] Image sent via IGAA token — message_id=${imgMessageId}`);
                    } else {
                      imgError = `IGAA: ${JSON.stringify(igaaJson).substring(0, 200)}`;
                      console.warn('[InstagramWebhook] IGAA image failed:', imgError);
                    }
                  } catch (e: any) { console.warn('[InstagramWebhook] IGAA image error:', e.message?.substring(0, 100)); }
                }

                // 2. Fallback: legacy instagram_access_token
                if (!imgSent && profile?.instagram_access_token && profile.instagram_access_token !== profile?.instagram_igaa_token) {
                  try {
                    const igImgRes = await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        recipient: { id: senderId },
                        message: { attachment: { type: 'image', payload: { url: imageToSend, is_reusable: true } } },
                        access_token: profile.instagram_access_token,
                      }),
                    });
                    const igJson = await igImgRes.json().catch(() => ({}));
                    if (igImgRes.ok && igJson.message_id) {
                      imgSent = true;
                      imgMessageId = igJson.message_id;
                      console.log(`[InstagramWebhook] Image sent via legacy IG token — message_id=${imgMessageId}`);
                    } else {
                      imgError = `Legacy IG: ${JSON.stringify(igJson).substring(0, 200)}`;
                      console.warn('[InstagramWebhook] Legacy IG image failed:', imgError);
                    }
                  } catch (e: any) { console.warn('[InstagramWebhook] Legacy IG image error:', e.message?.substring(0, 100)); }
                }

                // Fallback: send URL as separate text if attachment failed
                if (!imgSent) {
                  const urlToken = profile?.instagram_igaa_token || profile?.instagram_access_token || profile?.facebook_page_access_token;
                  const urlEndpoint = profile?.instagram_igaa_token || profile?.instagram_access_token
                    ? `https://graph.instagram.com/v21.0/me/messages`
                    : `https://graph.facebook.com/v21.0/${sendFromId}/messages`;
                  try {
                    await fetch(urlEndpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        recipient: { id: senderId },
                        message: { text: `Clique ici pour voir l'exemple :\n${imageToSend}` },
                        access_token: urlToken,
                      }),
                    });
                    console.log('[InstagramWebhook] Image URL sent as text fallback');
                  } catch {}
                }

                // 2026-06-03 — Log delivery verification result
                if (!imgSent) {
                  await supabase.from('agent_logs').insert({
                    agent: 'dm_instagram',
                    action: 'webhook_image_send_failed',
                    status: 'error',
                    data: {
                      sender_id: senderId,
                      recipient_id: recipientId,
                      image_url: imageToSend,
                      error: imgError || 'unknown',
                      fallback: 'sent as URL text',
                    },
                    created_at: now,
                  });
                }
              }

              console.log(`[InstagramWebhook] Auto-reply sent to ${senderId}`);

              // Log outbound reply. Includes reply_to_msg_id so the
              // polling auto-reply route's dedup check
              // (.contains('data', { reply_to_msg_id }) at /api/agents/dm-instagram/auto-reply)
              // finds this entry and doesn't re-reply to the same
              // inbound DM. Founder reported 2026-05-24 that a DM had
              // been replied to twice — root cause was this missing
              // field on the webhook side.
              // 2026-06-03 — Vrai statut delivery basé sur retour Meta
              const imgDelivered = !imageToSend ? null : imgMessageId ? 'sent_confirmed' : 'sent_failed';
              await supabase.from('agent_logs').insert({
                agent: 'dm_instagram',
                action: 'dm_auto_reply',
                status: 'success',
                data: {
                  prospect_id: prospect.id,
                  sender_id: senderId,
                  message: aiReply,
                  reply_sent: aiReply.substring(0, 200),
                  reply_to_msg_id: messageId || null,
                  direction: 'outbound',
                  image_sent: imageToSend || null,
                  image_delivery: imgDelivered,
                  image_message_id: imgMessageId, // Meta API confirmation ID
                  image_error: imgError,
                  enriched_from_ig_profile: enrichedProspect,
                  test_account_skip_visual: isTestAccount,
                  method: 'webhook',
                },
                created_at: now,
              });

              await supabase.from('crm_activities').insert({
                prospect_id: prospect.id,
                type: 'dm_instagram',
                description: `Auto-reponse DM Instagram envoyee`,
                data: { direction: 'outbound', message: aiReply.substring(0, 200), auto: true },
                created_at: now,
              });
            } catch (sendErr: any) {
              console.error('[InstagramWebhook] Send reply error:', sendErr.message?.substring(0, 300));
            }
          } else {
            console.warn('[InstagramWebhook] No token found for IG account:', recipientId);
          }
        }

        // ─── Learn from image reactions ──────────────────
        // If prospect responded after an image was sent, track the reaction
        const lastSentImage = alreadySentImages.length > 0 ? alreadySentImages[alreadySentImages.length - 1] : null;
        if (lastSentImage) {
          const msgLower = messageText.toLowerCase();
          const isPositive = msgLower.includes('cool') || msgLower.includes('super') || msgLower.includes('bien') || msgLower.includes('oui') || msgLower.includes('interesse') || msgLower.includes('top') || msgLower.includes('j\'aime') || msgLower.includes('genial') || msgLower.includes('wow');
          const isNegative = msgLower.includes('non') || msgLower.includes('pas') || msgLower.includes('bof') || msgLower.includes('rien recu') || msgLower.includes('moche');
          if (isPositive || isNegative) {
            try {
              const { saveLearning } = await import('@/lib/agents/learning');
              await saveLearning(supabase, {
                agent: 'dm_instagram',
                category: 'content',
                learning: `Image DM ${isPositive ? 'APPRECIEE' : 'PAS APPRECIEE'} par ${prospect.type || 'prospect'}: ${lastSentImage.substring(0, 100)}. Reaction: "${messageText.substring(0, 80)}"`,
                evidence: `prospect_${prospect.id}_image_reaction`,
                confidence: isPositive ? 30 : 20,
              });
            } catch {}
          }
        }

        // ─── Update prospect with full tracking ────────────────────────────
        const newScore = Math.min(100, (prospect.score || 0) + 8);
        const newTemp = newScore >= 70 ? 'hot' : newScore >= 40 ? 'warm' : (prospect.temperature || 'cold');
        const prospectUpdate: Record<string, any> = {
          temperature: newTemp,
          score: newScore,
          updated_at: now,
          last_engaged_at: now,
        };
        // Advance pipeline status based on engagement
        if (prospect.status === 'identifie') prospectUpdate.status = 'contacte';
        if (newTemp === 'hot' && prospect.status !== 'client' && prospect.status !== 'repondu') prospectUpdate.status = 'repondu';
        // Track source channel
        if (!prospect.source || prospect.source === 'unknown') prospectUpdate.source = 'dm_instagram';

        await supabase.from('crm_prospects').update(prospectUpdate).eq('id', prospect.id);

        // ─── HANDOVER: Notify client when prospect is hot ──
        // Count exchange rounds (inbound messages from this prospect)
        const { count: exchangeCount } = await supabase
          .from('agent_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent', 'dm_instagram')
          .eq('action', 'webhook_dm_received')
          .contains('data', { prospect_id: prospect.id });

        // After 5+ exchanges AND score >= 60: prospect is genuinely hot → notify client
        // Must have BOTH conditions to avoid premature notifications
        if (exchangeCount && exchangeCount >= 5 && newScore >= 60) {
          // Check if we already notified for this prospect
          const { data: alreadyNotified } = await supabase
            .from('agent_logs')
            .select('id')
            .eq('agent', 'dm_instagram')
            .eq('action', 'handover_notification')
            .contains('data', { prospect_id: prospect.id })
            .limit(1)
            .maybeSingle();

          if (!alreadyNotified) {
            // Find the client (owner of this IG account) to notify
            const { data: ownerProfile } = await supabase
              .from('profiles')
              .select('id, email, company_name')
              .eq('instagram_business_account_id', recipientId)
              .limit(1)
              .maybeSingle();

            // In-app notification only (no email spam)
            // The daily CEO brief will include this in the evening summary

            // In-app notification for the client
            if (ownerProfile?.id) {
              try {
                const { notifyClient } = await import('@/lib/agents/notify-client');
                await notifyClient(supabase, {
                  userId: ownerProfile.id,
                  agent: 'dm_instagram',
                  type: 'action',
                  title: `Prospect chaud a closer !`,
                  message: `${prospect.company || prospect.first_name || 'Prospect'} (score ${newScore}) est pret. ${exchangeCount || 0} echanges. Dernier msg: "${messageText.substring(0, 80)}". Reprends la main pour closer !`,
                  data: { prospect_id: prospect.id, score: newScore, action: 'handover' },
                });
              } catch {}
            }

            // Log handover
            await supabase.from('agent_logs').insert({
              agent: 'dm_instagram',
              action: 'handover_notification',
              status: 'ok',
              data: {
                prospect_id: prospect.id,
                prospect_company: prospect.company || prospect.first_name,
                score: newScore,
                exchanges: exchangeCount,
                client_email: ownerProfile?.email,
              },
              created_at: now,
            });

            // Update dm_queue status if exists
            await supabase.from('dm_queue')
              .update({ status: 'responded', response_type: 'interested' })
              .eq('prospect_id', prospect.id)
              .in('status', ['pending', 'sent']);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[InstagramWebhook] Error:', err);
    return NextResponse.json({ ok: true }); // Always 200 for Meta
  }
}
