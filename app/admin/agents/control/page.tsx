'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AgentTile {
  id: string;
  name: string;
  emoji: string;
  networks: string[];
  description: string;
}

// Active agents only — disabled ones (whatsapp, comptable, rh, ads, etc.)
// are kept in DISABLED_AGENTS but hidden from the admin pilot index.
const ACTIVE_AGENTS: AgentTile[] = [
  { id: 'content', name: 'Léna · Contenu', emoji: '🎨', networks: ['IG', 'TT', 'LI'], description: 'Génération + publication multi-réseau' },
  { id: 'dm_instagram', name: 'Jade · DM', emoji: '💬', networks: ['IG', 'TT'], description: 'DM auto + follows + comments' },
  { id: 'email', name: 'Hugo · Email', emoji: '📧', networks: ['Email'], description: 'Cold outbound + relances + replies' },
  { id: 'commercial', name: 'Léo · Prospection', emoji: '💼', networks: ['CRM'], description: 'Enrichment + recherche externe' },
  { id: 'reviews', name: 'Théo · Avis Google', emoji: '⭐', networks: ['Google'], description: 'Réponses auto + escalade humain' },
  { id: 'instagram_comments', name: 'Jade · Commentaires IG', emoji: '💭', networks: ['IG'], description: 'Réponses commentaires posts' },
  { id: 'gmaps', name: 'Léo · Google Maps Scan', emoji: '📍', networks: ['Maps'], description: 'Scan zone → prospects' },
  { id: 'ceo', name: 'Noah · CEO Brief', emoji: '👔', networks: ['Internal'], description: 'Brief stratégique quotidien' },
  { id: 'marketing', name: 'Marketing CMO', emoji: '🎯', networks: ['Cross'], description: 'Arbitrage cross-canal' },
  { id: 'seo', name: 'SEO Articles', emoji: '🔍', networks: ['Blog'], description: 'Génération articles + calendrier' },
  { id: 'onboarding', name: 'Clara · Onboarding', emoji: '👋', networks: ['Email'], description: 'Séquence nouveaux clients' },
  { id: 'retention', name: 'Clara · Rétention', emoji: '🔄', networks: ['Email'], description: 'Rétention clients existants' },
  { id: 'amit', name: 'AMI · Stratégie', emoji: '🧠', networks: ['Admin'], description: 'Méta-analyse stratégie globale' },
];

interface Summary {
  agent_id: string;
  total_runs_24h: number;
  total_errors_24h: number;
  success_rate_24h: number;
  active_clients: number;
}

export default function AdminAgentsControlIndex() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Fetch each agent's summary in parallel (light call returns summary only)
      const results = await Promise.allSettled(
        ACTIVE_AGENTS.map(a =>
          fetch(`/api/admin/agents/control/${a.id}`, { credentials: 'include' })
            .then(r => r.json())
            .then(j => ({ agent_id: a.id, ...(j.summary || {}) })),
        ),
      );
      const out: Record<string, Summary> = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.agent_id) {
          out[r.value.agent_id] = r.value;
        }
      }
      setSummaries(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button onClick={() => router.push('/admin/service-health')} className="text-xs text-cyan-400 hover:underline mb-2">← Service Health</button>
          <h1 className="text-2xl font-bold">Agent Control Center</h1>
          <p className="text-xs text-white/40 mt-1">Pilot every agent across all KeiroAI clients · Trigger runs, pause/resume, monitor errors</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ACTIVE_AGENTS.map((a) => {
            const s = summaries[a.id];
            const successColor = !s ? 'text-white/40' : s.success_rate_24h >= 95 ? 'text-emerald-400' : s.success_rate_24h >= 80 ? 'text-amber-400' : 'text-red-400';
            return (
              <button
                key={a.id}
                onClick={() => router.push(`/admin/agents/control/${a.id}`)}
                className="text-left rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05] hover:border-cyan-500/30 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="text-2xl">{a.emoji}</div>
                  {s && s.total_errors_24h > 0 && (
                    <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 rounded-full px-2 py-0.5 font-bold">
                      {s.total_errors_24h} erreur{s.total_errors_24h > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-bold text-white">{a.name}</h2>
                <p className="text-[11px] text-white/50 mt-0.5 mb-2">{a.description}</p>
                <div className="flex gap-1 mb-3 flex-wrap">
                  {a.networks.map(n => <span key={n} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">{n}</span>)}
                </div>
                {loading ? (
                  <div className="text-[10px] text-white/30">Chargement…</div>
                ) : s ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[9px] text-white/40 uppercase">24h runs</div>
                      <div className="text-sm font-bold">{s.total_runs_24h}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-white/40 uppercase">Clients</div>
                      <div className="text-sm font-bold">{s.active_clients}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-white/40 uppercase">Success</div>
                      <div className={`text-sm font-bold ${successColor}`}>{s.success_rate_24h ?? 0}%</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-white/30">Pas de data</div>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-white/30 mt-6 text-center">
          Agents désactivés (whatsapp, comptable, rh, ads, linkedin, tiktok_comments, tiktok_dm) cachés. Réactivable depuis lib/agents/feature-flags.ts.
        </p>
      </div>
    </div>
  );
}
