'use client';

import { useEffect, useState, useCallback } from 'react';
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

interface Alert {
  id: number;
  severity: 'P0' | 'P1' | 'P2';
  kind: string;
  agent: string;
  user_id: string | null;
  client_email: string | null;
  title: string;
  detail: string;
  sample_error: string | null;
  count_in_window: number;
  first_seen: string;
  last_seen: string;
}

export default function AdminAgentsControlIndex() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsSummary, setAlertsSummary] = useState<{ p0: number; p1: number; p2: number; total: number }>({ p0: 0, p1: 0, p2: 0, total: 0 });

  const loadAlerts = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/agents/anomalies', { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        setAlerts(j.alerts || []);
        setAlertsSummary(j.summary || { p0: 0, p1: 0, p2: 0, total: 0 });
      }
    } catch { /* swallow */ }
  }, []);

  const resolveAlert = useCallback(async (id: number) => {
    await fetch('/api/admin/agents/anomalies', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', id }),
    });
    await loadAlerts();
  }, [loadAlerts]);

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
      loadAlerts();
    })();
    // Auto-refresh alerts every 60s
    const interval = setInterval(loadAlerts, 60000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => router.push('/admin/service-health')} className="text-xs text-cyan-400 hover:underline mb-2">← Service Health</button>
            <h1 className="text-2xl font-bold">Agent Control Center</h1>
            <p className="text-xs text-white/40 mt-1">Pilot every agent across all KeiroAI clients · Trigger runs, pause/resume, monitor errors · Live alerts /30min</p>
          </div>
          <a href="/admin/agents/reports" className="px-3 py-2 text-xs rounded-lg bg-white/10 hover:bg-white/15 text-white">📊 Rapports détaillés</a>
        </div>

        {/* 🚨 Live alerts panel — refreshed every 60s */}
        {alertsSummary.total > 0 && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 mb-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-red-300 flex items-center gap-2">
                🚨 Alertes live <span className="text-[10px] text-white/40 font-normal">(scan toutes les 30min)</span>
              </h2>
              <div className="flex gap-2 text-[11px]">
                {alertsSummary.p0 > 0 && <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">P0 ×{alertsSummary.p0}</span>}
                {alertsSummary.p1 > 0 && <span className="px-2 py-0.5 rounded-full bg-orange-600 text-white font-bold">P1 ×{alertsSummary.p1}</span>}
                {alertsSummary.p2 > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-600 text-white">P2 ×{alertsSummary.p2}</span>}
              </div>
            </div>
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {alerts.slice(0, 12).map((a) => {
                const sevColor = a.severity === 'P0' ? 'border-red-500/40 bg-red-500/10' : a.severity === 'P1' ? 'border-orange-500/40 bg-orange-500/10' : 'border-slate-500/40 bg-slate-500/10';
                const sevText = a.severity === 'P0' ? 'text-red-300' : a.severity === 'P1' ? 'text-orange-300' : 'text-slate-300';
                return (
                  <li key={a.id} className={`rounded-lg border ${sevColor} px-3 py-2`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold ${sevText}`}>{a.severity}</span>
                          <span className="text-[10px] uppercase tracking-wider text-white/40">{a.kind}</span>
                          <span className="text-[10px] text-white/30">×{a.count_in_window}</span>
                        </div>
                        <p className="text-[12px] font-semibold text-white mt-0.5">{a.title}</p>
                        <p className="text-[11px] text-white/60 mt-0.5">{a.detail}</p>
                        {a.client_email && <p className="text-[10px] text-amber-300 mt-0.5">Client : {a.client_email}</p>}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => router.push(`/admin/agents/control/${a.agent}${a.user_id ? '/' + a.user_id : ''}`)}
                          className="px-2 py-1 text-[10px] rounded bg-cyan-600 hover:bg-cyan-700"
                        >→ Voir</button>
                        <button
                          onClick={() => resolveAlert(a.id)}
                          className="px-2 py-1 text-[10px] rounded bg-white/10 hover:bg-emerald-600"
                        >✓</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
