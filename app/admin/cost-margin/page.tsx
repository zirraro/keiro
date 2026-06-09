'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ClientRow {
  user_id: string;
  email: string;
  plan: string;
  revenue: number;
  cost: number;
  margin_pct: number;
  margin_status: 'green' | 'amber' | 'red';
  breakdown: Record<string, { count: number; cost: number }>;
  active_since_days: number;
}

interface PlanAgg {
  plan: string;
  clients: number;
  revenue: number;
  cost: number;
  margin_pct: number;
}

interface CostData {
  ok: boolean;
  window: string;
  global: {
    total_clients: number;
    total_revenue_eur: number;
    total_cost_eur: number;
    margin_pct: number;
    margin_status: 'green' | 'amber' | 'red';
  };
  by_plan: PlanAgg[];
  clients: ClientRow[];
}

export default function CostMarginPage() {
  const router = useRouter();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/cost-margin', { credentials: 'include' });
        if (r.ok) setData(await r.json());
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="min-h-screen bg-[#0c1a3a] text-white p-6 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400" /></div>;
  if (!data) return <div className="min-h-screen bg-[#0c1a3a] text-red-400 p-6">No data</div>;

  const g = data.global;
  const statusColor = g.margin_status === 'green' ? 'text-emerald-400' : g.margin_status === 'amber' ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start justify-between flex-wrap gap-2">
          <div>
            <button onClick={() => router.push('/admin/agents/control')} className="text-xs text-cyan-400 hover:underline mb-2">← Control Center</button>
            <h1 className="text-2xl font-bold">💰 Cost vs Margin Audit</h1>
            <p className="text-xs text-white/40 mt-1">Coûts estimés 30j × revenu plan · Cible 80% marge</p>
          </div>
          <a href="/admin/cost-margin/live" className="px-3 py-2 text-xs rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold hover:opacity-90">
            💸 Live Cost Pilot →
          </a>
        </div>

        {/* Global */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6">
          <h2 className="text-sm font-bold mb-3">Global · 30 derniers jours</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Clients payants" value={g.total_clients} />
            <Tile label="Revenu" value={`${g.total_revenue_eur.toFixed(2)} €`} color="cyan" />
            <Tile label="Coût infra" value={`${g.total_cost_eur.toFixed(2)} €`} color="amber" />
            <Tile label="Marge" value={`${g.margin_pct}%`} color={g.margin_status === 'green' ? 'green' : g.margin_status === 'amber' ? 'amber' : 'red'} />
          </div>
          <p className={`text-sm mt-3 ${statusColor}`}>
            {g.margin_status === 'green' ? '✅ Marge ≥ 80% (cible respectée)' : g.margin_status === 'amber' ? '⚠️ Marge 70-80% (à surveiller)' : '🚨 Marge < 70% (action requise)'}
          </p>
        </div>

        {/* By plan */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6">
          <h2 className="text-sm font-bold mb-3">Par plan</h2>
          <table className="min-w-full text-xs">
            <thead className="text-[10px] text-white/40 uppercase">
              <tr>
                <th className="text-left py-1">Plan</th>
                <th className="text-right py-1">Clients</th>
                <th className="text-right py-1">Revenu</th>
                <th className="text-right py-1">Coût</th>
                <th className="text-right py-1">Marge</th>
              </tr>
            </thead>
            <tbody>
              {data.by_plan.map((p) => {
                const sc = p.margin_pct >= 80 ? 'text-emerald-400' : p.margin_pct >= 70 ? 'text-amber-400' : 'text-red-400';
                return (
                  <tr key={p.plan} className="border-t border-white/5">
                    <td className="py-1.5 font-medium"><code>{p.plan}</code></td>
                    <td className="py-1.5 text-right">{p.clients}</td>
                    <td className="py-1.5 text-right text-cyan-300">{p.revenue.toFixed(2)} €</td>
                    <td className="py-1.5 text-right text-amber-300">{p.cost.toFixed(2)} €</td>
                    <td className={`py-1.5 text-right font-bold ${sc}`}>{p.margin_pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Per-client (sorted by margin worst first) */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-sm font-bold">Par client ({data.clients.length}) · triés marge ↑</h2>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.03] text-[10px] text-white/50 uppercase sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Marge</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-right">Revenu</th>
                  <th className="px-3 py-2 text-right">Coût</th>
                  <th className="px-3 py-2 text-left">Détail coûts</th>
                  <th className="px-3 py-2 text-right">Anc.</th>
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c) => {
                  const sc = c.margin_status === 'green' ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
                    : c.margin_status === 'amber' ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
                    : 'text-red-300 bg-red-500/15 border-red-500/30';
                  const emoji = c.margin_status === 'green' ? '✅' : c.margin_status === 'amber' ? '⚠️' : '🚨';
                  const detail: string[] = [];
                  if (c.breakdown.sonnet_runs.count > 0) detail.push(`Sonnet ${c.breakdown.sonnet_runs.count}×=${c.breakdown.sonnet_runs.cost}€`);
                  if (c.breakdown.haiku_runs.count > 0) detail.push(`Haiku ${c.breakdown.haiku_runs.count}×=${c.breakdown.haiku_runs.cost}€`);
                  if (c.breakdown.gemini_runs.count > 0) detail.push(`Gemini ${c.breakdown.gemini_runs.count}×=${c.breakdown.gemini_runs.cost}€`);
                  if (c.breakdown.images.count > 0) detail.push(`Img ${c.breakdown.images.count}=${c.breakdown.images.cost}€`);
                  if (c.breakdown.videos.count > 0) detail.push(`Vid ${c.breakdown.videos.count}=${c.breakdown.videos.cost}€`);
                  if (c.breakdown.places.count > 0) detail.push(`Places ${c.breakdown.places.count}=${c.breakdown.places.cost}€`);
                  if (c.breakdown.emails.count > 0) detail.push(`Mails ${c.breakdown.emails.count}=${c.breakdown.emails.cost}€`);
                  return (
                    <tr key={c.user_id} className={`border-t border-white/5 ${c.margin_status === 'red' ? 'bg-red-500/5' : c.margin_status === 'amber' ? 'bg-amber-500/5' : ''}`}>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold ${sc}`}>
                          {emoji} {c.margin_pct}%
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate text-white" title={c.email}>{c.email}</td>
                      <td className="px-3 py-2 text-white/60"><code>{c.plan}</code></td>
                      <td className="px-3 py-2 text-right text-cyan-300">{c.revenue.toFixed(0)} €</td>
                      <td className="px-3 py-2 text-right text-amber-300">{c.cost.toFixed(2)} €</td>
                      <td className="px-3 py-2 text-white/60 text-[10px] max-w-[400px] truncate" title={detail.join(' · ')}>{detail.join(' · ')}</td>
                      <td className="px-3 py-2 text-right text-white/40">{c.active_since_days}j</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-[10px] text-white/40">
          Coûts estimés à partir des heuristiques par-action (Sonnet 0.012€/call avec prompt caching ×0.55, Haiku 0.0015€/call, Gemini 0.001€/call, Seedream 0.04€/img, Seedance 0.30€/reel, Places 0.0035€/call, Brevo 0.0003€/email, OVH 0.40€/client). Précision ±15%. Pour les chiffres exacts, voir external_cost_uploads (factures mensuelles).
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: any; color?: 'green' | 'amber' | 'red' | 'cyan' }) {
  const cc = color === 'green' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : color === 'red' ? 'text-red-400' : color === 'cyan' ? 'text-cyan-400' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xl font-bold mt-1 ${cc}`}>{value}</div>
    </div>
  );
}
