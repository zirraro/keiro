'use client';

import { useEffect, useState } from 'react';

type EnrichmentStatus = { total: number; per_agent: Record<string, number> };
type RagStatus = { agent: string; count: number; with_embedding: number; latest: string | null };

/**
 * Single-pane view of the agent ecosystem's health:
 *   - Live enrichment progress (source='enrichment_campaign' counts per agent)
 *   - Total knowledge per agent + embedding coverage
 *   - Feature-flag state (active / disabled / business-plan-only)
 */
const PLAN_TIER: Record<string, string> = {
  content: 'Créateur', dm_instagram: 'Créateur', email: 'Créateur',
  commercial: 'Créateur', gmaps: 'Créateur', marketing: 'Créateur',
  onboarding: 'Créateur',
  seo: 'Pro',
  chatbot: 'Business', retention: 'Business',
  ads: 'Disabled', rh: 'Disabled', comptable: 'Disabled',
  whatsapp: 'Disabled', tiktok_comments: 'Disabled', linkedin: 'Disabled',
};

const DISABLED = new Set(['ads', 'rh', 'comptable', 'whatsapp', 'tiktok_comments', 'linkedin', 'emma', 'felix', 'sara', 'stella', 'louis', 'axel']);

export default function AgentsHealthPage() {
  const [enrichment, setEnrichment] = useState<EnrichmentStatus | null>(null);
  const [rag, setRag] = useState<RagStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [enrichRes, ragRes] = await Promise.all([
        fetch('/api/admin/enrich-agents', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/admin/agents-health', { credentials: 'include' }).then(r => r.json()),
      ]);
      if (enrichRes.ok) setEnrichment({ total: enrichRes.total, per_agent: enrichRes.per_agent });
      if (ragRes.ok) setRag(ragRes.agents || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000); // poll every 30s so enrichment progress stays live
    return () => clearInterval(t);
  }, []);

  if (loading && !rag) {
    return (
      <div className="min-h-screen bg-[#060b18] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
      </div>
    );
  }

  const tierColor = (t: string) =>
    t === 'Créateur' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
    : t === 'Pro' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
    : t === 'Business' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    : 'bg-red-500/20 text-red-400 border-red-500/40';

  const staleness = (latest: string | null) => {
    if (!latest) return { label: '—', color: 'text-white/30' };
    const days = Math.floor((Date.now() - new Date(latest).getTime()) / 86400000);
    if (days <= 1) return { label: 'Actif', color: 'text-emerald-400' };
    if (days <= 7) return { label: `${days}j`, color: 'text-white/60' };
    if (days <= 30) return { label: `${days}j`, color: 'text-amber-400' };
    return { label: `${days}j`, color: 'text-red-400' };
  };

  const ragMap = new Map((rag || []).map(r => [r.agent, r]));

  // Build combined rows: one per agent that appears anywhere
  const agentIds = new Set<string>([
    ...Object.keys(PLAN_TIER),
    ...(rag || []).map(r => r.agent),
    ...Object.keys(enrichment?.per_agent || {}),
  ]);

  const rows = Array.from(agentIds).map(id => ({
    id,
    tier: PLAN_TIER[id] || 'Other',
    enriched: enrichment?.per_agent?.[id] || 0,
    rag: ragMap.get(id)?.count || 0,
    with_embedding: ragMap.get(id)?.with_embedding || 0,
    latest: ragMap.get(id)?.latest || null,
    disabled: DISABLED.has(id),
  })).sort((a, b) => {
    // Créateur → Pro → Business → Disabled → Other
    const order: Record<string, number> = { 'Créateur': 0, 'Pro': 1, 'Business': 2, 'Disabled': 3, 'Other': 4 };
    return (order[a.tier] ?? 5) - (order[b.tier] ?? 5) || (b.rag - a.rag);
  });

  const totalRag = rows.reduce((s, r) => s + r.rag, 0);
  const totalEnriched = enrichment?.total || 0;

  return (
    <div className="min-h-screen bg-[#060b18] text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Santé des agents — live</h1>
            <p className="text-white/40 text-xs mt-0.5">
              Enrichissement · RAG · Feature flags. Rafraîchi toutes les 30s.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchAll} className="text-xs text-purple-400 hover:text-purple-300">
              \u21BB Rafraîchir
            </button>
            <a href="/admin/margin" className="text-xs text-cyan-400 hover:text-cyan-300">Marge →</a>
            <a href="/admin/agents" className="text-xs text-white/60 hover:text-white">← Admin</a>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm px-4 py-3">
            {err}
          </div>
        )}

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 p-4">
            <div className="text-2xl font-bold">{rows.length}</div>
            <div className="text-xs text-white/60">Agents suivis</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-green-700 p-4">
            <div className="text-2xl font-bold">{totalRag.toLocaleString()}</div>
            <div className="text-xs text-white/80">Entrées RAG</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 p-4">
            <div className="text-2xl font-bold">+{totalEnriched}</div>
            <div className="text-xs text-white/80">Items enrichis</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-red-600 to-orange-700 p-4">
            <div className="text-2xl font-bold">{rows.filter(r => r.disabled).length}</div>
            <div className="text-xs text-white/80">Désactivés (warm)</div>
          </div>
        </div>

        {/* Rows table */}
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-white/60">
                <tr>
                  <th className="text-left py-2.5 px-3">Agent</th>
                  <th className="text-left py-2.5 px-3">Plan</th>
                  <th className="text-right py-2.5 px-3">RAG</th>
                  <th className="text-right py-2.5 px-3">Embeddings</th>
                  <th className="text-right py-2.5 px-3">Enrichi cette campagne</th>
                  <th className="text-center py-2.5 px-3">Dernière activité</th>
                  <th className="text-center py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const s = staleness(r.latest);
                  const embedPct = r.rag > 0 ? Math.round((r.with_embedding / r.rag) * 100) : 100;
                  return (
                    <tr key={r.id} className={`border-t border-white/5 hover:bg-white/5 ${r.disabled ? 'opacity-60' : ''}`}>
                      <td className="py-2.5 px-3 font-mono text-white/80">{r.id}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${tierColor(r.tier)}`}>
                          {r.tier}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{r.rag.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        <span className={embedPct < 95 ? 'text-amber-400' : 'text-emerald-400'}>
                          {embedPct}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-purple-300">
                        {r.enriched > 0 ? `+${r.enriched}` : '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-center ${s.color}`}>{s.label}</td>
                      <td className="py-2.5 px-3 text-center">
                        {r.disabled ? (
                          <span className="text-[10px] text-red-400">Pausé</span>
                        ) : r.rag > 0 ? (
                          <span className="text-[10px] text-emerald-400">Actif</span>
                        ) : (
                          <span className="text-[10px] text-white/30">Vide</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[10px] text-white/40 mt-4">
          Désactivés = feature flag off dans lib/agents/feature-flags.ts (ads, rh, comptable, whatsapp, tiktok_comments, linkedin). Leur
          savoir est conservé et continue d&apos;être enrichi — ils reprennent leur rôle dès réactivation.
        </p>
      </div>
    </div>
  );
}
