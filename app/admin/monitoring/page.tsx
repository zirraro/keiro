'use client';

import { useState, useEffect } from 'react';

export default function MonitoringPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/monitoring', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen bg-[#060b18] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;
  if (!data?.ok) return <div className="min-h-screen bg-[#060b18] text-white p-8">Erreur chargement</div>;

  const { clients, totals } = data;

  return (
    <div className="min-h-screen bg-[#060b18] text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Monitoring & Coûts</h1>
            <p className="text-white/40 text-xs">Suivi des coûts par client — 30 derniers jours</p>
          </div>
          <a href="/admin/agents" className="text-xs text-purple-400 hover:text-purple-300">← Admin</a>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 p-4">
            <div className="text-2xl font-bold">{totals.total_clients}</div>
            <div className="text-xs text-white/70">Clients</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-green-600 p-4">
            <div className="text-2xl font-bold">{totals.total_revenue}€</div>
            <div className="text-xs text-white/70">Revenue MRR</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-red-600 to-orange-600 p-4">
            <div className="text-2xl font-bold">{totals.total_cost.toFixed(2)}€</div>
            <div className="text-xs text-white/70">Coût API estimé</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 p-4">
            <div className="text-2xl font-bold">{totals.total_margin.toFixed(0)}€</div>
            <div className="text-xs text-white/70">Marge estimée</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 p-4">
            <div className="text-2xl font-bold">{totals.avg_margin_pct}%</div>
            <div className="text-xs text-white/70">Marge moyenne</div>
          </div>
        </div>

        {/* Client table */}
        <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="text-left px-3 py-2 font-semibold text-white/60">Client</th>
                  <th className="text-left px-3 py-2 font-semibold text-white/60">Plan</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">Revenue</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">Coût API</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">Marge</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">%</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">Actions</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">Emails</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">DMs</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">Prospects</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">Crédits</th>
                  <th className="text-right px-3 py-2 font-semibold text-white/60">Agents</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c: any) => {
                  const marginColor = c.margin_pct >= 80 ? 'text-emerald-400' : c.margin_pct >= 50 ? 'text-amber-400' : 'text-red-400';
                  return (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-3 py-2">
                        <div className="font-medium text-white">{c.name}</div>
                        <div className="text-[9px] text-white/30">{c.email}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${c.plan === 'business' || c.plan === 'elite' ? 'bg-purple-500/20 text-purple-300' : c.plan === 'pro' || c.plan === 'fondateurs' ? 'bg-blue-500/20 text-blue-300' : c.plan === 'createur' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
                          {c.plan}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-white/70">{c.revenue}€</td>
                      <td className="px-3 py-2 text-right text-white/70">{c.estimated_cost.toFixed(2)}€</td>
                      <td className="px-3 py-2 text-right font-bold text-white">{c.margin.toFixed(0)}€</td>
                      <td className={`px-3 py-2 text-right font-bold ${marginColor}`}>{c.margin_pct}%</td>
                      <td className="px-3 py-2 text-right text-white/50">{c.actions_30d}</td>
                      <td className="px-3 py-2 text-right text-white/50">{c.emails_sent}</td>
                      <td className="px-3 py-2 text-right text-white/50">{c.dms_sent}</td>
                      <td className="px-3 py-2 text-right text-white/50">{c.prospects}</td>
                      <td className="px-3 py-2 text-right text-white/50">{c.credits_balance}/{c.credits_used}</td>
                      <td className="px-3 py-2 text-right text-white/50">{c.agents_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
