'use client';

/**
 * Live cost dashboard — pilotage admin temps réel des coûts API.
 *
 * Founder ask 2026-06-09 : "centraliser dans admin un pilotage des
 * couts en live... pilotage fin pour maitriser nos marges au plus
 * pres du reel".
 */

import { useEffect, useState } from 'react';

interface LiveCosts {
  ok: boolean;
  period: string;
  period_start: string;
  totals: {
    eur: number;
    by_provider: Record<string, number>;
    by_agent: Record<string, number>;
    events_count: number;
  };
  daily: Array<{ date: string; eur: number; by_provider: Record<string, number> }>;
  top_clients: Array<{ user_id: string; email: string | null; eur: number }>;
  projection: { end_of_month_eur: number; days_elapsed: number; days_in_month: number; daily_avg: number } | null;
  monthly_revenue_estimate: number;
  margin_pct: number | null;
}

function computeAlerts(data: LiveCosts): { level: 'critical' | 'warning' | 'info'; message: string }[] {
  const alerts: { level: 'critical' | 'warning' | 'info'; message: string }[] = [];
  if (data.margin_pct !== null) {
    if (data.margin_pct < 60) alerts.push({ level: 'critical', message: `🚨 Marge ${data.margin_pct}% — sous le seuil critique 60%` });
    else if (data.margin_pct < 70) alerts.push({ level: 'warning', message: `⚠️ Marge ${data.margin_pct}% — sous l'objectif 70%` });
    else if (data.margin_pct < 80) alerts.push({ level: 'info', message: `ℹ️ Marge ${data.margin_pct}% — légèrement sous la cible 80%` });
  }
  if (data.projection && data.monthly_revenue_estimate > 0) {
    if (data.projection.end_of_month_eur > data.monthly_revenue_estimate) {
      alerts.push({ level: 'critical', message: `🚨 Projection ${data.projection.end_of_month_eur.toFixed(0)}€ DÉPASSE revenu ${data.monthly_revenue_estimate}€` });
    } else if (data.projection.end_of_month_eur > data.monthly_revenue_estimate * 0.7) {
      alerts.push({ level: 'warning', message: `⚠️ Projection ${data.projection.end_of_month_eur.toFixed(0)}€ proche du revenu ${data.monthly_revenue_estimate}€` });
    }
  }
  // Spike detection : si top client > 30% du total
  if (data.top_clients.length > 0 && data.totals.eur > 0) {
    const topClient = data.top_clients[0];
    const topShare = (topClient.eur / data.totals.eur) * 100;
    if (topShare > 30) {
      alerts.push({ level: 'warning', message: `⚡ Top client (${topClient.email}) consomme ${topShare.toFixed(0)}% du total` });
    }
  }
  return alerts;
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-amber-500',
  gemini: 'bg-blue-500',
  seedream: 'bg-purple-500',
  seedance: 'bg-pink-500',
  kling: 'bg-cyan-500',
  places: 'bg-red-500',
  elevenlabs: 'bg-violet-500',
  brevo: 'bg-emerald-500',
  stripe: 'bg-indigo-500',
};

export default function LiveCostsPage() {
  const [data, setData] = useState<LiveCosts | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'24h' | '7d' | 'mtd'>('mtd');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/costs/live?period=${period}`, { credentials: 'include' })
      .then(r => r.json())
      .then((j: LiveCosts) => setData(j))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] text-white p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] text-red-400 p-6">
        Erreur — admin requis
      </div>
    );
  }

  const totalEur = data.totals.eur;
  const projection = data.projection;
  const marginPct = data.margin_pct ?? 0;
  const marginColor = marginPct >= 80 ? 'text-emerald-400' : marginPct >= 70 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <a href="/admin/cost-margin" className="text-xs text-cyan-400 hover:underline">← Cost & Margin</a>
            <h1 className="text-2xl font-bold mt-1">💸 Live Cost Pilot</h1>
            <p className="text-xs text-white/40 mt-1">
              {data.totals.events_count} événements · période <strong>{period === 'mtd' ? 'mois en cours' : period === '7d' ? '7 derniers jours' : '24h'}</strong>
            </p>
          </div>
          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            {(['24h', '7d', 'mtd'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-[11px] font-medium ${
                  period === p ? 'bg-cyan-500 text-[#0c1a3a]' : 'text-white/60 hover:text-white'
                }`}
              >
                {p === 'mtd' ? 'Ce mois' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts section */}
        {(() => {
          const alerts = computeAlerts(data);
          if (alerts.length === 0) return null;
          return (
            <div className="mb-4 space-y-2">
              {alerts.map((a, i) => {
                const cls = a.level === 'critical'
                  ? 'border-red-500/40 bg-red-500/10 text-red-300'
                  : a.level === 'warning'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-cyan-500/30 bg-cyan-500/5 text-cyan-300';
                return (
                  <div key={i} className={`rounded-lg border px-3 py-2 text-sm font-medium ${cls}`}>
                    {a.message}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Top KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Total dépensé" value={`${totalEur.toFixed(2)} €`} />
          {projection && (
            <KpiCard label="Projection fin de mois" value={`${projection.end_of_month_eur.toFixed(2)} €`} sub={`${projection.days_elapsed}/${projection.days_in_month} j · ~${projection.daily_avg.toFixed(2)} €/j`} />
          )}
          <KpiCard label="Revenu mensuel estimé" value={`${data.monthly_revenue_estimate.toFixed(0)} €`} />
          {marginPct !== null && (
            <KpiCard label="Marge estimée" value={`${marginPct}%`} color={marginColor} />
          )}
        </div>

        {/* By provider */}
        <Card title="Coûts par provider">
          <ProviderBars totals={data.totals.by_provider} grandTotal={totalEur} />
        </Card>

        {/* By agent */}
        {Object.keys(data.totals.by_agent).length > 0 && (
          <Card title="Coûts par agent">
            <AgentBars totals={data.totals.by_agent} grandTotal={totalEur} />
          </Card>
        )}

        {/* Daily evolution */}
        {data.daily.length > 0 && (
          <Card title="Évolution quotidienne">
            <DailyChart daily={data.daily} />
          </Card>
        )}

        {/* Top clients */}
        {data.top_clients.length > 0 && (
          <Card title="Top 10 clients consommateurs">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="text-left py-2">Client</th>
                  <th className="text-right py-2">Dépense</th>
                  <th className="text-right py-2">% total</th>
                </tr>
              </thead>
              <tbody>
                {data.top_clients.map(c => (
                  <tr key={c.user_id} className="border-t border-white/5">
                    <td className="py-1.5 text-white/80 truncate max-w-[300px]">{c.email || c.user_id.substring(0, 8)}</td>
                    <td className="py-1.5 text-right font-mono">{c.eur.toFixed(2)} €</td>
                    <td className="py-1.5 text-right text-white/50">{totalEur > 0 ? Math.round((c.eur / totalEur) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Empty state */}
        {data.totals.events_count === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <p className="text-white/60 text-sm">
              ⏳ Aucun événement de coût pour cette période.
            </p>
            <p className="text-white/40 text-[11px] mt-2">
              L'instrumentation est en place (Anthropic, Seedream, Kling). Les events vont remonter dès la prochaine génération.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color || 'text-white'}`}>{value}</div>
      {sub && <div className="text-[10px] text-white/40 mt-1">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
      <h3 className="text-sm font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ProviderBars({ totals, grandTotal }: { totals: Record<string, number>; grandTotal: number }) {
  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
  if (sorted.length === 0) return <p className="text-xs text-white/40">—</p>;
  return (
    <div className="space-y-2">
      {sorted.map(([prov, eur]) => {
        const pct = grandTotal > 0 ? (eur / grandTotal) * 100 : 0;
        return (
          <div key={prov} className="flex items-center gap-3">
            <span className="text-xs text-white/80 capitalize min-w-[100px]">{prov}</span>
            <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full transition-all ${PROVIDER_COLORS[prov] || 'bg-white/30'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-mono text-white/70 min-w-[60px] text-right">{eur.toFixed(2)} €</span>
            <span className="text-[10px] text-white/40 min-w-[35px] text-right">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function AgentBars({ totals, grandTotal }: { totals: Record<string, number>; grandTotal: number }) {
  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
  return (
    <div className="space-y-2">
      {sorted.map(([agent, eur]) => {
        const pct = grandTotal > 0 ? (eur / grandTotal) * 100 : 0;
        return (
          <div key={agent} className="flex items-center gap-3">
            <span className="text-xs text-white/80 capitalize min-w-[120px]">{agent}</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-cyan-500/70" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-mono text-white/70 min-w-[60px] text-right">{eur.toFixed(2)} €</span>
          </div>
        );
      })}
    </div>
  );
}

function DailyChart({ daily }: { daily: Array<{ date: string; eur: number }> }) {
  const max = Math.max(1, ...daily.map(d => d.eur));
  return (
    <div className="flex items-end gap-1 h-32">
      {daily.map(d => {
        const h = (d.eur / max) * 100;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.eur.toFixed(2)} €`}>
            <div className="w-full bg-cyan-500/70 rounded-t transition-all" style={{ height: `${h}%`, minHeight: '2px' }} />
            <span className="text-[8px] text-white/40">{d.date.substring(8)}</span>
          </div>
        );
      })}
    </div>
  );
}
