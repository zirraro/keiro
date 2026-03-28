'use client';

import { useEffect, useState, useCallback } from 'react';

type QACheck = {
  name: string;
  module: string;
  agent: string;
  status: 'pass' | 'warn' | 'fail' | 'critical';
  message: string;
  duration_ms: number;
  fix?: string;
  details?: any;
};

type QASummary = {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  critical: number;
  modules_run: number;
  modules_errored: number;
  duration_ms: number;
};

type QAResult = {
  status: string;
  summary: QASummary;
  checks: QACheck[];
  module_errors?: Record<string, string>;
  ran_at: string;
};

const STATUS_CONFIG = {
  pass: { label: 'OK', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', icon: '\u2713' },
  warn: { label: 'Attention', color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500', icon: '!' },
  fail: { label: 'Echec', color: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500', icon: '\u2717' },
  critical: { label: 'Critique', color: 'bg-red-200 text-red-900 border-red-300', dot: 'bg-red-700', icon: '\u26A0' },
};

const GROUPS = [
  { id: 'full', label: 'Tout tester', icon: '\u{1F9EA}' },
  { id: 'quick', label: 'Rapide', icon: '\u26A1' },
  { id: 'agents', label: 'Agents', icon: '\u{1F916}' },
  { id: 'content', label: 'Contenu', icon: '\u{1F3A8}' },
  { id: 'acquisition', label: 'Acquisition', icon: '\u{1F4C8}' },
  { id: 'infrastructure', label: 'Infra', icon: '\u{1F527}' },
  { id: 'library', label: 'Library', icon: '\u{1F4DA}' },
];

export default function QADashboard() {
  const [result, setResult] = useState<QAResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState('full');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [lastHistory, setLastHistory] = useState<Array<{ ran_at: string; status: string; summary: QASummary }>>([]);
  const [copied, setCopied] = useState(false);
  const [clientHealth, setClientHealth] = useState<any>(null);
  const [loadingClients, setLoadingClients] = useState(false);

  const generateReport = useCallback(() => {
    if (!result) return '';
    const lines: string[] = [];
    lines.push(`# Rapport QA KeiroAI`);
    lines.push(`Date: ${new Date(result.ran_at).toLocaleString('fr-FR')}`);
    lines.push(`Status: ${result.status.toUpperCase()}`);
    lines.push(`${result.summary.pass}/${result.summary.total} OK | ${result.summary.warn} warnings | ${result.summary.fail} echecs | ${result.summary.critical} critiques`);
    lines.push(`Duree: ${result.summary.duration_ms}ms | ${result.summary.modules_run} modules\n`);

    const byModule: Record<string, QACheck[]> = {};
    for (const c of result.checks) {
      if (!byModule[c.module]) byModule[c.module] = [];
      byModule[c.module].push(c);
    }

    for (const [mod, checks] of Object.entries(byModule)) {
      const worst = checks.reduce<string>((w, c) => {
        const order = ['pass', 'warn', 'fail', 'critical'];
        return order.indexOf(c.status) > order.indexOf(w) ? c.status : w;
      }, 'pass');
      const icon = worst === 'pass' ? 'OK' : worst === 'warn' ? 'WARN' : worst === 'fail' ? 'FAIL' : 'CRITICAL';
      lines.push(`## [${icon}] ${mod}`);
      for (const c of checks) {
        const s = c.status === 'pass' ? 'v' : c.status === 'warn' ? '!' : c.status === 'fail' ? 'x' : '!!';
        lines.push(`- [${s}] ${c.name}: ${c.message}`);
        if (c.fix) lines.push(`  Fix: ${c.fix}`);
      }
      lines.push('');
    }

    if (result.module_errors && Object.keys(result.module_errors).length > 0) {
      lines.push(`## Erreurs modules`);
      for (const [mod, err] of Object.entries(result.module_errors)) {
        lines.push(`- ${mod}: ${err}`);
      }
    }

    return lines.join('\n');
  }, [result]);

  const copyReport = useCallback(() => {
    const report = generateReport();
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [generateReport]);

  const runQA = useCallback(async (group: string = selectedGroup) => {
    setLoading(true);
    setError(null);
    try {
      const param = group === 'full' ? '' : `?group=${group}`;
      const res = await fetch(`/api/qa${param}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: QAResult = await res.json();
      setResult(data);
      setLastHistory(prev => [
        { ran_at: data.ran_at, status: data.status, summary: data.summary },
        ...prev.slice(0, 9),
      ]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedGroup]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => runQA(), 60_000);
    return () => clearInterval(interval);
  }, [autoRefresh, runQA]);

  const checksByModule = result?.checks.reduce<Record<string, QACheck[]>>((acc, check) => {
    if (!acc[check.module]) acc[check.module] = [];
    acc[check.module].push(check);
    return acc;
  }, {}) || {};

  const filteredModules = Object.entries(checksByModule).filter(([, checks]) => {
    if (!filterStatus) return true;
    return checks.some(c => c.status === filterStatus);
  });

  const overallColor = result?.status === 'pass'
    ? 'from-emerald-500 to-green-600'
    : result?.status === 'warn'
      ? 'from-amber-500 to-orange-500'
      : 'from-red-500 to-red-700';

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-neutral-900">QA Agent Dashboard</h1>
              <p className="text-sm text-neutral-500">Tests automatiques de toutes les fonctionnalites KeiroAI</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                Auto-refresh 60s
              </label>
              <a href="/admin/agents" className="text-sm text-purple-600 hover:text-purple-800">
                ← Agents
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Group selector + Run button */}
        <div className="flex flex-wrap items-center gap-2">
          {GROUPS.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                selectedGroup === g.id
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-purple-300'
              }`}
            >
              {g.icon} {g.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {result && (
              <button
                onClick={copyReport}
                className="px-4 py-2 bg-white text-neutral-700 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-all"
              >
                {copied ? 'Copie !' : 'Copier rapport'}
              </button>
            )}
            <button
              onClick={() => runQA()}
              disabled={loading}
              className="px-5 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Tests en cours...' : 'Lancer les tests'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
            Erreur: {error}
          </div>
        )}

        {/* Summary cards */}
        {result && (
          <>
            <div className={`bg-gradient-to-r ${overallColor} rounded-xl p-6 text-white`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Status global</p>
                  <p className="text-3xl font-bold mt-1">{result.status.toUpperCase()}</p>
                  <p className="text-white/70 text-sm mt-1">
                    {result.summary.modules_run} modules | {result.summary.total} checks | {result.summary.duration_ms}ms
                  </p>
                </div>
                <div className="flex gap-4 text-center">
                  {(['pass', 'warn', 'fail', 'critical'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(filterStatus === s ? null : s)}
                      className={`rounded-lg px-3 py-2 transition-all ${
                        filterStatus === s ? 'bg-white/30 ring-2 ring-white' : 'bg-white/10 hover:bg-white/20'
                      }`}
                    >
                      <p className="text-2xl font-bold">{result.summary[s]}</p>
                      <p className="text-xs text-white/80">{STATUS_CONFIG[s].label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Checks by module */}
            <div className="grid gap-4">
              {filteredModules.map(([moduleName, checks]) => {
                const worstStatus = checks.reduce<QACheck['status']>((worst, c) => {
                  const order: QACheck['status'][] = ['pass', 'warn', 'fail', 'critical'];
                  return order.indexOf(c.status) > order.indexOf(worst) ? c.status : worst;
                }, 'pass');
                const cfg = STATUS_CONFIG[worstStatus];

                return (
                  <div key={moduleName} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className={`px-4 py-3 border-b ${cfg.color} flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                        <span className="font-semibold text-sm">{moduleName}</span>
                        <span className="text-xs opacity-70">({checks.length} checks)</span>
                      </div>
                      <span className="text-xs font-mono opacity-60">
                        {checks[0]?.agent}
                      </span>
                    </div>
                    <div className="divide-y divide-neutral-100">
                      {checks.map((check, i) => {
                        const checkCfg = STATUS_CONFIG[check.status];
                        return (
                          <div key={i} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                            <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${checkCfg.color}`}>
                              {checkCfg.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-neutral-900">{check.name}</span>
                                <span className="text-xs text-neutral-400">{check.duration_ms}ms</span>
                              </div>
                              <p className="text-neutral-600 mt-0.5">{check.message}</p>
                              {check.fix && (
                                <p className="text-purple-600 text-xs mt-1 flex items-center gap-1">
                                  <span>Fix:</span> {check.fix}
                                </p>
                              )}
                              {check.details && (
                                <details className="mt-1">
                                  <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600">Details</summary>
                                  <pre className="text-xs bg-neutral-50 rounded p-2 mt-1 overflow-x-auto">
                                    {JSON.stringify(check.details, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Module errors */}
            {result.module_errors && Object.keys(result.module_errors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="font-semibold text-red-900 text-sm mb-2">Modules en erreur</h3>
                {Object.entries(result.module_errors).map(([mod, err]) => (
                  <div key={mod} className="text-sm text-red-800 mt-1">
                    <span className="font-mono font-medium">{mod}</span>: {err}
                  </div>
                ))}
              </div>
            )}

            {/* Client health */}
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-neutral-900 text-sm">Sante clients</h3>
                <button
                  onClick={async () => {
                    setLoadingClients(true);
                    try {
                      const res = await fetch('/api/qa/clients');
                      if (res.ok) setClientHealth(await res.json());
                    } catch {} finally { setLoadingClients(false); }
                  }}
                  disabled={loadingClients}
                  className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-lg hover:bg-purple-200 disabled:opacity-50"
                >
                  {loadingClients ? 'Analyse...' : 'Analyser les clients'}
                </button>
              </div>
              {clientHealth && (
                <div className="space-y-2">
                  <div className="flex gap-3 text-xs text-neutral-500 mb-2">
                    <span>{clientHealth.total} clients</span>
                    <span className="text-emerald-600">{clientHealth.healthy} sains</span>
                    <span className="text-red-600">{clientHealth.at_risk} a risque</span>
                  </div>
                  {clientHealth.clients?.slice(0, 10).map((c: any) => (
                    <div key={c.client_id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${c.score >= 80 ? 'bg-emerald-50 border-emerald-100' : c.score >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
                      <span className="font-bold w-8">{c.score}%</span>
                      <span className="font-medium text-neutral-900 flex-1">{c.name} ({c.plan})</span>
                      <span className="text-neutral-400">{c.email}</span>
                      <div className="flex gap-1">
                        {c.checks.map((ch: any, i: number) => (
                          <span key={i} className={`w-2 h-2 rounded-full ${ch.status === 'pass' ? 'bg-emerald-400' : ch.status === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`} title={`${ch.name}: ${ch.message}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Run history */}
            {lastHistory.length > 1 && (
              <div className="bg-white rounded-xl border p-4">
                <h3 className="font-semibold text-neutral-900 text-sm mb-3">Historique des runs</h3>
                <div className="flex gap-2 overflow-x-auto">
                  {lastHistory.map((run, i) => (
                    <div
                      key={i}
                      className={`flex-shrink-0 rounded-lg border px-3 py-2 text-xs ${STATUS_CONFIG[run.status as keyof typeof STATUS_CONFIG]?.color || 'bg-neutral-100'}`}
                    >
                      <p className="font-mono">{new Date(run.ran_at).toLocaleTimeString('fr-FR')}</p>
                      <p className="mt-0.5">{run.summary.pass}/{run.summary.total} OK</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamp */}
            <p className="text-xs text-neutral-400 text-center">
              Dernier run: {new Date(result.ran_at).toLocaleString('fr-FR')}
            </p>
          </>
        )}

        {!result && !loading && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">{'\u{1F9EA}'}</div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">QA Agent</h2>
            <p className="text-neutral-500 mb-6">
              Teste toutes les fonctionnalites de KeiroAI comme un vrai client
            </p>
            <button
              onClick={() => runQA()}
              className="px-6 py-3 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 transition-all"
            >
              Lancer les tests
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
