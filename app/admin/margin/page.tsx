'use client';

import { useEffect, useState } from 'react';

type CogsBreakdown = {
  images: number; videos: number; tts: number; dms: number; emails: number;
  chatbot: number; agent_chat: number; analytics: number; seo: number;
  reviews: number; gmaps: number; infra: number; total: number;
};

type Snapshot = {
  userId: string;
  plan: string;
  revenueHT: number;
  cogs: CogsBreakdown;
  margin_abs: number;
  margin_pct: number;
  status: 'healthy' | 'warn' | 'blocked';
};

type Payload = {
  ok: boolean;
  summary: {
    total_clients: number;
    blocked: number;
    warn: number;
    healthy: number;
    total_revenue_ht: number;
    total_cogs: number;
    avg_margin_pct: number;
  };
  rows: Snapshot[];
};

export default function AdminMarginPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/margin', { credentials: 'include' })
      .then(r => r.json())
      .then((d: any) => {
        if (d.ok) setData(d);
        else setErr(d.error || 'Erreur inconnue');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060b18] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
      </div>
    );
  }
  if (err || !data) {
    return (
      <div className="min-h-screen bg-[#060b18] text-white p-8">
        <p className="text-red-400">Erreur: {err}</p>
        <a href="/admin/agents" className="text-purple-400 hover:text-purple-300 text-sm">← Admin</a>
      </div>
    );
  }

  const { summary, rows } = data;
  const margin_abs_total = summary.total_revenue_ht - summary.total_cogs;

  const statusColor = (s: Snapshot['status']) =>
    s === 'blocked' ? 'bg-red-500/20 text-red-400 border-red-500/40'
    : s === 'warn' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';

  return (
    <div className="min-h-screen bg-[#060b18] text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Marge par client — live</h1>
            <p className="text-white/40 text-xs">Usage ce mois × coûts API réels → marge brute. Seuil de blocage: 60%.</p>
          </div>
          <a href="/admin/agents" className="text-xs text-purple-400 hover:text-purple-300">← Admin</a>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 p-4">
            <div className="text-2xl font-bold">{summary.total_clients}</div>
            <div className="text-xs text-white/60">Clients payants</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-green-700 p-4">
            <div className="text-2xl font-bold">€{summary.total_revenue_ht.toFixed(0)}</div>
            <div className="text-xs text-white/80">MRR HT</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-red-600 to-orange-700 p-4">
            <div className="text-2xl font-bold">€{summary.total_cogs.toFixed(0)}</div>
            <div className="text-xs text-white/80">COGS estimé</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 p-4">
            <div className="text-2xl font-bold">€{margin_abs_total.toFixed(0)}</div>
            <div className="text-xs text-white/80">Marge absolue</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-purple-600 to-pink-700 p-4">
            <div className="text-2xl font-bold">{(summary.avg_margin_pct * 100).toFixed(1)}%</div>
            <div className="text-xs text-white/80">Marge moyenne</div>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex gap-3 mb-6 text-sm">
          <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/40">
            {summary.blocked} bloqué{summary.blocked !== 1 ? 's' : ''} (&lt;60%)
          </span>
          <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
            {summary.warn} alerte{summary.warn !== 1 ? 's' : ''} (60-70%)
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            {summary.healthy} sain{summary.healthy !== 1 ? 's' : ''} (&gt;70%)
          </span>
        </div>

        {/* Rows table */}
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-white/60">
                <tr>
                  <th className="text-left py-2 px-3">User</th>
                  <th className="text-left py-2 px-3">Plan</th>
                  <th className="text-right py-2 px-3">Revenu HT</th>
                  <th className="text-right py-2 px-3">COGS</th>
                  <th className="text-right py-2 px-3">Marge €</th>
                  <th className="text-right py-2 px-3">Marge %</th>
                  <th className="text-left py-2 px-3">Répartition COGS</th>
                  <th className="text-center py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const breakdown = [
                    { label: 'img', v: r.cogs.images },
                    { label: 'vid', v: r.cogs.videos },
                    { label: 'tts', v: r.cogs.tts },
                    { label: 'dm', v: r.cogs.dms },
                    { label: 'bot', v: r.cogs.chatbot },
                    { label: 'infra', v: r.cogs.infra },
                  ].filter(b => b.v > 0.01);
                  return (
                    <tr key={r.userId} className="border-t border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 font-mono text-white/70">{r.userId.slice(0, 8)}…</td>
                      <td className="py-2 px-3 uppercase text-white/80">{r.plan}</td>
                      <td className="py-2 px-3 text-right">€{r.revenueHT.toFixed(0)}</td>
                      <td className="py-2 px-3 text-right text-amber-300">€{r.cogs.total.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-emerald-300">€{r.margin_abs.toFixed(2)}</td>
                      <td className={`py-2 px-3 text-right font-bold ${r.status === 'blocked' ? 'text-red-400' : r.status === 'warn' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {(r.margin_pct * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 px-3 text-white/60">
                        {breakdown.map((b, i) => (
                          <span key={i} className="inline-block px-1.5 py-0.5 mr-1 mb-0.5 rounded bg-white/10 text-[10px]">
                            {b.label} €{b.v.toFixed(2)}
                          </span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${statusColor(r.status)}`}>
                          {r.status === 'blocked' ? 'BLOQUÉ' : r.status === 'warn' ? 'WARN' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-white/40">Aucun client payant à afficher.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[10px] text-white/40 mt-4">
          COGS calculé en temps réel depuis agent_logs × tarifs API moyens (Seedream €0,025/image, Seedance €0,03/s de vidéo, ElevenLabs €0,15/min, Haiku/Gemini moyenne pour les DMs/emails/chatbot). Les clients à &lt;60% de marge sont automatiquement bloqués côté génération (HTTP 429 marginBlocked=true) jusqu'à contact support ou upgrade plan.
        </p>
      </div>
    </div>
  );
}
