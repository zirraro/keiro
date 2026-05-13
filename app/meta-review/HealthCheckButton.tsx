'use client';

/**
 * Client-only Health Check panel for the /meta-review page.
 *
 * Calls /api/meta-review/health-check (read-only Graph API probe of
 * every requested permission) and renders a per-permission pass/fail
 * grid. Lets the founder verify everything works before recording a
 * screencast, and lets a Meta App Review reviewer confirm in one
 * click that every permission is live on the test account.
 */

import { useState } from 'react';

interface Check {
  permission: string;
  endpoint: string;
  ok: boolean;
  status: number;
  detail: string;
}

interface HealthResponse {
  ok: boolean;
  connected?: boolean;
  ig_business_account?: string;
  summary?: { total: number; pass: number; fail: number };
  checks?: Check[];
  when?: string;
  message?: string;
  error?: string;
}

const LABEL: Record<string, string> = {
  instagram_business_basic: 'Business profile basics',
  instagram_business_manage_messages: 'Manage DMs',
  instagram_business_content_publish: 'Publish content',
  instagram_business_manage_insights: 'Read insights',
  instagram_business_manage_comments: 'Manage comments',
  human_agent: 'Human Agent (>24h replies)',
};

export default function HealthCheckButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HealthResponse | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch('/api/meta-review/health-check', { credentials: 'include' });
      const j = (await r.json().catch(() => ({}))) as HealthResponse;
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
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60"
      >
        {busy ? 'Probing the Graph API…' : '🩺 Run permission health check'}
      </button>

      {result && !result.connected && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {result.message || result.error || 'No Instagram Business account connected. Connect first, then re-run the health check.'}
        </div>
      )}

      {result && result.checks && (
        <div className="mt-3 space-y-2">
          {result.summary && (
            <div className="text-[11px] text-neutral-600">
              <strong className="text-neutral-900">{result.summary.pass}/{result.summary.total}</strong> permissions live
              {result.summary.fail > 0 && <span className="text-rose-700 font-semibold ml-1">· {result.summary.fail} failure(s)</span>}
              <span className="text-neutral-400 ml-2">
                · ig_business_account {result.ig_business_account}
                {result.when && <> · {new Date(result.when).toLocaleString()}</>}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {result.checks.map((c, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 text-xs ${
                  c.ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                    c.ok ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                  }`}>
                    {c.ok ? '✓ PASS' : `✗ ${c.status}`}
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-900">
                    {LABEL[c.permission] || c.permission}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-neutral-600 mb-1">{c.endpoint}</div>
                <div className="text-[11px] text-neutral-700 break-words">{c.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
