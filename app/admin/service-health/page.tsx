'use client';

import { useEffect, useState } from 'react';

type Cause = {
  cause: string;
  severity: 'P0' | 'P1' | 'P2' | string;
  incidents: number;
  affected_clients: number;
  agents: string[];
  fixes: string[];
  last_seen: string;
  sample_error: string;
};

type Incident = {
  at: string;
  client: string;
  plan: string;
  severity: string;
  gaps: number;
  causes: string[];
};

type Health = {
  ok: boolean;
  window: string;
  summary: {
    total_incidents: number;
    total_diagnostics: number;
    p0: number;
    p1: number;
    p2: number;
    unique_causes: number;
  };
  causes: Cause[];
  recent: Incident[];
};

const SEV_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  P0: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b' },
  P1: { bg: '#fff7ed', border: '#ea580c', text: '#9a3412' },
  P2: { bg: '#f9fafb', border: '#6b7280', text: '#374151' },
};

export default function ServiceHealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/service-health', { credentials: 'include' });
      if (res.status === 403) {
        setError('Admin only');
        setLoading(false);
        return;
      }
      const j = await res.json();
      if (j.ok) setData(j);
      else setError(j.error || 'Erreur');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] text-white p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] text-white p-6">
        <h1 className="text-2xl font-bold">Service Health</h1>
        <p className="text-red-400 mt-4">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Service Health — Diagnostics Noah</h1>
            <p className="text-white/50 text-sm mt-1">Fenêtre 7j · Catch-up technical gaps + analyse cause racine</p>
          </div>
          <button
            onClick={load}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition"
          >
            ↻ Recharger
          </button>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-4">
            <div className="text-3xl font-bold text-red-400">{data.summary.p0}</div>
            <div className="text-[10px] text-red-300/70 uppercase font-bold mt-1">P0 — Bloquant</div>
          </div>
          <div className="rounded-xl border border-orange-500/30 bg-orange-900/10 p-4">
            <div className="text-3xl font-bold text-orange-400">{data.summary.p1}</div>
            <div className="text-[10px] text-orange-300/70 uppercase font-bold mt-1">P1 — Important</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-3xl font-bold text-white/70">{data.summary.p2}</div>
            <div className="text-[10px] text-white/40 uppercase font-bold mt-1">P2 — Mineur</div>
          </div>
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-900/10 p-4">
            <div className="text-3xl font-bold text-cyan-400">{data.summary.total_incidents}</div>
            <div className="text-[10px] text-cyan-300/70 uppercase font-bold mt-1">Total incidents</div>
          </div>
          <div className="rounded-xl border border-purple-500/30 bg-purple-900/10 p-4">
            <div className="text-3xl font-bold text-purple-400">{data.summary.unique_causes}</div>
            <div className="text-[10px] text-purple-300/70 uppercase font-bold mt-1">Causes uniques</div>
          </div>
        </div>

        {/* Causes — root cause aggregation */}
        <h2 className="text-lg font-bold mb-3">Causes racines (groupées)</h2>
        {data.causes.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/10 p-8 text-center">
            <div className="text-4xl mb-2">✓</div>
            <p className="text-emerald-300 font-bold">Aucun incident technique cette semaine</p>
            <p className="text-white/50 text-xs mt-1">Tous les briefs Noah ont atteint 100% naturellement.</p>
          </div>
        ) : (
          <div className="space-y-3 mb-8">
            {data.causes.map((c, i) => {
              const sev = SEV_COLOR[c.severity] || SEV_COLOR.P2;
              return (
                <div
                  key={i}
                  className="rounded-xl border p-4"
                  style={{ borderColor: sev.border, background: sev.bg + '10' }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: sev.border + '30', color: sev.border }}
                        >
                          {c.severity}
                        </span>
                        {c.agents.map(a => (
                          <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{a}</span>
                        ))}
                        <span className="text-[10px] text-white/40">
                          {new Date(c.last_seen).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white">{c.cause}</h3>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold text-white">{c.incidents}</div>
                      <div className="text-[10px] text-white/50">incidents · {c.affected_clients} client{c.affected_clients > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  {c.sample_error && (
                    <div className="text-[11px] text-white/40 font-mono bg-black/30 px-2 py-1 rounded mb-2">
                      {c.sample_error}
                    </div>
                  )}
                  <div className="mt-2">
                    <div className="text-[11px] font-bold text-emerald-400 mb-1">Solutions proposées :</div>
                    <ul className="text-[12px] text-white/80 space-y-1 pl-4 list-disc">
                      {c.fixes.map((f, j) => <li key={j}>{f}</li>)}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent timeline */}
        <h2 className="text-lg font-bold mb-3">Incidents récents (50 derniers)</h2>
        {data.recent.length === 0 ? (
          <p className="text-white/40 text-sm">Aucun incident sur la période.</p>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left p-2.5 font-bold text-white/60 uppercase text-[10px]">Quand</th>
                  <th className="text-left p-2.5 font-bold text-white/60 uppercase text-[10px]">Client</th>
                  <th className="text-left p-2.5 font-bold text-white/60 uppercase text-[10px]">Plan</th>
                  <th className="text-left p-2.5 font-bold text-white/60 uppercase text-[10px]">Sev</th>
                  <th className="text-left p-2.5 font-bold text-white/60 uppercase text-[10px]">Gaps</th>
                  <th className="text-left p-2.5 font-bold text-white/60 uppercase text-[10px]">Causes</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-2.5 text-white/40">{new Date(r.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="p-2.5 text-white/80 truncate max-w-[180px]">{r.client}</td>
                    <td className="p-2.5 text-white/60">{r.plan}</td>
                    <td className="p-2.5">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: (SEV_COLOR[r.severity] || SEV_COLOR.P2).border + '30', color: (SEV_COLOR[r.severity] || SEV_COLOR.P2).border }}
                      >
                        {r.severity}
                      </span>
                    </td>
                    <td className="p-2.5 text-white/70">{r.gaps}</td>
                    <td className="p-2.5 text-white/50 truncate max-w-[300px]">{r.causes.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 text-[10px] text-white/30 text-center">
          Source : agent_logs(agent='ceo', action='noah_diagnostic') · Aggrégation côté API
        </div>
      </div>
    </div>
  );
}
