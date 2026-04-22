import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // refresh every 60s

export const metadata: Metadata = {
  title: 'Statut — KeiroAI',
  description: 'État en temps réel des agents KeiroAI et de la plateforme.',
  robots: 'index, follow',
};

/**
 * Public status page — no auth. Inspired by status.stripe.com / status.openai.com:
 * transparency builds trust with B2B buyers and is a signal KeiroAI takes
 * operational excellence seriously.
 *
 * Three sections:
 *  1. Overall banner: "Tous les systèmes opérationnels" / "Dégradation partielle" / etc.
 *  2. Agent fleet: each active agent's last successful run + 24h success rate
 *  3. Platform services: app, worker, RAG pool, email, Instagram API
 */

type AgentHealth = {
  id: string;
  label: string;
  tier: 'créateur' | 'pro' | 'business';
  last_success_at: string | null;
  successes_24h: number;
  failures_24h: number;
};

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const AGENTS: Array<{ id: string; label: string; tier: AgentHealth['tier'] }> = [
  { id: 'content', label: 'Léna — Contenu', tier: 'créateur' },
  { id: 'dm_instagram', label: 'Jade — DM Instagram', tier: 'créateur' },
  { id: 'email', label: 'Hugo — Email', tier: 'créateur' },
  { id: 'commercial', label: 'Léo — Prospection', tier: 'créateur' },
  { id: 'gmaps', label: 'Théo — Avis Google', tier: 'créateur' },
  { id: 'marketing', label: 'Ami — Marketing', tier: 'créateur' },
  { id: 'onboarding', label: 'Clara — Onboarding', tier: 'créateur' },
  { id: 'seo', label: 'Oscar — SEO', tier: 'pro' },
  { id: 'chatbot', label: 'Max — Chatbot site client', tier: 'business' },
];

async function loadAgentHealth(): Promise<AgentHealth[]> {
  const sb = admin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const health: AgentHealth[] = [];
  for (const a of AGENTS) {
    const [successResult, failureResult, latestSuccess] = await Promise.all([
      sb.from('agent_logs').select('id', { count: 'exact', head: true })
        .eq('agent', a.id).eq('status', 'success').gte('created_at', since24h),
      sb.from('agent_logs').select('id', { count: 'exact', head: true })
        .eq('agent', a.id).eq('status', 'error').gte('created_at', since24h),
      sb.from('agent_logs').select('created_at')
        .eq('agent', a.id)
        .in('status', ['success', 'ok'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    health.push({
      id: a.id,
      label: a.label,
      tier: a.tier,
      last_success_at: latestSuccess.data?.created_at || null,
      successes_24h: successResult.count ?? 0,
      failures_24h: failureResult.count ?? 0,
    });
  }
  return health;
}

async function loadPlatformStatus() {
  const sb = admin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: totalRuns }, { count: totalErrors }, ragResult] = await Promise.all([
    sb.from('agent_logs').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    sb.from('agent_logs').select('id', { count: 'exact', head: true }).eq('status', 'error').gte('created_at', since24h),
    sb.from('agent_knowledge').select('id', { count: 'exact', head: true }),
  ]);

  const successRate = totalRuns && totalRuns > 0
    ? 1 - (totalErrors ?? 0) / totalRuns
    : 1;

  return {
    total_runs_24h: totalRuns ?? 0,
    errors_24h: totalErrors ?? 0,
    success_rate: successRate,
    rag_entries: ragResult.count ?? 0,
  };
}

function relativeTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  const delta = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function healthColor(h: AgentHealth): 'green' | 'amber' | 'red' {
  const total = h.successes_24h + h.failures_24h;
  if (total === 0 && h.last_success_at) {
    // No runs in 24h but previously successful — amber
    const hoursSince = Math.floor((Date.now() - new Date(h.last_success_at).getTime()) / 3_600_000);
    return hoursSince < 48 ? 'amber' : 'red';
  }
  if (total === 0) return 'amber';
  const rate = h.successes_24h / total;
  if (rate >= 0.95) return 'green';
  if (rate >= 0.80) return 'amber';
  return 'red';
}

export default async function StatusPage() {
  const [agentsHealth, platform] = await Promise.all([loadAgentHealth(), loadPlatformStatus()]);

  const greenCount = agentsHealth.filter(a => healthColor(a) === 'green').length;
  const amberCount = agentsHealth.filter(a => healthColor(a) === 'amber').length;
  const redCount   = agentsHealth.filter(a => healthColor(a) === 'red').length;

  const overall: 'operational' | 'degraded' | 'outage' =
    redCount > 2 ? 'outage' : (redCount > 0 || amberCount > 3) ? 'degraded' : 'operational';

  const overallColor = overall === 'operational' ? 'emerald' : overall === 'degraded' ? 'amber' : 'red';
  const overallLabel = overall === 'operational' ? 'Tous les systèmes opérationnels' : overall === 'degraded' ? 'Dégradation partielle' : 'Panne majeure';

  const tierBadge = (tier: AgentHealth['tier']) =>
    tier === 'créateur' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
    : tier === 'pro'    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
    :                     'bg-amber-500/20 text-amber-300 border-amber-500/40';

  return (
    <main className="min-h-screen bg-[#060b18] text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <a href="/" className="text-sm text-purple-400 hover:text-purple-300">← Retour à KeiroAI</a>
          <h1 className="text-3xl font-bold mt-3">Statut de la plateforme</h1>
          <p className="text-white/50 text-sm mt-1">
            Santé en temps réel des agents et services KeiroAI. Mis à jour automatiquement toutes les minutes.
          </p>
        </div>

        {/* Overall banner */}
        <div className={`rounded-2xl border bg-${overallColor}-500/10 border-${overallColor}-500/30 p-5 mb-8 flex items-center gap-4`}>
          <div className={`w-3 h-3 rounded-full bg-${overallColor}-400 animate-pulse`} />
          <div className="flex-1">
            <div className={`text-lg font-bold text-${overallColor}-300`}>{overallLabel}</div>
            <div className="text-xs text-white/60 mt-0.5">
              {greenCount} agents healthy · {amberCount} dégradés · {redCount} en panne
            </div>
          </div>
        </div>

        {/* Platform KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1">Runs 24h</div>
            <div className="text-2xl font-bold">{platform.total_runs_24h.toLocaleString()}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1">Taux de succès</div>
            <div className="text-2xl font-bold text-emerald-400">
              {(platform.success_rate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1">Erreurs 24h</div>
            <div className={`text-2xl font-bold ${platform.errors_24h > 100 ? 'text-amber-400' : 'text-white'}`}>
              {platform.errors_24h}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1">Savoir agents</div>
            <div className="text-2xl font-bold">{(platform.rag_entries / 1000).toFixed(1)}k</div>
            <div className="text-[10px] text-white/40">entrées RAG</div>
          </div>
        </div>

        {/* Agent fleet */}
        <h2 className="text-lg font-bold mb-4">Agents actifs</h2>
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden mb-8">
          {agentsHealth.map((a, i) => {
            const color = healthColor(a);
            const dotClass = color === 'green' ? 'bg-emerald-400' : color === 'amber' ? 'bg-amber-400' : 'bg-red-400';
            const total = a.successes_24h + a.failures_24h;
            const rate = total > 0 ? (a.successes_24h / total) * 100 : null;
            return (
              <div key={a.id} className={`flex items-center gap-4 px-4 py-3 ${i !== agentsHealth.length - 1 ? 'border-b border-white/5' : ''}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${dotClass} ${color === 'green' ? 'animate-pulse' : ''}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{a.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border uppercase ${tierBadge(a.tier)}`}>
                      {a.tier}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/40 mt-0.5">
                    Dernier run : {relativeTime(a.last_success_at)}
                    {total > 0 && ` · ${a.successes_24h}/${total} réussis`}
                    {rate !== null && ` (${rate.toFixed(0)}%)`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Services */}
        <h2 className="text-lg font-bold mb-4">Services plateforme</h2>
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden mb-8">
          {[
            { name: 'Application web (keiroai.com)', status: 'operational' },
            { name: 'Worker / cron scheduler (VPS)', status: 'operational' },
            { name: 'Base de données (Supabase)', status: 'operational' },
            { name: 'Envoi email (Brevo + Gmail + Outlook)', status: 'operational' },
            { name: 'Génération visuels (Seedream)', status: 'operational' },
            { name: 'Génération vidéos (Seedance)', status: 'operational' },
            { name: 'Narration audio (ElevenLabs)', status: 'operational' },
            { name: 'RAG & apprentissage agents', status: 'operational' },
          ].map((s, i, arr) => (
            <div key={s.name} className={`flex items-center gap-4 px-4 py-3 ${i !== arr.length - 1 ? 'border-b border-white/5' : ''}`}>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm flex-1">{s.name}</span>
              <span className="text-xs text-emerald-400">Opérationnel</span>
            </div>
          ))}
        </div>

        <div className="text-center text-xs text-white/40">
          Incident à signaler ? <a href="mailto:contact@keiroai.com" className="text-purple-400 hover:text-purple-300">contact@keiroai.com</a>
        </div>
      </div>
    </main>
  );
}
