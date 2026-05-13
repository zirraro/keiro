'use client';

/**
 * Client-only Agent Health Check panel for /meta-review.
 *
 * Calls /api/meta-review/agent-checks which runs the same Claude
 * classification logic the production agents use, on a battery of
 * canonical inputs. We know what each agent SHOULD answer; if the
 * answer drifts (Hugo stops flipping unsubscribes to dead, Théo stops
 * escalating legal threats…) this panel will surface it.
 *
 * Read-only, no production data is touched.
 */

import { useState } from 'react';

interface CheckResult {
  agent: string;
  scenario: string;
  pass: boolean;
  expected: string;
  actual: string;
  detail?: string;
}

interface Response {
  ok: boolean;
  summary?: {
    total: number;
    pass: number;
    fail: number;
    by_agent: Record<string, { pass: number; total: number }>;
  };
  results?: CheckResult[];
  when?: string;
  error?: string;
}

export default function AgentChecksButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Response | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch('/api/meta-review/agent-checks', { credentials: 'include' });
      const j = (await r.json().catch(() => ({}))) as Response;
      setResult({ ...j, ok: r.ok && (j.ok ?? false) });
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || 'Network error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold disabled:opacity-60"
      >
        {busy ? 'Running 10 canonical scenarios…' : '🧪 Run agent quality checks (Hugo + Théo)'}
      </button>

      {result && result.error && (
        <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {result.error}
        </div>
      )}

      {result && result.results && (
        <div className="mt-3 space-y-2">
          {result.summary && (
            <div className="text-[11px] text-neutral-600">
              <strong className="text-neutral-900">{result.summary.pass}/{result.summary.total}</strong> scenarios pass
              {result.summary.fail > 0 && <span className="text-rose-700 font-semibold ml-1">· {result.summary.fail} failure(s)</span>}
              <span className="text-neutral-400 ml-2">
                {Object.entries(result.summary.by_agent).map(([a, s]) => `${a} ${s.pass}/${s.total}`).join(' · ')}
                {result.when && <> · {new Date(result.when).toLocaleString()}</>}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2">
            {result.results.map((c, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 text-xs ${
                  c.pass ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                    c.pass ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                  }`}>
                    {c.pass ? '✓ PASS' : '✗ FAIL'}
                  </span>
                  <span className="text-[11px] font-bold text-neutral-900">
                    {c.agent}
                  </span>
                  <span className="text-[11px] text-neutral-700">
                    {c.scenario}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-600 mb-0.5">
                  <span className="font-semibold">Expected:</span> {c.expected}
                </div>
                <div className="text-[10px] text-neutral-600">
                  <span className="font-semibold">Got:</span> {c.actual}
                </div>
                {c.detail && (
                  <div className="mt-1 text-[10px] text-neutral-500 italic">{c.detail}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
