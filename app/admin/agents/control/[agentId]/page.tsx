'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface ClientRow {
  user_id: string;
  email: string;
  first_name: string;
  plan: string;
  paused: boolean;
  runs_24h: number;
  runs_7d: number;
  errors_24h: number;
  errors_7d: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  actions_breakdown: Record<string, number>;
  kpis: Record<string, any>;
  volume: Record<string, any>;
  health: { score: number; level: 'green' | 'amber' | 'red'; label: string; reasons: string[] };
}

interface Panel {
  ok: boolean;
  agent_id: string;
  networks: string[];
  kpi_fields: Array<{ label: string; column: string }>;
  summary: {
    total_clients: number;
    active_clients: number;
    total_runs_24h: number;
    total_runs_7d: number;
    total_errors_24h: number;
    total_errors_7d: number;
    success_rate_24h: number;
    health_red: number;
    health_amber: number;
    health_green: number;
  };
  clients: ClientRow[];
}

const AGENT_LABELS: Record<string, { name: string; emoji: string }> = {
  content: { name: 'Léna · Contenu', emoji: '🎨' },
  dm_instagram: { name: 'Jade · DM', emoji: '💬' },
  email: { name: 'Hugo · Email', emoji: '📧' },
  commercial: { name: 'Léo · Prospection', emoji: '💼' },
  reviews: { name: 'Théo · Avis Google', emoji: '⭐' },
  ceo: { name: 'Noah · CEO', emoji: '👔' },
  marketing: { name: 'Marketing CMO', emoji: '🎯' },
  seo: { name: 'SEO', emoji: '🔍' },
  onboarding: { name: 'Clara · Onboarding', emoji: '👋' },
  retention: { name: 'Clara · Rétention', emoji: '🔄' },
  instagram_comments: { name: 'Jade · Commentaires IG', emoji: '💭' },
  gmaps: { name: 'Léo · Google Maps', emoji: '📍' },
  amit: { name: 'AMI · Stratégie', emoji: '🧠' },
};

export default function AgentControlPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params?.agentId as string;
  const [data, setData] = useState<Panel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/agents/control/${agentId}`, { credentials: 'include' });
      if (r.status === 403) { setError('Admin only'); return; }
      const j = await r.json();
      if (j.ok) setData(j);
      else setError(j.error || 'Erreur');
    } catch (e: any) {
      setError(e?.message || 'fetch failed');
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const pilot = useCallback(async (userIdTarget: string, action: 'trigger' | 'pause' | 'resume') => {
    setBusy(`${action}-${userIdTarget}`);
    try {
      const r = await fetch(`/api/admin/agents/control/${agentId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, user_id: userIdTarget }),
      });
      await r.json();
      await load();
    } catch (e: any) {
      console.error(e);
    }
    setBusy(null);
  }, [agentId, load]);

  if (loading) return <div className="min-h-screen bg-[#0c1a3a] text-white p-6 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400" /></div>;
  if (error) return <div className="min-h-screen bg-[#0c1a3a] text-red-400 p-6">{error}</div>;
  if (!data) return null;

  const meta = AGENT_LABELS[agentId] || { name: agentId, emoji: '🤖' };

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => router.push('/admin/service-health')} className="text-xs text-cyan-400 hover:underline mb-2">← Service Health</button>
            <h1 className="text-2xl font-bold flex items-center gap-2">{meta.emoji} {meta.name}</h1>
            <p className="text-xs text-white/40 mt-1">Pilot {agentId} across all KeiroAI clients</p>
          </div>
          <button onClick={load} className="px-3 py-2 text-xs rounded-lg bg-white/10 hover:bg-white/15">↻ Reload</button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
          <Kpi label="Clients actifs" value={`${data.summary.active_clients}/${data.summary.total_clients}`} />
          <Kpi label="Runs 24h" value={data.summary.total_runs_24h} />
          <Kpi label="Runs 7j" value={data.summary.total_runs_7d} />
          <Kpi label="Erreurs 24h" value={data.summary.total_errors_24h} color={data.summary.total_errors_24h > 0 ? 'red' : 'green'} />
          <Kpi label="Success 24h" value={`${data.summary.success_rate_24h}%`} color={data.summary.success_rate_24h >= 95 ? 'green' : data.summary.success_rate_24h >= 80 ? 'amber' : 'red'} />
          <Kpi label="🚨 Rouge" value={data.summary.health_red ?? 0} color={(data.summary.health_red ?? 0) > 0 ? 'red' : 'green'} />
          <Kpi label="⚠️ Ambre" value={data.summary.health_amber ?? 0} color={(data.summary.health_amber ?? 0) > 0 ? 'amber' : undefined} />
          <Kpi label="✅ Vert" value={data.summary.health_green ?? 0} color="green" />
        </div>

        {/* Per-client table */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-bold">Clients ({data.clients.length})</h2>
            <span className="text-[10px] text-white/40">Triés : erreurs 24h ↓ puis runs 7j ↓</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.03] text-[10px] text-white/50 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Health</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-right">Runs 24h</th>
                  <th className="px-3 py-2 text-right">Erreurs 24h</th>
                  <th className="px-3 py-2 text-right">Runs 7j</th>
                  <th className="px-3 py-2 text-left">Volume 7j</th>
                  <th className="px-3 py-2 text-left">Dernière exec</th>
                  <th className="px-3 py-2 text-left">Dernière erreur</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c) => {
                  const sinceRun = c.last_run_at ? formatRelative(c.last_run_at) : '—';
                  const volumeStr = renderVolume(agentId, c.volume);
                  return (
                    <tr key={c.user_id} className={`border-t border-white/5 hover:bg-white/[0.04] cursor-pointer ${c.health.level === 'red' ? 'bg-red-500/5' : c.health.level === 'amber' ? 'bg-amber-500/5' : ''}`} onClick={(e) => {
                      // Don't navigate when clicking a pilot button
                      if ((e.target as HTMLElement).closest('button')) return;
                      router.push(`/admin/agents/control/${agentId}/${c.user_id}`);
                    }}>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${
                            c.health.level === 'red' ? 'bg-red-500/15 border-red-500/40 text-red-300' :
                            c.health.level === 'amber' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' :
                            'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          }`}
                          title={c.health.reasons.join(' · ') || 'OK'}
                        >
                          {c.health.level === 'red' ? '🚨' : c.health.level === 'amber' ? '⚠️' : '✅'}
                          {c.health.score}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-white truncate max-w-[180px] underline-offset-2 hover:underline" title={c.email}>{c.email || c.user_id.substring(0, 8)}</div>
                        {c.paused && <span className="text-[9px] text-amber-300 uppercase">⏸ paused</span>}
                      </td>
                      <td className="px-3 py-2 text-white/60">{c.plan}</td>
                      <td className={`px-3 py-2 text-right font-mono ${c.runs_24h === 0 ? 'text-white/30' : 'text-white'}`}>{c.runs_24h}</td>
                      <td className={`px-3 py-2 text-right font-mono ${c.errors_24h > 0 ? 'text-red-400 font-bold' : 'text-white/40'}`}>{c.errors_24h}</td>
                      <td className="px-3 py-2 text-right font-mono text-white/70">{c.runs_7d}</td>
                      <td className="px-3 py-2 text-white/60 text-[11px]">{volumeStr}</td>
                      <td className="px-3 py-2 text-white/50 text-[11px]">{sinceRun}</td>
                      <td className="px-3 py-2 text-red-300/80 text-[11px] max-w-[200px] truncate" title={c.last_error || ''}>{c.last_error || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => pilot(c.user_id, 'trigger')}
                            disabled={busy === `trigger-${c.user_id}`}
                            className="px-2 py-1 text-[10px] rounded bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50"
                            title="Trigger this agent for this client now"
                          >▶ Run</button>
                          {c.paused ? (
                            <button
                              onClick={() => pilot(c.user_id, 'resume')}
                              disabled={busy === `resume-${c.user_id}`}
                              className="px-2 py-1 text-[10px] rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            >Resume</button>
                          ) : (
                            <button
                              onClick={() => pilot(c.user_id, 'pause')}
                              disabled={busy === `pause-${c.user_id}`}
                              className="px-2 py-1 text-[10px] rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                            >Pause</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.clients.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-white/40">Aucun client actif sur cet agent (7 derniers jours)</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: any; color?: 'red' | 'green' | 'amber' }) {
  const colorClass = color === 'red' ? 'text-red-400' : color === 'green' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${colorClass}`}>{value}</div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

function renderVolume(agentId: string, v: Record<string, any>): string {
  if (!v || Object.keys(v).length === 0) return '—';
  if (agentId === 'content') return `IG:${v.ig || 0} TT:${v.tt || 0} LI:${v.li || 0}${v.failed ? ` ✗${v.failed}` : ''}`;
  if (agentId === 'email') return `✉${v.sent || 0} 👀${v.opened || 0} 💬${v.replied || 0}`;
  if (agentId === 'dm_instagram') return `→${v.sent || 0} ⏳${v.pending || 0}${v.failed ? ` ✗${v.failed}` : ''}`;
  if (agentId === 'commercial') return `+${v.added || 0} (${v.client || 0} client)`;
  return Object.entries(v).map(([k, vv]) => `${k}:${vv}`).join(' ');
}
