import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { callGemini } from '@/lib/agents/gemini';
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
