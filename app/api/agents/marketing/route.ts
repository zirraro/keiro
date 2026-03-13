import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { callGemini, callGeminiWithSearch } from '@/lib/agents/gemini';
import { loadSharedContext, formatContextForPrompt } from '@/lib/agents/shared-context';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowISO = now.toISOString();

  try {
    // Load shared context
    const sharedCtx = await loadSharedContext(supabase, 'marketing');
    const crmContext = formatContextForPrompt(sharedCtx);

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

    // Generate marketing analysis
    const analysis = await callGemini({
      system: `Tu es le CMO virtuel de KeiroAI. Tu gères TOUTE la stratégie marketing de manière quasi-autonome.

Tu analyses les performances cross-canal, tu décides des ajustements, tu donnes des ordres aux agents, et tu remontes le bilan au CEO.

TES APPRENTISSAGES sont reversés à l'assistant marketing client de KeiroAI (c'est le même cerveau). Chaque insight que tu découvres améliore les conseils donnés aux utilisateurs.

STRUCTURE TA RÉPONSE :

## ANALYSE MARKETING

### Performance par canal
(Email: taux ouverture/clic/réponse, tendance — Social: engagement, reach — SEO: articles publiés — Chatbot: leads générés — DM: taux réponse)

### Timing & Fréquences optimales
(Meilleurs jours/heures par canal, fréquence recommandée cette semaine)

### Funnel Analysis
(Visiteurs → Leads → Contactés → Répondu → Client — où sont les fuites ?)

### Segments qui convertissent
(Types de commerce, zones, angles qui marchent le mieux)

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

    switch (body.action) {
      case 'find_follow_targets': {
        // Use Google Search to find relevant accounts to follow
        const platform = body.platform || 'instagram';
        const niche = body.niche || 'commerces locaux, restaurants, boutiques, coachs, PME France';
        const count = Math.min(body.count || 20, 50);

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
            prospect_id: existingProspect?.[0]?.id || null,
          });
          inserted++;
        }

        // Log
        await supabase.from('agent_logs').insert({
          agent: 'marketing',
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
        const sharedCtx = await loadSharedContext(supabase, 'marketing');
        const crmContext = formatContextForPrompt(sharedCtx);

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

      default:
        return NextResponse.json({ ok: false, error: `Action inconnue: ${body.action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Marketing] POST error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
