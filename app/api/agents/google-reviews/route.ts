import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getValidToken, getReviews, replyToReview, starRatingToNumber, getLocationDetails } from '@/lib/google-business-oauth';

/**
 * Traduit une erreur d'API en phrase compréhensible par un commerçant.
 *
 * Le brut part dans `diagnostic`, que nous seuls lisons. Ici on ne dit que
 * ce que le client peut comprendre, et surtout ce qu'il doit faire — le plus
 * souvent : rien.
 */
function messageClient(brut: string): string {
  const e = brut.toLowerCase();
  if (e.includes('429') || e.includes('quota') || e.includes('resource_exhausted')) {
    return "Ta fiche est bien connectée. Google n'a pas encore ouvert l'accès à ses données pour KeiroAI — la demande est déposée de notre côté. Théo affichera tes avis dès que ce sera accordé, sans rien te demander.";
  }
  if (e.includes('403') || e.includes('permission') || e.includes('has not been used')) {
    return "Ta fiche est connectée, mais Google refuse encore la lecture de tes données. On s'en occupe — tu n'as rien à faire de ton côté.";
  }
  if (e.includes('401') || e.includes('invalid_grant') || e.includes('unauthorized')) {
    return "Ta connexion Google a expiré. Reconnecte ton compte pour que Théo reprenne la main sur tes avis.";
  }
  return "Google n'a pas répondu comme prévu. On regarde de notre côté — tes avis réapparaîtront dès que la lecture sera rétablie.";
}

/** Les horaires Google, rendus lisibles : « Lun–Ven : 12h–14h30 ». */
function formaterHoraires(periods: any[]): string[] | null {
  const JOURS: Record<string, string> = {
    MONDAY: 'Lun', TUESDAY: 'Mar', WEDNESDAY: 'Mer', THURSDAY: 'Jeu',
    FRIDAY: 'Ven', SATURDAY: 'Sam', SUNDAY: 'Dim',
  };
  const h = (t: any) => t == null ? null
    : `${t.hours ?? 0}h${t.minutes ? String(t.minutes).padStart(2, '0') : ''}`;
  const parJour = new Map<string, string[]>();
  for (const p of periods) {
    const jour = JOURS[p.openDay];
    if (!jour) continue;
    const creneau = [h(p.openTime), h(p.closeTime)].filter(Boolean).join('–');
    if (creneau) parJour.set(jour, [...(parJour.get(jour) || []), creneau]);
  }
  const lignes = [...parJour.entries()].map(([j, c]) => `${j} : ${c.join(', ')}`);
  return lignes.length ? lignes : null;
}
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
    // google_business_account_id est indispensable au chemin v4
    // « accounts/X/locations/Y ». Colonne vérifiée présente avant ajout : une
    // colonne inconnue ici ferait rejeter la requête ENTIÈRE, pas seulement
    // le champ — Théo tomberait en silence.
    .select('business_type, google_business_account_id, google_business_location_id, google_business_location_name, google_business_refresh_token, email')
    .eq('id', user.id)
    .single();

  // No refresh token → truly not connected.
  if (!profile?.google_business_refresh_token) {
    return NextResponse.json({ ok: true, reviews: [], connected: false, message: 'Google Business non connecte' });
  }

  // Get valid token (refreshes if needed) — needed both pour récupérer la
  // location ET les avis.
  const accessToken = await getValidToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ ok: true, reviews: [], connected: false, message: 'Token Google expire' });
  }

  // SELF-HEAL : si la location manque (fetch du callback a raté, ou fiche ajoutée
  // après la connexion), on la re-récupère en LIVE et on la sauvegarde. Évite le
  // faux "aucun établissement" alors que le compte EST bien connecté.
  const forcer = req.nextUrl.searchParams.get('refresh') === '1';
  // Rafraîchir redétecte l'établissement, pas seulement les avis : un client
  // qui vient de créer sa fiche, ou dont l'accès API vient d'être accordé,
  // resterait sinon bloqué sur « aucun établissement » jusqu'à déconnexion.
  let locationId = forcer ? null : profile.google_business_location_id;
  // Le diagnostic est remonté dans la réponse : sans lui, « aucun
  // établissement » est indiscernable de « l'API a refusé l'appel », et on
  // envoie le client créer une fiche qu'il possède déjà.
  const diagnostic: { comptes?: number; erreur?: string; details?: string[] } = {};

  if (!locationId) {
    try {
      const { listAccounts, listLocations } = await import('@/lib/google-business-oauth');
      const accounts = await listAccounts(accessToken);
      diagnostic.comptes = accounts.length;
      diagnostic.details = [];

      for (const acc of accounts) {
        try {
          const locations = await listLocations(accessToken, acc.name);
          diagnostic.details.push(`${acc.name} → ${locations.length} établissement(s)`);
          if (locations.length > 0) {
            locationId = locations[0].name;
            await supabase.from('profiles').update({
              google_business_account_id: acc.name,
              google_business_location_id: locationId,
              google_business_location_name: locations[0].title || locations[0].storefrontAddress?.locality || '',
            }).eq('id', user.id);
            break;
          }
        } catch (e: any) {
          // Un compte qui refuse ne doit pas empêcher d'essayer les suivants :
          // un utilisateur peut être membre de plusieurs organisations Google.
          diagnostic.details.push(`${acc.name} → refus : ${String(e?.message || e).slice(0, 200)}`);
        }
      }
    } catch (e: any) {
      diagnostic.erreur = String(e?.message || e).slice(0, 300);
      console.warn('[GoogleReviews] récupération établissement échouée:', e?.message);
    }
  }

  // Un client connecté AVANT que le compte soit stocké a bien sa localisation
  // mais pas son accountId. Le chemin v4 serait incomplet et Théo lèverait une
  // erreur alors que tout est en place — on le retrouve et on le persiste.
  let accountId = profile.google_business_account_id;
  if (locationId && !accountId) {
    try {
      const { listAccounts } = await import('@/lib/google-business-oauth');
      const comptes = await listAccounts(accessToken);
      if (comptes.length > 0) {
        accountId = comptes[0].name;
        await supabase.from('profiles')
          .update({ google_business_account_id: accountId })
          .eq('id', user.id);
      }
    } catch (e: any) {
      console.warn('[GoogleReviews] compte introuvable pour chemin v4:', String(e?.message || e).slice(0, 160));
    }
  }

  if (!locationId) {
    /**
     * ══════════════════════════════════════════════════════════════════════
     * La fiche s'affiche même quand l'API Business est fermée
     * ══════════════════════════════════════════════════════════════════════
     *
     * Fondateur, 2026-08-15 : « fais bien qu'elle s'affiche dans l'espace
     * Théo, super important ».
     *
     * Jusqu'ici, pas d'établissement lisible par l'API Business Profile = pas
     * de fiche du tout. Le commerçant se connecte, voit « connecté », et un
     * panneau vide avec un message d'attente. Or l'accès à cette API est un
     * dossier ouvert chez Google, qui peut prendre des semaines : on ne peut
     * pas laisser l'écran vide en attendant.
     *
     * ── Ce qu'on affiche à la place ──
     *
     * Sa fiche PUBLIQUE, celle que ses clients voient sur Maps, lue par
     * l'API Places — que nous utilisons déjà tous les jours pour la
     * prospection, et qui n'a rien à voir avec l'autorisation en attente.
     * Nom, adresse, téléphone, note, nombre d'avis, horaires, catégorie.
     *
     * ── Ce que ça ne remplace pas, et qu'on ne prétend pas ──
     *
     * Places donne à LIRE, jamais à ÉCRIRE. Théo ne pourra répondre aux avis
     * ni corriger les horaires qu'une fois l'accès Business accordé. La fiche
     * est donc marquée `source: 'places'` pour que l'interface dise
     * clairement ce qui marche et ce qui attend encore — un affichage qui
     * laisserait croire que tout fonctionne serait pire que le panneau vide.
     */
    let fichePublique: any = null;
    try {
      const { searchBusiness, getBusinessProfile } = await import('@/lib/apis/google-business');
      const { data: dossier } = await supabase
        .from('business_dossiers')
        .select('company_name, address, city')
        .eq('user_id', user.id)
        .maybeSingle();
      const nom = dossier?.company_name || (profile as any).company_name || null;
      if (nom) {
        const ville = dossier?.city || dossier?.address || '';
        const trouves = await searchBusiness(nom, ville);
        const premier = Array.isArray(trouves) ? trouves[0] : null;
        if (premier?.placeId) {
          const detail = await getBusinessProfile(premier.placeId);
          if (detail) {
            fichePublique = {
              source: 'places',
              nom: detail.name,
              adresse: detail.address,
              telephone: detail.phone,
              site: detail.website,
              note: detail.rating,
              nombreAvis: detail.totalReviews,
              categorie: Array.isArray(detail.categories) ? detail.categories[0] : detail.categories,
              horaires: detail.hours,
              photos: detail.photos,
            };
            console.log(`[GoogleReviews] fiche publique servie via Places pour ${nom}`);
          }
        }
      }
    } catch (e: any) {
      console.warn('[GoogleReviews] fiche publique indisponible :', String(e?.message || e).slice(0, 160));
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      reviews: [],
      needsLocation: true,
      fiche: fichePublique,
      businessType: profile.business_type || null,
      diagnostic,
      // Le diagnostic brut reste pour NOUS (champ diagnostic), jamais dans le
      // message montré au client : le 6 août, un client connecté lisait
      // « List accounts failed: { "code": 429, "message": "Quota exceeded for
      // quota metric 'Requests'... } » en plein milieu de son tableau de bord.
      // On traduit les causes connues en une phrase qui lui dit quoi faire —
      // ou, quand il n'a rien à faire, qu'il n'a rien à faire.
      message: diagnostic.erreur
        ? messageClient(diagnostic.erreur)
        : (diagnostic.comptes === 0
          ? "Aucun compte Google Business n'est rattaché à l'adresse Google que tu as connectée. Vérifie que tu t'es connecté avec le compte qui gère la fiche."
          : 'Google Business connecté, mais aucun établissement trouvé sur ce compte. Crée/réclame ta fiche sur business.google.com, puis recharge — Théo la détectera automatiquement.'),
    });
  }

  try {
    // Le v4 exige « accounts/X/locations/Y » : on lui passe le compte stocké,
    // sans quoi il répond 404 sans dire pourquoi.
    const reviews = await getReviews(accessToken, locationId, 20, accountId);

    // Théo auto-reply flow: when the cron wakes us up with CRON_SECRET and
    // the client has google_reviews_auto_reply=true, we iterate every
    // unreplied review, classify it, generate a reply (or escalate), and
    // post it via replyToReview. When invoked by a UI user this block is
    // skipped — they'll see the raw reviews and reply manually.
    // Auto-reply piloté par le toggle Auto/Manuel du panneau (AutoModeToggle,
    // agent 'gmaps') — cohérent avec les autres agents. Auto ON par défaut ;
    // OFF seulement si le client a explicitement coupé (config.auto_mode === false).
    const { data: cfgRows } = await supabase
      .from('org_agent_configs')
      .select('config, created_at')
      .eq('user_id', user.id)
      .eq('agent_id', 'gmaps')
      .order('created_at', { ascending: false })
      .limit(1);
    const autoMode = cfgRows?.[0]?.config?.auto_mode;
    const emailNotify = cfgRows?.[0]?.config?.email_notify === true; // opt-in (stocké en jsonb, pas en colonne)
    const shouldAutoReply = autoMode !== false && req.headers.get('authorization') === `Bearer ${cronSecret}`;

    const autoReport: { replied: number; escalated: number; skipped: number; details: Array<{ name: string; action: string; reason?: string }> } = {
      replied: 0, escalated: 0, skipped: 0, details: [],
    };

    // Notif email opt-in (1 crédit/avis) : « nouvel avis + réponse envoyée ».
    const notifyReview = async (icon: string, html: string) => {
      if (!emailNotify || !profile?.email) return;
      try {
        const { deductCredits } = await import('@/lib/credits/server');
        const dc = await deductCredits(userId!, 'review_email_notify', 'Notif avis Google');
        if (!dc.success) return; // crédits insuffisants → pas d'email (silencieux)
        const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
        await sendEmailWithFallback({
          to: profile.email,
          subject: `${icon} Nouvel avis Google`,
          html,
          fromName: 'KeiroAI — Avis',
          fromEmail: 'contact@keiroai.com',
          tags: ['review_notify'],
        });
      } catch (e: any) { console.warn('[GoogleReviews] notif email failed:', e?.message); }
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

        const decision = await generateReviewReply(ctx, dossier || null, userId, supabase);

        if (decision.action === 'reply') {
          // ── Contrôle qualité avant publication ──
          //
          // Une réponse d'avis Google est PUBLIQUE et DÉFINITIVE : elle
          // s'affiche sous la fiche du commerçant, lue par tous ses futurs
          // clients, et elle ne se corrige pas. C'est la sortie la plus
          // engageante du produit, et elle partait jusqu'ici sans relecture.
          //
          // Le contrôle réécrit si la note est sous le seuil (8, plus sévère
          // qu'ailleurs) et retient s'il ne peut pas faire mieux : mieux vaut
          // pas de réponse qu'une réponse qui dessert le commerce.
          let corps = decision.body;
          try {
            const { controlerSortie } = await import('@/lib/qualite/controle-sortie');
            const q = await controlerSortie({
              agent: 'gmaps', tache: 'avis_google', contenu: corps, userId: user.id,
              contexte: `Avis ${ctx.rating}/5 de ${ctx.author} : « ${String(ctx.text).slice(0, 600)} »`,
            });
            if (!q.envoyable) {
              autoReport.details.push({ name: r.name, action: 'retenu_qualite', motif: q.defauts[0] } as any);
              await supabase.from('agent_logs').insert({
                agent: 'gmaps', action: 'review_reply_retenue', user_id: user.id, status: 'warn',
                data: { review: r.name, note: q.note, defauts: q.defauts },
                created_at: new Date().toISOString(),
              });
              continue;
            }
            corps = q.contenu;
          } catch { /* contrôle indisponible : on publie la réponse d'origine */ }

          const posted = await replyToReview(accessToken, r.name, corps).catch(() => false);
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
            await notifyReview('⭐', `<p>Nouvel avis <strong>${ctx.rating}/5</strong> de ${ctx.author} :</p><blockquote style="color:#555;border-left:3px solid #ddd;padding-left:10px">${ctx.text || '(sans texte)'}</blockquote><p>Réponse envoyée automatiquement par Théo :</p><blockquote style="color:#0a7;border-left:3px solid #0a7;padding-left:10px">${decision.body}</blockquote>`);
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
          await notifyReview('⚠️', `<p>Nouvel avis <strong>${ctx.rating}/5</strong> de ${ctx.author} — <strong>à gérer toi-même</strong> :</p><blockquote style="color:#555;border-left:3px solid #ddd;padding-left:10px">${ctx.text || '(sans texte)'}</blockquote><p>Théo l'a escaladé (${decision.reason}). Connecte-toi pour répondre.</p>`);
        }

        // Respect Google API rate limits — keep it conservative.
        await new Promise(res => setTimeout(res, 1500));
      }
    }

    // La fiche elle-même, pour que le panneau montre au client ce que Google
    // affiche de lui. Best-effort et isolé : tant que le quota GBP est à 0,
    // cet appel renvoie 429 — il ne doit jamais faire tomber les avis, qui
    // eux ont déjà été récupérés au-dessus.
    let fiche: any = null;
    try {
      const d = await getLocationDetails(accessToken, locationId);
      const adresse = d?.storefrontAddress;
      fiche = {
        nom: d?.title || profile.google_business_location_name || null,
        adresse: adresse
          ? [adresse.addressLines?.join(' '), adresse.postalCode, adresse.locality]
              .filter(Boolean).join(', ')
          : null,
        categorie: d?.categories?.primaryCategory?.displayName || null,
        telephone: d?.phoneNumbers?.primaryPhone || null,
        site: d?.websiteUri || null,
        horaires: (d?.regularHours?.periods?.length ? formaterHoraires(d.regularHours.periods) : null),
        note: reviews.length
          ? Number((reviews.reduce((s, r) => s + starRatingToNumber(r.starRating), 0) / reviews.length).toFixed(1))
          : null,
        nombreAvis: reviews.length || null,
      };
    } catch (e: any) {
      console.warn('[GoogleReviews] fiche indisponible:', String(e?.message || e).slice(0, 160));
      // On connaît au moins le nom de l'établissement, enregistré à la
      // connexion. Le montrer vaut infiniment mieux qu'un exemple : le client
      // reconnaît SON commerce et comprend que la connexion a bien marché.
      if (profile.google_business_location_name) {
        fiche = { nom: profile.google_business_location_name, partielle: true };
      }
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      location: profile.google_business_location_name,
      businessType: profile.business_type || null,
      fiche,
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

  const { review_name, reply, author, rating } = body;
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
          // L'auteur et la note viennent de l'interface : sans eux,
          // l'historique afficherait « réponse envoyée » sans dire à qui,
          // ce qui ne permet à personne de vérifier le travail.
          data: {
            review_name,
            reply: reply.substring(0, 500),
            author: author || null,
            rating: typeof rating === 'number' ? rating : null,
            auto: false,
          },
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
