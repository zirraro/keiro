'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AGENTS = [
  { id: '', name: 'Tous les agents' },
  { id: 'content', name: 'Léna · Contenu' },
  { id: 'dm_instagram', name: 'Jade · DM' },
  { id: 'email', name: 'Hugo · Email' },
  { id: 'commercial', name: 'Léo · Prospection' },
  { id: 'reviews', name: 'Théo · Avis Google' },
  { id: 'ceo', name: 'Noah · CEO' },
  { id: 'marketing', name: 'Marketing' },
  { id: 'seo', name: 'SEO' },
  { id: 'instagram_comments', name: 'IG comments' },
  { id: 'onboarding', name: 'Onboarding' },
  { id: 'retention', name: 'Rétention' },
];

const PRESETS = [
  { id: '24h', label: '24h', ms: 24 * 3600 * 1000 },
  { id: '7d', label: '7 jours', ms: 7 * 24 * 3600 * 1000 },
  { id: '30d', label: '30 jours', ms: 30 * 24 * 3600 * 1000 },
  { id: '90d', label: '90 jours', ms: 90 * 24 * 3600 * 1000 },
];

export default function AdminAgentReportsPage() {
  const router = useRouter();
  const [agent, setAgent] = useState('');
  const [userId, setUserId] = useState('');
  const [preset, setPreset] = useState('7d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<{ id: string; email: string }[]>([]);

  useEffect(() => {
    // Load list of paying clients for the dropdown
    (async () => {
      const r = await fetch('/api/admin/agents/control/content', { credentials: 'include' });
      const j = await r.json();
      if (j.ok) {
        setClients((j.clients || []).map((c: any) => ({ id: c.user_id, email: c.email || c.user_id.substring(0, 8) })));
      }
    })();
  }, []);

  const run = async () => {
    setLoading(true);
    try {
      const presetMs = PRESETS.find(p => p.id === preset)?.ms || 7 * 24 * 3600 * 1000;
      const from = new Date(Date.now() - presetMs).toISOString();
      const params = new URLSearchParams();
      if (agent) params.set('agent', agent);
      if (userId) params.set('user_id', userId);
      params.set('from', from);
      const r = await fetch(`/api/admin/agents/reports?${params.toString()}`, { credentials: 'include' });
      const j = await r.json();
      setData(j);
    } finally { setLoading(false); }
  };

  const downloadCsv = () => {
    const presetMs = PRESETS.find(p => p.id === preset)?.ms || 7 * 24 * 3600 * 1000;
    const from = new Date(Date.now() - presetMs).toISOString();
    const params = new URLSearchParams();
    if (agent) params.set('agent', agent);
    if (userId) params.set('user_id', userId);
    params.set('from', from);
    params.set('format', 'csv');
    window.open(`/api/admin/agents/reports?${params.toString()}`, '_blank');
  };

  useEffect(() => { run(); }, []);

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button onClick={() => router.push('/admin/agents/control')} className="text-xs text-cyan-400 hover:underline mb-2">← Agent Control Center</button>
          <h1 className="text-2xl font-bold">📊 Rapports détaillés agents</h1>
          <p className="text-xs text-white/40 mt-1">Analyse + optimisation par agent × client × période · Export CSV</p>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">Agent</label>
            <select value={agent} onChange={e => setAgent(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs">
              {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">Client</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs">
              <option value="">Tous</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.email}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">Période</label>
            <select value={preset} onChange={e => setPreset(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs">
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-end">
            <button onClick={run} disabled={loading} className="flex-1 px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50">{loading ? '…' : 'Générer'}</button>
            <button onClick={downloadCsv} className="px-3 py-2 text-xs rounded-lg bg-white/10 hover:bg-white/15">⬇ CSV</button>
          </div>
        </div>

        {loading && <div className="text-center py-12 text-white/40">Chargement…</div>}
        {data && data.ok && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <KpiBox label="Runs" value={data.totals.runs} />
              <KpiBox label="Erreurs" value={data.totals.errors} color={data.totals.errors > 0 ? 'red' : 'green'} />
              <KpiBox label="Erreurs uniques" value={data.totals.unique_errors} />
              <KpiBox label="Période" value={`${data.period.from.substring(0, 10)} → ${data.period.to.substring(0, 10)}`} small />
            </div>

            {data.volume && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 mb-6">
                <h3 className="text-sm font-bold mb-2">Volume</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {Object.entries(data.volume).map(([k, v]) => (
                    <div key={k}><span className="text-white/40">{k}:</span> <strong>{String(v)}</strong></div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-white/5">
                <h3 className="text-sm font-bold">Daily breakdown ({data.daily_breakdown.length} lignes)</h3>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full text-xs">
                  <thead className="bg-white/[0.03] text-[10px] text-white/50 uppercase sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Jour</th>
                      <th className="px-3 py-2 text-left">Agent</th>
                      <th className="px-3 py-2 text-left">Client</th>
                      <th className="px-3 py-2 text-right">OK</th>
                      <th className="px-3 py-2 text-right">Err</th>
                      <th className="px-3 py-2 text-right">Success</th>
                      <th className="px-3 py-2 text-right">Moy</th>
                      <th className="px-3 py-2 text-right">P95</th>
                      <th className="px-3 py-2 text-right">P99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily_breakdown.map((r: any, i: number) => (
                      <tr key={i} className={`border-t border-white/5 ${r.err > 0 ? 'bg-red-500/5' : ''}`}>
                        <td className="px-3 py-1.5">{r.day}</td>
                        <td className="px-3 py-1.5 text-cyan-300">{r.agent}</td>
                        <td className="px-3 py-1.5 text-white/60 text-[10px]">{r.user_id.substring(0, 8) || '—'}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-300">{r.ok}</td>
                        <td className={`px-3 py-1.5 text-right ${r.err > 0 ? 'text-red-400 font-bold' : 'text-white/30'}`}>{r.err}</td>
                        <td className={`px-3 py-1.5 text-right ${r.success_rate >= 95 ? 'text-emerald-400' : r.success_rate >= 80 ? 'text-amber-400' : 'text-red-400'}`}>{r.success_rate}%</td>
                        <td className="px-3 py-1.5 text-right text-white/60">{r.avg_duration_ms ? `${Math.round(r.avg_duration_ms / 1000)}s` : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-white/60">{r.p95_ms ? `${Math.round(r.p95_ms / 1000)}s` : '—'}</td>
                        <td className={`px-3 py-1.5 text-right ${r.p99_ms > 120000 ? 'text-red-400' : 'text-white/60'}`}>{r.p99_ms ? `${Math.round(r.p99_ms / 1000)}s` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {data.top_errors.length > 0 && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 mb-6">
                <h3 className="text-sm font-bold mb-3">⚠️ Top erreurs ({data.top_errors.length})</h3>
                <ul className="space-y-2 max-h-72 overflow-y-auto">
                  {data.top_errors.map((e: any, i: number) => (
                    <li key={i} className="rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2">
                      <div className="flex justify-between gap-2 mb-1">
                        <span className="text-[11px] font-bold text-red-300">{e.action}</span>
                        <span className="text-[10px] text-white/40">×{e.count}</span>
                      </div>
                      <p className="text-[11px] text-white/60 break-words">{e.sample}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.learnings && data.learnings.length > 0 && (
              <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
                <h3 className="text-sm font-bold mb-3">🧠 Learnings actifs ({data.learnings.length})</h3>
                <ul className="space-y-2">
                  {data.learnings.map((l: any) => (
                    <li key={l.id} className="rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2">
                      <div className="flex justify-between gap-2 mb-1">
                        <span className="text-[10px] uppercase font-bold text-purple-300">{l.category}</span>
                        <span className="text-[10px] text-white/40">conf {Math.round(l.confidence * 100)}%</span>
                      </div>
                      <p className="text-[11px] text-white/80">{l.summary}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KpiBox({ label, value, color, small }: { label: string; value: any; color?: 'red' | 'green'; small?: boolean }) {
  const cc = color === 'red' ? 'text-red-400' : color === 'green' ? 'text-emerald-400' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`${small ? 'text-xs' : 'text-lg'} font-bold mt-0.5 ${cc}`}>{value}</div>
    </div>
  );
}
