'use client';

import { useState, useEffect } from 'react';

type AgentGroup = {
  agent: string;
  runs_24h: number;
  errors_24h: number;
  error_rate: number;
  runs_7d: number;
  errors_7d: number;
  top_actions: string[];
  recent_errors: Array<{ action: string; error: string; created_at: string }>;
};

const AGENT_NAMES: Record<string, string> = {
  email: 'Hugo (Email)', commercial: 'Leo (Prospection)', dm_instagram: 'Jade (DM IG)',
  seo: 'Oscar (SEO)', content: 'Lena (Contenu)', onboarding: 'Clara (Onboarding)',
  retention: 'Theo R. (Retention)', marketing: 'Ami (Marketing)', chatbot: 'Max (Chatbot)',
  whatsapp: 'Stella (WhatsApp)', gmaps: 'Theo (Avis)', comptable: 'Louis (Finance)',
  ads: 'Felix (Pub)', rh: 'Sara (RH)', ceo: 'Noah (CEO)',
};

export default function AgentGroupDashboard() {
  const [data, setData] = useState<{ groups: AgentGroup[]; totals: any; cost_center?: any; client_activity?: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/agent-groups', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;
  if (!data) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><p className="text-neutral-500">Erreur de chargement</p></div>;

  const { groups, totals } = data;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Agent Group Dashboard</h1>
            <p className="text-sm text-neutral-500">Vue agregee de tous les agents de tous les clients</p>
          </div>
          <div className="flex gap-3">
            <a href="/admin/qa" className="text-sm text-purple-600 hover:text-purple-800">QA</a>
            <a href="/admin/agents" className="text-sm text-purple-600 hover:text-purple-800">Agents</a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-3xl font-bold text-neutral-900">{totals.runs_24h}</p>
            <p className="text-xs text-neutral-500">Executions 24h</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className={`text-3xl font-bold ${totals.errors_24h > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{totals.errors_24h}</p>
            <p className="text-xs text-neutral-500">Erreurs 24h</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-3xl font-bold text-purple-600">{totals.active_clients}</p>
            <p className="text-xs text-neutral-500">Clients actifs</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{data.cost_center?.total || 0}</p>
            <p className="text-xs text-neutral-500">Credits 7j</p>
          </div>
        </div>

        {/* Cost center */}
        {data.cost_center && (
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-semibold text-neutral-900 text-sm mb-3">{'\u{1F4B0}'} Centre de couts (7 jours)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(data.cost_center.by_agent || {}).sort((a: any, b: any) => b[1] - a[1]).map(([agent, credits]: any) => (
                <div key={agent} className="bg-neutral-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-neutral-900">{credits}</p>
                  <p className="text-[10px] text-neutral-500">{AGENT_NAMES[agent] || agent}</p>
                </div>
              ))}
            </div>
            {data.cost_center.by_feature && (
              <div className="mt-3 flex flex-wrap gap-1">
                {data.cost_center.by_feature.slice(0, 8).map(([feature, info]: any) => (
                  <span key={feature} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] rounded">
                    {feature}: {info.count}x ({info.totalCredits} cr)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Agent groups */}
        <div className="space-y-3">
          {groups.map(g => {
            const isExpanded = expandedAgent === g.agent;
            const hasErrors = g.errors_24h > 0;
            const name = AGENT_NAMES[g.agent] || g.agent;

            return (
              <div key={g.agent} className="bg-white rounded-xl border overflow-hidden">
                <button
                  onClick={() => setExpandedAgent(isExpanded ? null : g.agent)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 transition-colors"
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${hasErrors ? 'bg-red-500' : g.runs_24h > 0 ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                  <span className="font-semibold text-sm text-neutral-900 flex-1 text-left">{name}</span>
                  <div className="flex items-center gap-4 text-xs text-neutral-500">
                    <span>{g.runs_24h} runs</span>
                    {hasErrors && <span className="text-red-600 font-bold">{g.errors_24h} err ({g.error_rate}%)</span>}
                    <span className="text-neutral-300">7j: {g.runs_7d}</span>
                  </div>
                  <svg className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-neutral-100 pt-3 space-y-3">
                    {/* Top actions */}
                    <div>
                      <p className="text-xs font-semibold text-neutral-600 mb-1">Actions principales (24h)</p>
                      <div className="flex flex-wrap gap-1">
                        {g.top_actions.length > 0 ? g.top_actions.map((a, i) => (
                          <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] rounded">{a}</span>
                        )) : <span className="text-xs text-neutral-400">Aucune action</span>}
                      </div>
                    </div>

                    {/* Recent errors */}
                    {g.recent_errors.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-600 mb-1">Erreurs recentes</p>
                        {g.recent_errors.map((e, i) => (
                          <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-2 mb-1 text-xs">
                            <span className="font-mono text-red-800">{e.action}</span>
                            <span className="text-red-600 ml-2">{e.error}</span>
                            <span className="text-red-300 ml-2">{new Date(e.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Per-client activity */}
                    {data.client_activity?.[g.agent] && (
                      <div className="bg-blue-50 rounded-lg p-2 text-xs text-blue-800">
                        <span className="font-medium">{data.client_activity[g.agent].unique_clients} clients actifs</span>
                        <span className="mx-2">|</span>
                        <span>{data.client_activity[g.agent].total} actions</span>
                        {data.client_activity[g.agent].errors > 0 && (
                          <span className="text-red-600 ml-2">{data.client_activity[g.agent].errors} erreurs</span>
                        )}
                      </div>
                    )}

                    {/* Cost for this agent */}
                    {data.cost_center?.by_agent?.[g.agent] && (
                      <div className="text-xs text-neutral-400">
                        Cout 7j: {data.cost_center.by_agent[g.agent]} credits
                      </div>
                    )}

                    {/* Stats bar */}
                    <div className="flex gap-4 text-xs text-neutral-500">
                      <span>7j: {g.runs_7d} runs, {g.errors_7d} erreurs</span>
                      <span>Error rate 7j: {g.runs_7d > 0 ? Math.round((g.errors_7d / g.runs_7d) * 100) : 0}%</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
