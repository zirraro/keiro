import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { callGemini, callGeminiWithSearch } from '@/lib/agents/gemini';
import { writeDirective, loadContextWithAvatar } from '@/lib/agents/shared-context';
import { getBusinessDiscoveryPosts, getOwnInstagramMedia, type IgDiscoveryPost, type IgOwnMedia } from '@/lib/meta';
import { getTikTokVideos, refreshTikTokToken, type TikTokVideo } from '@/lib/tiktok';
import { saveAgentFeedback, saveLearning } from '@/lib/agents/learning';

export const runtime = 'nodejs';
export const maxDuration = 300;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyAuth(request: NextRequest): Promise<{ authorized: boolean; isCron?: boolean }> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true, isCron: true };
  }

  try {
    const { user, error } = await getAuthUser();
    if (error || !user) return { authorized: false };

    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profile?.is_admin) return { authorized: true };
  } catch {
    // Auth failed
  }

  return { authorized: false };
}

/**
 * GET /api/agents/marketing
 * Run marketing analysis — cross-channel performance review + strategic recommendations.
 * Also extracts learnings and stores them for the client-facing marketing assistant.
 */
export async function GET(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
  }

  // Multi-tenant: user_id + org_id
  const orgId = request.nextUrl.searchParams.get('org_id') || null;
  const clientUserId = request.nextUrl.searchParams.get('user_id') || null;

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();

  try {
    // Load shared context + avatar
    const { context: sharedCtx, prompt: crmContext } = await loadContextWithAvatar(supabase, 'marketing', orgId || undefined);

    // Load recent agent performance (7 days)
    const { data: recentLogs } = await supabase
      .from('agent_logs')
      .select('agent, action, status, data, created_at')
      .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    const agentPerformance = (recentLogs || []).reduce((acc: Record<string, { success: number; error: number; total: number }>, log: any) => {
      if (!acc[log.agent]) acc[log.agent] = { success: 0, error: 0, total: 0 };
      acc[log.agent].total++;
      if (log.status === 'success') acc[log.agent].success++;
      if (log.status === 'error') acc[log.agent].error++;
      return acc;
    }, {});

    const perfSummary = Object.entries(agentPerformance)
      .map(([agent, stats]) => `- ${agent}: ${stats.success}/${stats.total} succès (${stats.error} erreurs)`)
      .join('\n');

    // Load past marketing learnings for continuity
    const { data: pastLearnings } = await supabase
      .from('agent_logs')
      .select('data')
      .eq('agent', 'marketing')
      .eq('action', 'memory')
      .order('created_at', { ascending: false })
      .limit(10);

    const learningContext = (pastLearnings || [])
      .map((l: any) => `- ${l.data?.learning}`)
      .filter((l: string) => l.length > 3)
      .join('\n');

    // Load publication analytics (last 30 days)
    const { data: recentPubs } = await supabase
      .from('publication_analytics')
      .select('platform, caption, media_type, posted_at, like_count, comment_count, view_count, share_count, reach, impressions, saved, engagement_rate, hashtags, content_category')
      .gte('posted_at', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('posted_at', { ascending: false })
      .limit(50);

    let pubContext = '';
    if (recentPubs && recentPubs.length > 0) {
      const igPubs = recentPubs.filter((p: any) => p.platform === 'instagram');
      const tkPubs = recentPubs.filter((p: any) => p.platform === 'tiktok');

      const avgIgEng = igPubs.length > 0 ? (igPubs.reduce((s: number, p: any) => s + (p.engagement_rate || 0), 0) / igPubs.length).toFixed(2) : 'N/A';
      const avgTkViews = tkPubs.length > 0 ? Math.round(tkPubs.reduce((s: number, p: any) => s + (p.view_count || 0), 0) / tkPubs.length) : 'N/A';

      const topPosts = [...recentPubs].sort((a: any, b: any) => (b.engagement_rate || 0) - (a.engagement_rate || 0)).slice(0, 5);
      const topPostsSummary = topPosts.map((p: any) =>
        `  - [${p.platform}] ${(p.caption || '').substring(0, 80)}... | Eng: ${p.engagement_rate}% | Likes: ${p.like_count} | ${p.media_type} | ${p.hashtags?.slice(0, 3).join(', ') || 'no tags'}`
      ).join('\n');

      pubContext = `\nPUBLICATIONS (30 jours) :
- Instagram: ${igPubs.length} posts, engagement moyen: ${avgIgEng}%
- TikTok: ${tkPubs.length} vidéos, vues moyennes: ${avgTkViews}
- TOP 5 posts :
${topPostsSummary}`;
    }

    // Generate marketing analysis
    const analysis = await callGemini({
      system: `Tu es le CMO virtuel de KeiroAI. Tu gères TOUTE la stratégie marketing de manière quasi-autonome.

Tu analyses les performances cross-canal, tu décides des ajustements, tu donnes des ordres aux agents, et tu remontes le bilan au CEO.

TES APPRENTISSAGES sont reversés à l'assistant marketing client de KeiroAI (c'est le même cerveau). Chaque insight que tu découvres améliore les conseils donnés aux utilisateurs.

STRATÉGIE CONTENU — PLAYBOOK V2 (RÉFÉRENTIEL DE DÉCISION) :
3 piliers avec ratios stricts : P1 Avant/Après 45% · P2 Éducation 35% · P3 Social Proof 20%
Sur 6 posts/semaine : 3 P1, 2 P2, 1 P3
TikTok d'abord → recyclage Instagram si >500 vues en 4h. Sous 200 vues → hook retravaillé.
Hooks : formule [Cible] + [Problème chiffré] + [Promesse]. Hook généré EN PREMIER.
CTAs en rotation : S1 "Lien en bio", S2 "DM CONTENU", S3 "Commente ton commerce", S4 "Sauvegarde"
KPIs : TikTok watch time >60%, profil visit >5%, follower/view >1% | Insta saves >3%, clic bio >2%, DM 5+/sem
Funnel : Vidéo hook → Watch time 60%+ → Visite profil → Clic bio → Essai gratuit → Appel → Client

Vérifie que l'agent contenu respecte ces ratios et ces KPIs dans tes analyses.

STRUCTURE TA RÉPONSE :

## ANALYSE MARKETING

### Performance par canal
(Email: taux ouverture/clic/réponse, tendance — Social: engagement, reach — SEO: articles publiés — Chatbot: leads générés — DM: taux réponse)

### Performance des publications
(Instagram: engagement rate, meilleurs types de contenu, meilleurs hashtags — TikTok: vues, likes, partages — Patterns qui marchent vs qui floppent — Meilleurs jours/heures de publication)
Vérifie le respect du ratio P1/P2/P3 (45/35/20). Si déséquilibre, ordonne à l'agent contenu de corriger.

### Timing & Fréquences optimales
(Meilleurs jours/heures par canal, fréquence recommandée cette semaine)

### Funnel Analysis
(Vidéo hook → Watch time → Profil → Bio → Essai → Client — où sont les fuites ? Quel KPI est sous la cible ?)

### Segments qui convertissent
(Types de commerce, zones, angles qui marchent le mieux)

### Contenu qui performe
(Analyse des TOP posts — qu'est-ce qui les rend performants ? Quel pilier ? Quel type de hook ? Caption style, hashtags, type de média, heure de publication. Recommandations concrètes.)

### A/B Tests en cours
(Ce qu'on teste, résultats intermédiaires, conclusion si >3 jours de data)

### Recommandations produit
(Features KeiroAI à améliorer basées sur les données marketing)

### Apprentissages
Utilise "J'ai appris: [insight]" pour chaque découverte importante.
Ces apprentissages améliorent l'assistant marketing client.

## ORDRES
(Actions à transmettre aux autres agents avec [Agent] tag)

## BRIEF CEO
(5 lignes max — ce que le CEO doit savoir)

Réponds en français, sois data-driven et actionnable.`,
      message: `Analyse complète des performances marketing.

DONNÉES CRM :
${crmContext}

PERFORMANCE DES AGENTS (7 derniers jours) :
${perfSummary || 'Aucune donnée disponible'}
${pubContext}

MES APPRENTISSAGES PASSÉS :
${learningContext || 'Aucun apprentissage encore enregistré — c\'est le premier run.'}

Date : ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      maxTokens: 4000,
    });

    // Extract learnings from the analysis and save them
    const learningPatterns = [
      /(?:j'ai appris|je retiens|apprentissage|insight|observation)\s*:\s*(.+)/gi,
      /(?:à retenir|leçon|découverte)\s*:\s*(.+)/gi,
      /🧠\s*(.+)/g,
    ];

    let learningsExtracted = 0;
    for (const pattern of learningPatterns) {
      let match;
      while ((match = pattern.exec(analysis)) !== null) {
        const learning = match[1].trim();
        if (learning.length > 10) {
          await supabase.from('agent_logs').insert({
            agent: 'marketing',
            action: 'memory',
            data: { learning, source: 'auto_analysis', learned_at: nowISO },
            created_at: nowISO,
          });
          learningsExtracted++;
          console.log(`[MarketingAgent] Learned: ${learning.substring(0, 80)}`);
        }
      }
    }

    // Log the analysis
    await supabase.from('agent_logs').insert({
      agent: 'marketing',
      action: 'weekly_analysis',
      data: {
        analysis,
        agent_performance: agentPerformance,
        learnings_extracted: learningsExtracted,
        crm_snapshot: {
          total: sharedCtx.crmStats.total,
          hot: sharedCtx.crmStats.hot,
          warm: sharedCtx.crmStats.warm,
          clients: sharedCtx.crmStats.clients,
        },
      },
      status: 'success',
      created_at: nowISO,
    });

    // ── Feedback to CEO ──
    try {
      await saveAgentFeedback(supabase, {
        from_agent: 'marketing',
        to_agent: 'ceo',
        feedback: `Analyse marketing: ${learningsExtracted} apprentissages extraits. CRM: ${sharedCtx.crmStats.total} prospects (${sharedCtx.crmStats.hot} hot, ${sharedCtx.crmStats.warm} warm, ${sharedCtx.crmStats.clients} clients). Recommandation intégrée dans l'analyse.`,
        category: 'content',
      }, orgId);
    } catch (fbErr: any) {
      console.warn('[MarketingAgent] Feedback save error:', fbErr.message);
    }

    return NextResponse.json({
      ok: true,
      analysis,
      agent_performance: agentPerformance,
      learnings_extracted: learningsExtracted,
    });
  } catch (error: any) {
    console.error('[MarketingAgent] Error:', error);

    await supabase.from('agent_logs').insert({
      agent: 'marketing',
      action: 'weekly_analysis',
      data: { error: error.message },
      status: 'error',
      error_message: error.message,
      created_at: nowISO,
    });

    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/agents/marketing
 * Community management actions: find follow targets, engagement strategy.
 */
/**
 * Auto-learn from marketing performance.
 * Analyzes recent agent_logs for marketing actions, identifies what works,
 * and saves structured learnings with confidence scores.
 */
async function autoLearnMarketing(supabase: any, orgId?: string | null) {
  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch recent marketing logs (actions + publication analytics)
    const { data: recentLogs } = await supabase
      .from('agent_logs')
      .select('action, data, status, created_at')
      .eq('agent', 'marketing')
      .gte('created_at', twoWeeksAgo)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!recentLogs || recentLogs.length < 3) return; // Need enough data

    // ── 1. Content topic/type engagement analysis ──
    const { data: pubData } = await supabase
      .from('publication_analytics')
      .select('platform, media_type, engagement_rate, like_count, comment_count, view_count, hashtags, caption')
      .gte('posted_at', twoWeeksAgo)
      .order('engagement_rate', { ascending: false })
      .limit(50);

    if (pubData && pubData.length >= 3) {
      // Group by media type
      const byType: Record<string, { count: number; totalEng: number }> = {};
      for (const p of pubData) {
        const t = p.media_type || 'UNKNOWN';
        if (!byType[t]) byType[t] = { count: 0, totalEng: 0 };
        byType[t].count++;
        byType[t].totalEng += p.engagement_rate || 0;
      }

      const bestType = Object.entries(byType)
        .filter(([, s]) => s.count >= 2)
        .sort((a, b) => (b[1].totalEng / b[1].count) - (a[1].totalEng / a[1].count))[0];

      if (bestType) {
        const avgEng = (bestType[1].totalEng / bestType[1].count).toFixed(2);
        await saveLearning(supabase, {
          agent: 'marketing',
          category: 'content',
          learning: `Le format ${bestType[0]} a le meilleur engagement moyen (${avgEng}%) sur ${bestType[1].count} publications des 14 derniers jours.`,
          evidence: `${pubData.length} publications analysées. ${bestType[0]}: ${bestType[1].count} posts, eng moy ${avgEng}%.`,
          confidence: Math.min(30, 10 + bestType[1].count * 3),
          orgId: orgId || undefined,
        });
      }

      // ── 2. Platform-specific strategy insights ──
      const byPlatform: Record<string, { count: number; totalEng: number; topCaption: string }> = {};
      for (const p of pubData) {
        const plat = p.platform || 'unknown';
        if (!byPlatform[plat]) byPlatform[plat] = { count: 0, totalEng: 0, topCaption: '' };
        byPlatform[plat].count++;
        byPlatform[plat].totalEng += p.engagement_rate || 0;
        if ((p.engagement_rate || 0) > (byPlatform[plat].totalEng / byPlatform[plat].count)) {
          byPlatform[plat].topCaption = (p.caption || '').substring(0, 120);
        }
      }

      for (const [platform, stats] of Object.entries(byPlatform)) {
        if (stats.count < 2) continue;
        const avgEng = (stats.totalEng / stats.count).toFixed(2);
        await saveLearning(supabase, {
          agent: 'marketing',
          category: 'content',
          learning: `${platform}: engagement moyen ${avgEng}% sur ${stats.count} posts (14j). Top caption style: "${stats.topCaption.substring(0, 60)}..."`,
          evidence: `Agrégé sur ${stats.count} publications ${platform}.`,
          confidence: Math.min(25, 10 + stats.count * 2),
          orgId: orgId || undefined,
        });
      }
    }

    // ── 3. Campaign/action performance trends ──
    const actionCounts: Record<string, { total: number; success: number }> = {};
    for (const log of recentLogs) {
      const a = log.action;
      if (!actionCounts[a]) actionCounts[a] = { total: 0, success: 0 };
      actionCounts[a].total++;
      if (log.status === 'success') actionCounts[a].success++;
    }

    const actionSummary = Object.entries(actionCounts)
      .filter(([, s]) => s.total >= 2)
      .map(([action, s]) => `${action}: ${s.success}/${s.total} succès`)
      .join(', ');

    if (actionSummary) {
      await saveLearning(supabase, {
        agent: 'marketing',
        category: 'general',
        learning: `Tendances marketing (14j): ${actionSummary}. Focus sur les actions à haut taux de succès.`,
        evidence: `${recentLogs.length} logs marketing analysés.`,
        confidence: 15,
      }, orgId);
    }

    console.log('[Marketing] autoLearnMarketing completed');
  } catch (e: any) {
    console.error('[Marketing] autoLearnMarketing error:', e.message);
  }
}

export async function POST(request: NextRequest) {
  const { authorized } = await verifyAuth(request);
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY non configurée' }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const nowISO = new Date().toISOString();

  try {
    const body = await request.json().catch(() => ({}));

    // Optional org_id passthrough for multi-tenant support
    const orgId = body?.org_id || null;

    switch (body.action) {
      case 'find_follow_targets': {
        // Use Google Search to find relevant accounts to follow
        const platform = body.platform || 'instagram';
        const niche = body.niche || 'commerces locaux, restaurants, boutiques, coachs, PME France';
        const count = Math.min(body.count || 15, 20);

        // Search for relevant accounts via Gemini + Google grounding
        const searchResult = await callGeminiWithSearch({
          system: `Tu es un community manager elite pour KeiroAI (outil IA de création de contenu pour commerces locaux en France).

TON OBJECTIF : trouver des comptes ${platform} pertinents à suivre pour augmenter la visibilité de KeiroAI.

CIBLES IDÉALES :
- Commerces locaux français (restaurants, boutiques, coiffeurs, fleuristes, coachs, etc.)
- PME françaises actives sur ${platform}
- Comptes entre 500 et 50K followers (ni trop gros ni trop petits)
- Comptes qui publient régulièrement (actifs dans les 2 dernières semaines)
- Comptes dans les niches : food, mode, beauté, bien-être, coaching, artisanat

STRATÉGIE FOLLOW-BACK :
- Les petits comptes (< 10K) follow back ~30-40% du temps
- Les comptes qui suivent beaucoup de monde follow back plus souvent
- Cibler des comptes qui like/commentent activement = plus de visibilité
- Mélanger géographiquement (Paris, Lyon, Marseille, Bordeaux, Lille, Nantes, etc.)

EXCLURE :
- Comptes personnels sans rapport business
- Comptes de grandes marques (> 100K followers)
- Comptes inactifs
- Comptes spam/fake

Retourne UNIQUEMENT un tableau JSON :
[
  { "handle": "@xxx", "name": "Nom du commerce", "type": "restaurant|boutique|coach|coiffeur|fleuriste|autre", "city": "Ville", "followers_estimate": "~2K", "reason": "Pourquoi le suivre", "priority": 1-3 }
]

Trouve ${count} comptes. UNIQUEMENT du JSON, pas de markdown.`,
          message: `Recherche ${count} comptes ${platform} français à suivre pour KeiroAI.
Niches ciblées : ${niche}
Objectif : follow stratégique pour maximiser les follow-back et la visibilité.
Cherche des comptes actifs, variés géographiquement, dans la niche commerces locaux / PME.`,
          maxTokens: 4000,
        });

        // Parse results
        let targets: any[] = [];
        try {
          const cleanText = searchResult.replace(/```[\w]*\s*/g, '').trim();
          const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            targets = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.error('[Marketing] Failed to parse follow targets:', e);
        }

        // Store in dm_queue with channel 'follow_instagram' or 'follow_tiktok'
        const channel = `follow_${platform}`;
        let inserted = 0;

        for (const target of targets) {
          if (!target.handle) continue;
          const handle = target.handle.replace(/^@/, '');

          // Check if already in queue
          const { data: existing } = await supabase
            .from('dm_queue')
            .select('id')
            .eq('channel', channel)
            .eq('handle', handle)
            .limit(1);

          if (existing && existing.length > 0) continue;

          // Also check if already a CRM prospect
          const { data: existingProspect } = await supabase
            .from('crm_prospects')
            .select('id')
            .eq('instagram', handle)
            .limit(1);

          // If not in CRM, create a prospect entry
          let prospectId = existingProspect?.[0]?.id || null;
          if (!prospectId && target.name) {
            const { data: newProspect } = await supabase
              .from('crm_prospects')
              .insert({
                company: target.name,
                type: target.type || null,
                quartier: target.city || null,
                instagram: handle,
                status: 'identifie',
                temperature: 'cold',
                source: platform === 'tiktok' ? 'tiktok' : 'dm_instagram',
                source_agent: 'marketing',
                created_at: nowISO,
                updated_at: nowISO,
              })
              .select('id')
              .single();
            if (newProspect) {
              prospectId = newProspect.id;
              await supabase.from('crm_activities').insert({
                prospect_id: newProspect.id,
                type: 'prospect_discovered',
                description: `Nouveau prospect via ${platform}: ${target.name || handle}`,
                data: { action: 'follow_target_discovered', company: target.name, handle, platform, type: target.type, city: target.city, agent: 'marketing' },
                created_at: nowISO,
              });
            }
          }

          await supabase.from('dm_queue').insert({
            channel,
            handle,
            message: `Follow @${handle} — ${target.name || ''}`,
            personalization: JSON.stringify({
              name: target.name,
              type: target.type,
              city: target.city,
              followers: target.followers_estimate,
              reason: target.reason,
              priority: target.priority,
              already_prospect: !!(existingProspect && existingProspect.length > 0),
            }),
            status: 'pending',
            priority: target.priority || 2,
            prospect_id: prospectId,
          });
          inserted++;
        }

        // Log
        await supabase.from('agent_logs').insert({
          agent: 'community',
          action: 'find_follow_targets',
          data: {
            platform,
            targets_found: targets.length,
            targets_inserted: inserted,
            targets_skipped: targets.length - inserted,
          },
          status: 'success',
          created_at: nowISO,
        });

        return NextResponse.json({
          ok: true,
          targets_found: targets.length,
          targets_inserted: inserted,
          targets,
        });
      }

      case 'engagement_plan': {
        // Generate a daily engagement plan (comments, likes strategy)
        const { prompt: crmContext } = await loadContextWithAvatar(supabase, 'marketing', orgId || undefined);

        const plan = await callGemini({
          system: `Tu es le community manager elite de KeiroAI. Tu crées des plans d'engagement quotidiens.

OBJECTIF : maximiser la visibilité organique via des interactions authentiques et stratégiques.

PLAN D'ENGAGEMENT QUOTIDIEN :
1. Comptes à liker (10-15 posts par jour, variés)
2. Commentaires à laisser (5-8, pertinents et authentiques, PAS de spam)
3. Stories à regarder (comptes de prospects chauds)
4. Hashtags à explorer et engager
5. Heures optimales d'engagement

RÈGLES :
- Commentaires TOUJOURS pertinents, jamais génériques
- Liker des posts récents (< 24h)
- Prioriser les prospects CRM chauds/warm
- Varier les types d'engagement pour éviter les flags Instagram
- Rester humain et authentique

Retourne en JSON :
{
  "daily_likes_target": 15,
  "daily_comments_target": 8,
  "priority_accounts": ["@xxx"],
  "hashtags_to_explore": ["#xxx"],
  "optimal_times": ["9h", "12h", "18h"],
  "comment_templates": ["Exemple de commentaire contextuel..."],
  "engagement_notes": "Notes stratégiques du jour"
}`,
          message: `Génère le plan d'engagement du jour.\n\nContexte CRM:\n${crmContext}`,
          maxTokens: 2000,
        });

        // Parse and store
        let engagementPlan: any = null;
        try {
          const cleanText = plan.replace(/```[\w]*\s*/g, '').trim();
          const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
          if (jsonMatch) engagementPlan = JSON.parse(jsonMatch[0]);
        } catch { /* best effort */ }

        await supabase.from('agent_logs').insert({
          agent: 'marketing',
          action: 'engagement_plan',
          data: engagementPlan || { raw: plan.substring(0, 2000) },
          status: 'success',
          created_at: nowISO,
        });

        return NextResponse.json({ ok: true, plan: engagementPlan || plan });
      }

      case 'prepare_comments': {
        // Fetch real posts from prospects' Instagram accounts, generate contextual comments
        // Cap at 20 to avoid timeout (each prospect = 1 API call + DB queries ~3-5s)
        const maxProspects = Math.min(body.count || 10, 20);

        // Get admin's Instagram credentials for Business Discovery API
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('instagram_business_account_id, facebook_page_access_token')
          .eq('is_admin', true)
          .single();

        if (!adminProfile?.instagram_business_account_id || !adminProfile?.facebook_page_access_token) {
          return NextResponse.json({ ok: false, error: 'Instagram non connecte — connecte Instagram dans la Galerie' }, { status: 400 });
        }

        const igUserId = adminProfile.instagram_business_account_id;
        const pageToken = adminProfile.facebook_page_access_token;

        // Get prospects with Instagram handles, prioritize hot/warm
        const { data: prospects } = await supabase
          .from('crm_prospects')
          .select('id, company, type, quartier, instagram, temperature, score')
          .not('instagram', 'is', null)
          .not('instagram', 'eq', '')
          .not('temperature', 'eq', 'dead')
          .order('score', { ascending: false })
          .limit(maxProspects * 2); // fetch more to account for failures

        if (!prospects || prospects.length === 0) {
          return NextResponse.json({ ok: false, error: 'Aucun prospect avec Instagram' }, { status: 404 });
        }

        // Fetch recent posts for each prospect via Business Discovery
        const allPostsWithContext: Array<{
          prospect: typeof prospects[0];
          post: IgDiscoveryPost;
        }> = [];

        let fetchErrors = 0;
        for (const prospect of prospects.slice(0, maxProspects)) {
          if (!prospect.instagram) continue;
          try {
            const { posts } = await getBusinessDiscoveryPosts(igUserId, pageToken, prospect.instagram, 3);
            // Only take posts from the last 7 days
            const recentPosts = posts.filter(p => {
              if (!p.timestamp) return true;
              const postDate = new Date(p.timestamp);
              return (Date.now() - postDate.getTime()) < 7 * 24 * 60 * 60 * 1000;
            });
            // Take the most recent post
            if (recentPosts.length > 0) {
              allPostsWithContext.push({ prospect, post: recentPosts[0] });
            }
          } catch (e: any) {
            fetchErrors++;
            console.warn(`[Marketing] Business Discovery failed for @${prospect.instagram}:`, e.message?.substring(0, 100));
          }
        }

        if (allPostsWithContext.length === 0) {
          return NextResponse.json({
            ok: false,
            error: `Aucun post recent trouve (${fetchErrors} erreurs API). Les comptes sont peut-etre prives.`,
          }, { status: 404 });
        }

        // Generate comments via AI — batch all posts in one call
        const postsForAI = allPostsWithContext.map((item, i) => {
          const p = item.post;
          return `POST ${i + 1}:
- Compte: @${item.prospect.instagram} (${item.prospect.company || 'commerce'}, ${item.prospect.type || 'inconnu'}, ${item.prospect.quartier || ''})
- Caption du post: "${(p.caption || '').substring(0, 300)}"
- Type: ${p.media_type || 'IMAGE'}
- Likes: ${p.like_count || '?'} | Commentaires: ${p.comments_count || '?'}
- Lien: ${p.permalink || 'N/A'}
- Temperature prospect: ${item.prospect.temperature || 'cold'} (score: ${item.prospect.score || 0})`;
        }).join('\n\n');

        const commentsRaw = await callGemini({
          system: `Tu es Victor, community manager elite de KeiroAI (outil IA de creation de contenu pour commerces locaux).

TON OBJECTIF : ecrire des commentaires Instagram qui :
1. Sont 100% PERTINENTS au contenu du post (tu reagis a CE QUE TU VOIS/LIS)
2. Sont authentiques et humains (pas de spam, pas de "super post!")
3. Creent une connexion avec le commerce (ils doivent sentir qu'un vrai humain s'interesse)
4. Subtilement positionnent KeiroAI sans etre commercial (juste si c'est naturel)

REGLES STRICTES :
- TUTOIEMENT toujours
- 1-3 phrases max par commentaire
- Reagis au CONTENU SPECIFIQUE du post (un plat, un produit, une deco, un service)
- Sois precis : "ce risotto a l'air dingue" > "belle photo"
- Ajoute de la valeur : un compliment precis, une question pertinente, ou un encouragement
- Pour les prospects chauds (score > 40) : sois plus engageant, pose une question
- Pour les prospects froids : reste casual et authentique
- JAMAIS de lien, JAMAIS de pitch, JAMAIS "contactez-nous"
- 1-2 emojis max, naturels
- Varie le style : parfois question, parfois compliment, parfois observation

Retourne un tableau JSON :
[
  { "index": 1, "comment": "Le commentaire contextuel", "strategy_note": "Pourquoi ce commentaire" }
]

UNIQUEMENT du JSON, pas de markdown.`,
          message: `Genere un commentaire elite et contextuel pour chacun de ces ${allPostsWithContext.length} posts Instagram :\n\n${postsForAI}`,
          maxTokens: 3000,
        });

        // Parse comments
        let comments: Array<{ index: number; comment: string; strategy_note?: string }> = [];
        try {
          const cleanText = commentsRaw.replace(/```[\w]*\s*/g, '').trim();
          const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
          if (jsonMatch) comments = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error('[Marketing] Failed to parse comments:', e);
        }

        // Store each comment in dm_queue for the admin to review and post
        let inserted = 0;
        for (let i = 0; i < allPostsWithContext.length; i++) {
          const item = allPostsWithContext[i];
          const aiComment = comments.find(c => c.index === i + 1);
          if (!aiComment?.comment) continue;

          // Check if we already have a comment for this post
          const postPermalink = item.post.permalink || '';
          if (postPermalink) {
            const { data: existing } = await supabase
              .from('dm_queue')
              .select('id')
              .eq('channel', 'comment_instagram')
              .eq('handle', item.prospect.instagram || '')
              .ilike('message', `%${postPermalink}%`)
              .limit(1);
            if (existing && existing.length > 0) continue;
          }

          await supabase.from('dm_queue').insert({
            channel: 'comment_instagram',
            handle: item.prospect.instagram || '',
            message: aiComment.comment,
            followup_message: null,
            personalization: JSON.stringify({
              post_caption: (item.post.caption || '').substring(0, 200),
              post_permalink: item.post.permalink,
              post_media_url: item.post.media_url,
              post_likes: item.post.like_count,
              post_comments: item.post.comments_count,
              strategy_note: aiComment.strategy_note,
              prospect_company: item.prospect.company,
              prospect_type: item.prospect.type,
              prospect_temperature: item.prospect.temperature,
            }),
            status: 'pending',
            priority: (item.prospect.score || 0) > 40 ? 3 : 2,
            prospect_id: item.prospect.id,
          });
          inserted++;

          // Log to crm_activities for CRM visibility
          if (item.prospect.id) {
            await supabase.from('crm_activities').insert({
              prospect_id: item.prospect.id,
              type: 'comment_prepared',
              description: `Commentaire IG préparé: "${aiComment.comment.substring(0, 80)}..."`,
              data: { action: 'comment_prepared', comment: aiComment.comment, post_permalink: item.post.permalink, post_caption: (item.post.caption || '').substring(0, 100), agent: 'marketing' },
              created_at: nowISO,
            });
          }
        }

        await supabase.from('agent_logs').insert({
          agent: 'community',
          action: 'prepare_comments',
          data: {
            prospects_checked: Math.min(prospects.length, maxProspects),
            posts_found: allPostsWithContext.length,
            comments_generated: comments.length,
            comments_inserted: inserted,
            fetch_errors: fetchErrors,
          },
          status: 'success',
          created_at: nowISO,
        });

        return NextResponse.json({
          ok: true,
          posts_found: allPostsWithContext.length,
          comments_generated: comments.length,
          comments_inserted: inserted,
          fetch_errors: fetchErrors,
        });
      }

      case 'advise_agents': {
        // Marketing advisor: analyze performance, generate strategic advice for each agent
        const { prompt: crmContext } = await loadContextWithAvatar(supabase, 'marketing', orgId || undefined);

        // Load all agent learnings (deep history)
        const { data: allLearnings } = await supabase
          .from('agent_logs')
          .select('agent, data, created_at')
          .eq('action', 'memory')
          .order('created_at', { ascending: false })
          .limit(30);

        const learningHistory = (allLearnings || [])
          .map((l: any) => `[${l.agent}] ${l.data?.learning} (${new Date(l.created_at).toLocaleDateString('fr-FR')})`)
          .join('\n');

        // Load recent performance per agent (last 7 days)
        const { data: recentPerf } = await supabase
          .from('agent_logs')
          .select('agent, action, data, created_at')
          .in('action', ['daily_cold', 'daily_warm', 'daily_preparation', 'enrichment_run', 'prepare_comments', 'find_follow_targets', 'weekly_analysis'])
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(50);

        const perfByAgent: Record<string, string[]> = {};
        for (const log of recentPerf || []) {
          if (!perfByAgent[log.agent]) perfByAgent[log.agent] = [];
          const d = log.data;
          let summary = `${log.action}`;
          if (d?.success !== undefined) summary += `: ${d.success} OK, ${d.failed || 0} fails`;
          if (d?.enriched !== undefined) summary += `: ${d.enriched} enrichis`;
          if (d?.prepared !== undefined) summary += `: ${d.prepared} préparés`;
          if (d?.comments_inserted !== undefined) summary += `: ${d.comments_inserted} comments`;
          if (d?.targets_inserted !== undefined) summary += `: ${d.targets_inserted} follows`;
          perfByAgent[log.agent].push(summary);
        }

        const perfSummary = Object.entries(perfByAgent)
          .map(([agent, logs]) => `${agent.toUpperCase()}:\n${logs.slice(0, 5).map(l => `  - ${l}`).join('\n')}`)
          .join('\n\n');

        const adviceRaw = await callGemini({
          system: `Tu es le CMO/Directeur Marketing de KeiroAI. Tu as accumulé de l'expérience en analysant les performances de tous les agents.

TON RÔLE : analyser les performances, identifier ce qui marche/ne marche pas, et émettre des DIRECTIVES STRATÉGIQUES pour chaque agent.

TES DIRECTIVES sont exécutées automatiquement par les agents. Sois précis et actionnable.

STRUCTURE DE RÉPONSE (JSON) :
{
  "overall_assessment": "Évaluation globale en 2-3 phrases",
  "learnings": [
    "J'ai appris: [insight stratégique basé sur les données]",
    "J'ai appris: [deuxième insight]"
  ],
  "agent_directives": {
    "email": {
      "assessment": "Performance email en 1 phrase",
      "directive": "Action concrète à prendre",
      "priority": "haute|moyenne|basse"
    },
    "dm_instagram": {
      "assessment": "Performance DM en 1 phrase",
      "directive": "Action concrète",
      "priority": "haute|moyenne|basse"
    },
    "commercial": {
      "assessment": "Performance commercial en 1 phrase",
      "directive": "Action concrète",
      "priority": "haute|moyenne|basse"
    },
    "seo": {
      "assessment": "Performance SEO en 1 phrase",
      "directive": "Action concrète",
      "priority": "haute|moyenne|basse"
    },
    "content": {
      "assessment": "Performance contenu en 1 phrase",
      "directive": "Action concrète",
      "priority": "haute|moyenne|basse"
    }
  },
  "admin_brief": "Brief pour l'admin en 5 lignes max — insights clés + recommandations produit",
  "client_insights": [
    "Conseil pour les clients basé sur ton expérience: [insight]"
  ]
}

UNIQUEMENT du JSON valide, pas de markdown.`,
          message: `Analyse les performances et émets tes directives stratégiques.

DONNÉES CRM :
${crmContext}

HISTORIQUE DES APPRENTISSAGES :
${learningHistory || 'Premier run — pas encore d\'apprentissages.'}

PERFORMANCES RÉCENTES PAR AGENT (7 jours) :
${perfSummary || 'Pas de données de performance disponibles.'}

Date : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
          maxTokens: 4000,
        });

        // Parse advice
        let advice: any = null;
        try {
          const cleanText = adviceRaw.replace(/```[\w]*\s*/g, '').trim();
          const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
          if (jsonMatch) advice = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error('[Marketing] Failed to parse advice:', e);
        }

        if (advice) {
          // Save learnings
          if (advice.learnings) {
            for (const learning of advice.learnings) {
              if (learning && learning.length > 10) {
                await supabase.from('agent_logs').insert({
                  agent: 'marketing',
                  action: 'memory',
                  data: { learning, source: 'advise_agents', learned_at: nowISO },
                  created_at: nowISO,
                });
              }
            }
          }

          // Issue directives to each agent
          if (advice.agent_directives) {
            for (const [agent, dir] of Object.entries(advice.agent_directives) as [string, any][]) {
              if (dir?.directive) {
                await writeDirective(supabase, 'marketing', agent, 'strategy', dir.directive, dir.priority || 'moyenne');
                console.log(`[Marketing] Directive → ${agent}: ${dir.directive.substring(0, 80)}`);
              }
            }
          }

          // Save client insights for the marketing assistant chatbot
          if (advice.client_insights && advice.client_insights.length > 0) {
            await supabase.from('agent_logs').insert({
              agent: 'marketing',
              action: 'client_insights',
              data: { insights: advice.client_insights, source: 'advise_agents' },
              created_at: nowISO,
            });
          }
        }

        // Log
        await supabase.from('agent_logs').insert({
          agent: 'marketing',
          action: 'advise_agents',
          data: {
            advice: advice || { raw: adviceRaw.substring(0, 2000) },
            directives_issued: advice?.agent_directives ? Object.keys(advice.agent_directives).length : 0,
            learnings_saved: advice?.learnings?.length || 0,
          },
          status: 'success',
          created_at: nowISO,
        });

        // Report to CEO
        await supabase.from('agent_logs').insert({
          agent: 'marketing',
          action: 'report_to_ceo',
          data: {
            phase: 'completed',
            message: `Marketing Advisor: ${advice?.agent_directives ? Object.keys(advice.agent_directives).length : 0} directives émises, ${advice?.learnings?.length || 0} apprentissages. Brief: ${advice?.admin_brief?.substring(0, 200) || 'N/A'}`,
          },
          created_at: nowISO,
        });

        // Auto-learn from recent marketing performance
        await autoLearnMarketing(supabase);

        return NextResponse.json({
          ok: true,
          advice: advice || adviceRaw.substring(0, 2000),
          directives_issued: advice?.agent_directives ? Object.keys(advice.agent_directives).length : 0,
        });
      }

      case 'sync_publication_analytics': {
        // Sync engagement data from Instagram Graph API + TikTok API into publication_analytics
        const startTime = Date.now();

        // Get admin profile with Instagram + TikTok tokens
        const { data: adminProf } = await supabase
          .from('profiles')
          .select('id, instagram_business_account_id, facebook_page_access_token, instagram_access_token, tiktok_access_token, tiktok_refresh_token, tiktok_user_id')
          .eq('is_admin', true)
          .single();

        if (!adminProf) {
          return NextResponse.json({ ok: false, error: 'Profil admin introuvable' }, { status: 404 });
        }

        let igSynced = 0;
        let tkSynced = 0;
        const errors: string[] = [];

        // ── Instagram sync ──
        if (adminProf.instagram_business_account_id && (adminProf.facebook_page_access_token || adminProf.instagram_access_token)) {
          try {
            const token = adminProf.facebook_page_access_token || adminProf.instagram_access_token!;
            const igMedia = await getOwnInstagramMedia(adminProf.instagram_business_account_id, token, 25);

            for (const post of igMedia) {
              if (!post.id) continue;

              // Extract hashtags from caption
              const hashtags = (post.caption || '').match(/#\w+/g) || [];
              const totalEngagement = (post.like_count || 0) + (post.comments_count || 0) + (post.saved || 0);
              const engRate = post.reach && post.reach > 0 ? parseFloat(((totalEngagement / post.reach) * 100).toFixed(2)) : 0;

              // Upsert into publication_analytics
              await supabase.from('publication_analytics').upsert({
                user_id: adminProf.id,
                platform: 'instagram',
                post_id: post.id,
                caption: (post.caption || '').substring(0, 2000),
                media_type: post.media_type || 'IMAGE',
                posted_at: post.timestamp || nowISO,
                like_count: post.like_count || 0,
                comment_count: post.comments_count || 0,
                view_count: 0,
                share_count: 0,
                reach: post.reach || 0,
                impressions: post.impressions || 0,
                saved: post.saved || 0,
                engagement_rate: engRate,
                hashtags,
                synced_at: nowISO,
              }, { onConflict: 'post_id' }).select('id').single();

              // Also update instagram_posts table
              await supabase.from('instagram_posts').update({
                like_count: post.like_count || 0,
                comments_count: post.comments_count || 0,
                impressions: post.impressions || 0,
                reach: post.reach || 0,
                saved: post.saved || 0,
                analytics_synced_at: nowISO,
              }).eq('id', post.id);

              igSynced++;
            }

            // Cross-reference with content_calendar to enrich with content characteristics
            const { data: calendarPosts } = await supabase
              .from('content_calendar')
              .select('id, pillar, format, hook, visual_description, instagram_permalink')
              .eq('status', 'published')
              .eq('platform', 'instagram')
              .not('instagram_permalink', 'is', null)
              .order('published_at', { ascending: false })
              .limit(50);

            if (calendarPosts) {
              for (const cp of calendarPosts) {
                if (!cp.instagram_permalink) continue;
                // Find matching publication_analytics entry
                const matchingPub = igMedia.find((p: any) => p.permalink === cp.instagram_permalink);
                if (matchingPub) {
                  // Enrich publication_analytics with content characteristics
                  await supabase.from('publication_analytics').update({
                    content_category: cp.pillar || null,
                    ai_analysis: {
                      pillar: cp.pillar,
                      format: cp.format,
                      hook_text: cp.hook?.substring(0, 200),
                      visual_style: cp.visual_description?.substring(0, 200),
                      enriched_at: nowISO,
                    },
                  }).eq('post_id', matchingPub.id);
                }
              }
              console.log(`[Marketing] Enriched ${calendarPosts.length} posts with content characteristics`);
            }
          } catch (e: any) {
            errors.push(`Instagram: ${e.message?.substring(0, 100)}`);
            console.error('[Marketing] Instagram sync error:', e.message);
          }
        }

        // ── TikTok sync ──
        if (adminProf.tiktok_access_token) {
          try {
            let tkToken = adminProf.tiktok_access_token;

            // Try refresh if needed
            if (adminProf.tiktok_refresh_token && process.env.TIKTOK_CLIENT_KEY) {
              try {
                const refreshed = await refreshTikTokToken(adminProf.tiktok_refresh_token, process.env.TIKTOK_CLIENT_KEY);
                tkToken = refreshed.access_token;
                // Save refreshed token
                await supabase.from('profiles').update({
                  tiktok_access_token: refreshed.access_token,
                  tiktok_refresh_token: refreshed.refresh_token || adminProf.tiktok_refresh_token,
                }).eq('id', adminProf.id);
              } catch {
                // Use existing token if refresh fails
              }
            }

            const tkVideos = await getTikTokVideos(tkToken, 20);

            for (const video of tkVideos) {
              if (!video.id) continue;

              const hashtags = (video.video_description || video.title || '').match(/#\w+/g) || [];
              const totalEngagement = (video.like_count || 0) + (video.comment_count || 0) + (video.share_count || 0);
              const engRate = video.view_count && video.view_count > 0
                ? parseFloat(((totalEngagement / video.view_count) * 100).toFixed(2))
                : 0;

              await supabase.from('publication_analytics').upsert({
                user_id: adminProf.id,
                platform: 'tiktok',
                post_id: video.id,
                caption: (video.video_description || video.title || '').substring(0, 2000),
                media_type: 'VIDEO',
                posted_at: video.create_time ? new Date(video.create_time * 1000).toISOString() : nowISO,
                like_count: video.like_count || 0,
                comment_count: video.comment_count || 0,
                view_count: video.view_count || 0,
                share_count: video.share_count || 0,
                reach: 0,
                impressions: 0,
                saved: 0,
                engagement_rate: engRate,
                hashtags,
                synced_at: nowISO,
              }, { onConflict: 'post_id' }).select('id').single();

              // Also update tiktok_posts table
              await supabase.from('tiktok_posts').update({
                view_count: video.view_count || 0,
                like_count: video.like_count || 0,
                comment_count: video.comment_count || 0,
                share_count: video.share_count || 0,
                analytics_synced_at: nowISO,
              }).eq('id', video.id);

              tkSynced++;
            }
          } catch (e: any) {
            errors.push(`TikTok: ${e.message?.substring(0, 100)}`);
            console.error('[Marketing] TikTok sync error:', e.message);
          }
        }

        const duration = Date.now() - startTime;

        await supabase.from('agent_logs').insert({
          agent: 'marketing',
          action: 'sync_publication_analytics',
          data: {
            instagram_synced: igSynced,
            tiktok_synced: tkSynced,
            errors: errors.length > 0 ? errors : undefined,
            duration_ms: duration,
          },
          status: errors.length > 0 && igSynced === 0 && tkSynced === 0 ? 'error' : 'success',
          created_at: nowISO,
        });

        return NextResponse.json({
          ok: true,
          instagram_synced: igSynced,
          tiktok_synced: tkSynced,
          errors: errors.length > 0 ? errors : undefined,
          duration_ms: duration,
        });
      }

      case 'analyze_publications': {
        // AI-powered analysis of publication performance patterns
        const daysBack = body.days || 30;
        const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

        const { data: pubs } = await supabase
          .from('publication_analytics')
          .select('*')
          .gte('posted_at', since)
          .order('posted_at', { ascending: false })
          .limit(100);

        if (!pubs || pubs.length === 0) {
          return NextResponse.json({ ok: false, error: 'Aucune publication trouvée. Lancez sync_publication_analytics d\'abord.' }, { status: 404 });
        }

        // Prepare data summary for AI
        const igPubs = pubs.filter((p: any) => p.platform === 'instagram');
        const tkPubs = pubs.filter((p: any) => p.platform === 'tiktok');

        // Aggregate hashtag performance
        const hashtagStats: Record<string, { count: number; totalEng: number; totalReach: number }> = {};
        for (const pub of pubs) {
          for (const tag of (pub.hashtags || [])) {
            if (!hashtagStats[tag]) hashtagStats[tag] = { count: 0, totalEng: 0, totalReach: 0 };
            hashtagStats[tag].count++;
            hashtagStats[tag].totalEng += pub.engagement_rate || 0;
            hashtagStats[tag].totalReach += pub.reach || pub.view_count || 0;
          }
        }
        const topHashtags = Object.entries(hashtagStats)
          .map(([tag, s]) => ({ tag, count: s.count, avgEng: (s.totalEng / s.count).toFixed(2), totalReach: s.totalReach }))
          .sort((a, b) => parseFloat(b.avgEng) - parseFloat(a.avgEng))
          .slice(0, 15);

        // Day/hour analysis
        const dayPerf: Record<string, { count: number; totalEng: number }> = {};
        const hourPerf: Record<number, { count: number; totalEng: number }> = {};
        for (const pub of pubs) {
          if (!pub.posted_at) continue;
          const d = new Date(pub.posted_at);
          const dayName = d.toLocaleDateString('fr-FR', { weekday: 'long' });
          const hour = d.getHours();
          if (!dayPerf[dayName]) dayPerf[dayName] = { count: 0, totalEng: 0 };
          dayPerf[dayName].count++;
          dayPerf[dayName].totalEng += pub.engagement_rate || 0;
          if (!hourPerf[hour]) hourPerf[hour] = { count: 0, totalEng: 0 };
          hourPerf[hour].count++;
          hourPerf[hour].totalEng += pub.engagement_rate || 0;
        }

        const bestDays = Object.entries(dayPerf)
          .map(([day, s]) => ({ day, avgEng: (s.totalEng / s.count).toFixed(2), count: s.count }))
          .sort((a, b) => parseFloat(b.avgEng) - parseFloat(a.avgEng));

        const bestHours = Object.entries(hourPerf)
          .map(([hour, s]) => ({ hour: `${hour}h`, avgEng: (s.totalEng / s.count).toFixed(2), count: s.count }))
          .sort((a, b) => parseFloat(b.avgEng) - parseFloat(a.avgEng));

        // Top & flop posts
        const sorted = [...pubs].sort((a: any, b: any) => (b.engagement_rate || 0) - (a.engagement_rate || 0));
        const topPosts = sorted.slice(0, 5);
        const flopPosts = sorted.slice(-3).reverse();

        const pubDataForAI = `DONNÉES DE PUBLICATION (${daysBack} derniers jours) :

INSTAGRAM (${igPubs.length} posts) :
- Engagement moyen: ${igPubs.length > 0 ? (igPubs.reduce((s: number, p: any) => s + (p.engagement_rate || 0), 0) / igPubs.length).toFixed(2) : 0}%
- Likes moyen: ${igPubs.length > 0 ? Math.round(igPubs.reduce((s: number, p: any) => s + (p.like_count || 0), 0) / igPubs.length) : 0}
- Reach moyen: ${igPubs.length > 0 ? Math.round(igPubs.reduce((s: number, p: any) => s + (p.reach || 0), 0) / igPubs.length) : 0}

TIKTOK (${tkPubs.length} vidéos) :
- Vues moyennes: ${tkPubs.length > 0 ? Math.round(tkPubs.reduce((s: number, p: any) => s + (p.view_count || 0), 0) / tkPubs.length) : 0}
- Engagement moyen: ${tkPubs.length > 0 ? (tkPubs.reduce((s: number, p: any) => s + (p.engagement_rate || 0), 0) / tkPubs.length).toFixed(2) : 0}%

TOP 5 POSTS (meilleur engagement) :
${topPosts.map((p: any, i: number) => `${i + 1}. [${p.platform}] Eng: ${p.engagement_rate}% | Likes: ${p.like_count} | ${p.media_type}
   Caption: "${(p.caption || '').substring(0, 120)}..."
   Hashtags: ${(p.hashtags || []).join(', ') || 'aucun'}
   Posté: ${new Date(p.posted_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric' })}`).join('\n')}

FLOP POSTS (pire engagement) :
${flopPosts.map((p: any, i: number) => `${i + 1}. [${p.platform}] Eng: ${p.engagement_rate}% | Likes: ${p.like_count}
   Caption: "${(p.caption || '').substring(0, 80)}..."
   Hashtags: ${(p.hashtags || []).join(', ') || 'aucun'}`).join('\n')}

TOP HASHTAGS (par engagement moyen) :
${topHashtags.map(h => `${h.tag}: ${h.avgEng}% eng moy, utilisé ${h.count}x, reach total: ${h.totalReach}`).join('\n')}

MEILLEURS JOURS :
${bestDays.map(d => `${d.day}: ${d.avgEng}% eng moy (${d.count} posts)`).join('\n')}

MEILLEURES HEURES :
${bestHours.slice(0, 6).map(h => `${h.hour}: ${h.avgEng}% eng moy (${h.count} posts)`).join('\n')}`;

        // Load past learnings
        const { data: pastPubLearnings } = await supabase
          .from('agent_logs')
          .select('data')
          .eq('agent', 'marketing')
          .eq('action', 'memory')
          .ilike('data->>source', '%publication%')
          .order('created_at', { ascending: false })
          .limit(5);

        const pastInsights = (pastPubLearnings || [])
          .map((l: any) => `- ${l.data?.learning}`)
          .filter((l: string) => l.length > 3)
          .join('\n');

        const analysisResult = await callGemini({
          system: `Tu es le CMO de KeiroAI, expert en analyse de contenu social media pour commerces locaux.

Tu analyses les performances des publications Instagram et TikTok pour identifier des PATTERNS ACTIONNABLES.

STRUCTURE TA RÉPONSE EN JSON :
{
  "overall_performance": "Résumé en 2-3 phrases",
  "instagram_insights": {
    "best_content_type": "IMAGE|VIDEO|CAROUSEL — quel type performe le mieux",
    "best_caption_style": "Description du style de caption qui marche",
    "optimal_length": "Longueur de caption optimale",
    "top_hashtags": ["#tag1", "#tag2", "#tag3"],
    "avoid_hashtags": ["#tag_qui_marche_pas"],
    "best_posting_time": "Jour + heure optimale",
    "recommendations": ["Conseil actionnable 1", "Conseil 2"]
  },
  "tiktok_insights": {
    "best_content_style": "Style de vidéo qui performe",
    "optimal_duration": "Durée optimale",
    "best_hooks": "Quels types d'accroches marchent",
    "top_hashtags": ["#tag1"],
    "best_posting_time": "Jour + heure optimale",
    "recommendations": ["Conseil 1", "Conseil 2"]
  },
  "cross_platform_patterns": [
    "Pattern 1 — ce qui marche sur les 2 plateformes",
    "Pattern 2"
  ],
  "content_calendar_advice": {
    "weekly_cadence": { "instagram": 3, "tiktok": 2 },
    "best_days": { "instagram": ["mardi", "jeudi"], "tiktok": ["mercredi", "vendredi"] },
    "content_mix": "Ex: 40% éducatif, 30% behind-scenes, 20% promo, 10% tendances"
  },
  "learnings": [
    "J'ai appris: [insight basé sur les données]"
  ],
  "next_post_suggestions": [
    { "platform": "instagram|tiktok", "type": "IMAGE|VIDEO|CAROUSEL", "angle": "Idée de contenu", "best_time": "jour + heure", "hashtags": ["#x"] }
  ]
}

UNIQUEMENT du JSON valide, pas de markdown.`,
          message: `Analyse approfondie des performances de publication.

${pubDataForAI}

MES APPRENTISSAGES PASSÉS SUR LES PUBLICATIONS :
${pastInsights || 'Premier run — pas encore d\'apprentissages publications.'}`,
          maxTokens: 4000,
        });

        // Parse analysis
        let pubAnalysis: any = null;
        try {
          const cleanText = analysisResult.replace(/```[\w]*\s*/g, '').trim();
          const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
          if (jsonMatch) pubAnalysis = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error('[Marketing] Failed to parse publication analysis:', e);
        }

        // Save learnings to both agent_logs AND RAG knowledge pool (per org)
        let learningsSaved = 0;
        if (pubAnalysis?.learnings) {
          for (const learning of pubAnalysis.learnings) {
            if (learning && learning.length > 10) {
              await supabase.from('agent_logs').insert({
                agent: 'marketing',
                action: 'memory',
                data: { learning, source: 'publication_analysis', learned_at: nowISO },
                created_at: nowISO,
                ...(orgId ? { org_id: orgId } : {}),
              });
              // Also save to RAG knowledge pool for cross-agent sharing
              try {
                await saveLearning(supabase, {
                  agent: 'marketing',
                  category: 'content',
                  learning,
                  evidence: `Analyse de ${pubs.length} publications sur ${daysBack} jours`,
                  confidence: 35,
                  orgId: orgId || undefined,
                });
                learningsSaved++;
              } catch (e: any) {
                console.warn('[Marketing] RAG learning save error:', e.message);
              }
            }
          }
        }

        // ── Per-content-type performance insights → RAG pool ──
        // Identify what works best by content characteristics
        const enrichedPubs = pubs.filter((p: any) => p.ai_analysis?.pillar || p.content_category);
        if (enrichedPubs.length >= 3) {
          // Group by pillar
          const byPillar: Record<string, { count: number; totalEng: number; totalLikes: number; totalViews: number; examples: string[] }> = {};
          for (const pub of enrichedPubs) {
            const pillar = pub.ai_analysis?.pillar || pub.content_category || 'unknown';
            if (!byPillar[pillar]) byPillar[pillar] = { count: 0, totalEng: 0, totalLikes: 0, totalViews: 0, examples: [] };
            byPillar[pillar].count++;
            byPillar[pillar].totalEng += pub.engagement_rate || 0;
            byPillar[pillar].totalLikes += pub.like_count || 0;
            byPillar[pillar].totalViews += pub.view_count || 0;
            if (byPillar[pillar].examples.length < 2) {
              byPillar[pillar].examples.push((pub.caption || '').substring(0, 80));
            }
          }

          // Save best-performing pillar as structured learning
          const bestPillar = Object.entries(byPillar)
            .filter(([, s]) => s.count >= 2)
            .sort((a, b) => (b[1].totalEng / b[1].count) - (a[1].totalEng / a[1].count))[0];

          if (bestPillar) {
            const avgEng = (bestPillar[1].totalEng / bestPillar[1].count).toFixed(2);
            const avgLikes = Math.round(bestPillar[1].totalLikes / bestPillar[1].count);
            try {
              await saveLearning(supabase, {
                agent: 'marketing',
                category: 'content',
                learning: `Pilier "${bestPillar[0]}" performe le mieux : ${avgEng}% engagement moyen, ${avgLikes} likes moyens sur ${bestPillar[1].count} posts. Exemples: ${bestPillar[1].examples.join(' | ')}`,
                evidence: `${enrichedPubs.length} publications enrichies analysées sur ${daysBack} jours`,
                confidence: Math.min(50, 20 + bestPillar[1].count * 5),
                orgId: orgId || undefined,
              });
              learningsSaved++;
            } catch {}
          }

          // Group by format (reel vs post vs carousel)
          const byFormat: Record<string, { count: number; totalEng: number; totalLikes: number }> = {};
          for (const pub of enrichedPubs) {
            const fmt = pub.ai_analysis?.format || pub.media_type || 'unknown';
            if (!byFormat[fmt]) byFormat[fmt] = { count: 0, totalEng: 0, totalLikes: 0 };
            byFormat[fmt].count++;
            byFormat[fmt].totalEng += pub.engagement_rate || 0;
            byFormat[fmt].totalLikes += pub.like_count || 0;
          }

          const bestFormat = Object.entries(byFormat)
            .filter(([, s]) => s.count >= 2)
            .sort((a, b) => (b[1].totalEng / b[1].count) - (a[1].totalEng / a[1].count))[0];

          if (bestFormat) {
            const avgEng = (bestFormat[1].totalEng / bestFormat[1].count).toFixed(2);
            try {
              await saveLearning(supabase, {
                agent: 'content',
                category: 'content',
                learning: `Format "${bestFormat[0]}" a le meilleur engagement (${avgEng}%) sur ${bestFormat[1].count} publications. Privilégier ce format pour maximiser l'engagement.`,
                evidence: `Analyse comparative des formats sur ${enrichedPubs.length} posts enrichis`,
                confidence: Math.min(45, 15 + bestFormat[1].count * 4),
                orgId: orgId || undefined,
              });
              learningsSaved++;
            } catch {}
          }
        }

        // Store full analysis
        await supabase.from('agent_logs').insert({
          agent: 'marketing',
          action: 'analyze_publications',
          data: {
            analysis: pubAnalysis || { raw: analysisResult.substring(0, 3000) },
            stats: {
              total_posts: pubs.length,
              instagram: igPubs.length,
              tiktok: tkPubs.length,
              top_hashtags: topHashtags.slice(0, 5),
              best_days: bestDays.slice(0, 3),
              best_hours: bestHours.slice(0, 3),
              enriched_posts: enrichedPubs?.length || 0,
            },
            learnings_saved: learningsSaved,
          },
          status: 'success',
          created_at: nowISO,
          ...(orgId ? { org_id: orgId } : {}),
        });

        // Auto-learn from recent marketing performance
        await autoLearnMarketing(supabase, orgId);

        return NextResponse.json({
          ok: true,
          analysis: pubAnalysis || analysisResult.substring(0, 3000),
          stats: {
            total_posts: pubs.length,
            instagram: igPubs.length,
            tiktok: tkPubs.length,
          },
        });
      }

      default:
        return NextResponse.json({ ok: false, error: `Action inconnue: ${body.action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Marketing] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
