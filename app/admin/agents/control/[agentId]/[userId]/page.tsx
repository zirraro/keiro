'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface ErrorBucket {
  fingerprint: string;
  action: string;
  raw: string;
  count: number;
  last_seen: string;
}

interface Drilldown {
  ok: boolean;
  agent_id: string;
  user_id: string;
  client: any;
  window: string;
  summary: {
    ok_runs: number;
    err_runs: number;
    success_rate: number;
    unique_errors: number;
    avg_duration_ms: number;
    p50_duration_ms: number;
    p95_duration_ms: number;
    p99_duration_ms: number;
  };
  volume_7d: any;
  errors_grouped: ErrorBucket[];
  timeline: Array<{ id: string; action: string; status: string; created_at: string; duration_ms: number | null; preview: string }>;
  activity_by_day: Array<{ date: string; ok: number; err: number }>;
  shared_learnings: Array<{ id: string; summary: string; content: string; confidence: number; source: string }>;
  global_error_patterns: Array<{ id: string; summary: string; content: string; confidence: number; source: string }>;
  directives: Array<{ type: string; value: any; raw_text: string; confidence: number; source: string; updated_at: string }>;
}

interface AuditSummary {
  id: string;
  severity: 'green' | 'amber' | 'red';
  findings: Array<{ code: string; severity: string; title: string; detail: string }>;
  recommendations: any[];
  status: string;
  resolution_kind: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  knowledge_id: string | null;
  trigger_kind: string;
  created_at: string;
  client_business_type?: string | null;
  client_email?: string | null;
  metrics?: any;
}

export default function ClientDrilldownPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params?.agentId as string;
  const userId = params?.userId as string;
  const [data, setData] = useState<Drilldown | null>(null);
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<AuditSummary | null>(null);

  const loadDrill = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/agents/control/${agentId}/${userId}`, { credentials: 'include' });
      if (r.ok) setData(await r.json());
    } catch {}
  }, [agentId, userId]);

  const loadAudits = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/agents/audit?agent=${agentId}&user_id=${userId}&limit=50`, { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        setAudits(j.audits || []);
      }
    } catch {}
  }, [agentId, userId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDrill(), loadAudits()]).finally(() => setLoading(false));
  }, [loadDrill, loadAudits]);

  const load = loadDrill;

  const pilot = async (action: 'trigger' | 'pause' | 'resume') => {
    setBusy(true);
    try {
      await fetch(`/api/admin/agents/control/${agentId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, user_id: userId }),
      });
      await load();
    } finally { setBusy(false); }
  };

  const runAudit = async () => {
    setAuditing(true);
    try {
      const r = await fetch('/api/admin/agents/audit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentId, user_id: userId }),
      });
      const j = await r.json();
      if (j.ok && j.audit) {
        setSelectedAudit(j.audit);
        await loadAudits();
      } else {
        alert(`Audit failed: ${j.error || 'unknown'}`);
      }
    } finally { setAuditing(false); }
  };

  const resolveAudit = async (auditId: string, kind: string, note?: string, knowledge?: any) => {
    const r = await fetch(`/api/admin/agents/audit/${auditId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, note, knowledge }),
    });
    if (r.ok) {
      const j = await r.json();
      setSelectedAudit(j.audit);
      await loadAudits();
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0c1a3a] text-white p-6 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400" /></div>;
  if (!data) return <div className="min-h-screen bg-[#0c1a3a] text-red-400 p-6">No data</div>;

  const c = data.client;
  const s = data.summary;
  const maxBar = Math.max(1, ...data.activity_by_day.map(d => d.ok + d.err));

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <button onClick={() => router.push(`/admin/agents/control/${agentId}`)} className="text-xs text-cyan-400 hover:underline mb-2">← {agentId}</button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {c.email || c.user_id?.substring(0, 8)}
              {c.scheduling_paused_at && <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5">⏸ paused</span>}
            </h1>
            <div className="text-xs text-white/50 mt-1 flex flex-wrap gap-3">
              <span><strong className="text-white/80">{c.business_type || '—'}</strong> · {c.city || '—'}</span>
              <span>Plan : <strong className="text-white/80">{c.subscription_plan}</strong></span>
              {c.instagram_username && <span>IG : @{c.instagram_username}</span>}
              {c.tiktok_username && <span>TT : @{c.tiktok_username}</span>}
              {(c.smtp_host || c.managed_email_from) && <span>Email : ✓</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={runAudit} disabled={auditing} className="px-3 py-2 text-xs rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 font-bold" title="Audit supervision approfondi (persistant)">🔍 {auditing ? 'Audit en cours...' : 'Lancer audit'}</button>
            <button onClick={() => pilot('trigger')} disabled={busy} className="px-3 py-2 text-xs rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50">▶ Trigger now</button>
            {c.scheduling_paused_at ? (
              <button onClick={() => pilot('resume')} disabled={busy} className="px-3 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">Resume</button>
            ) : (
              <button onClick={() => pilot('pause')} disabled={busy} className="px-3 py-2 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50">Pause</button>
            )}
            <button onClick={() => { setLoading(true); Promise.all([loadDrill(), loadAudits()]).finally(() => setLoading(false)); }} className="px-3 py-2 text-xs rounded-lg bg-white/10 hover:bg-white/15">↻</button>
          </div>
        </div>

        {/* Perf KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
          <Kpi label="Runs OK 30j" value={s.ok_runs} color="green" />
          <Kpi label="Runs KO 30j" value={s.err_runs} color={s.err_runs > 0 ? 'red' : 'green'} />
          <Kpi label="Success" value={`${s.success_rate}%`} color={s.success_rate >= 95 ? 'green' : s.success_rate >= 80 ? 'amber' : 'red'} />
          <Kpi label="Erreurs uniques" value={s.unique_errors} color={s.unique_errors > 0 ? 'amber' : 'green'} />
          <Kpi label="Latence moy" value={`${Math.round(s.avg_duration_ms / 1000)}s`} />
          <Kpi label="P50" value={`${Math.round(s.p50_duration_ms / 1000)}s`} />
          <Kpi label="P95" value={`${Math.round(s.p95_duration_ms / 1000)}s`} color={s.p95_duration_ms > 60000 ? 'amber' : undefined} />
          <Kpi label="P99" value={`${Math.round(s.p99_duration_ms / 1000)}s`} color={s.p99_duration_ms > 120000 ? 'red' : s.p99_duration_ms > 60000 ? 'amber' : undefined} />
        </div>

        {/* Activity chart */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6">
          <h3 className="text-sm font-bold mb-2">Activité 30j (OK / erreurs par jour)</h3>
          <div className="flex items-end gap-1 h-24">
            {data.activity_by_day.slice().reverse().map((d) => {
              const total = d.ok + d.err;
              const hOk = (d.ok / maxBar) * 100;
              const hErr = (d.err / maxBar) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center" title={`${d.date} : ${d.ok} OK, ${d.err} err`}>
                  <div className="w-full flex flex-col-reverse" style={{ height: '90px' }}>
                    <div className="w-full bg-emerald-500/70" style={{ height: `${hOk}%` }} />
                    {d.err > 0 && <div className="w-full bg-red-500/70" style={{ height: `${hErr}%` }} />}
                  </div>
                  <span className="text-[8px] text-white/30 mt-0.5">{d.date.substring(8)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Errors grouped + Shared learnings side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              ⚠️ Erreurs récurrentes <span className="text-[10px] text-white/40 font-normal">({data.errors_grouped.length})</span>
            </h3>
            {data.errors_grouped.length === 0 ? (
              <p className="text-xs text-emerald-400">Aucune erreur sur 30j 🎉</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {data.errors_grouped.map((e) => (
                  <li key={e.fingerprint} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="text-[11px] font-bold text-red-300">{e.action}</span>
                      <span className="text-[10px] text-white/40">×{e.count} · {formatRelative(e.last_seen)}</span>
                    </div>
                    <p className="text-[11px] text-white/70 break-words">{e.raw}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              🧠 Savoir mutualisé applicable
              <span className="text-[10px] text-cyan-300/70 font-normal">(business_type={c.business_type || '—'})</span>
            </h3>
            {data.shared_learnings.length === 0 && data.global_error_patterns.length === 0 ? (
              <p className="text-xs text-white/40">Pas encore de learnings pour ce type. Identifie un pattern → propage automatiquement.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {data.global_error_patterns.map((g) => (
                  <li key={g.id} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-amber-300">pattern global</span>
                      <span className="text-[10px] text-white/40">conf {Math.round(g.confidence * 100)}%</span>
                    </div>
                    <p className="text-[11px] text-white/80 font-medium">{g.summary}</p>
                    {g.content && <p className="text-[10px] text-white/50 mt-1">{g.content.substring(0, 180)}</p>}
                  </li>
                ))}
                {data.shared_learnings.map((sl) => (
                  <li key={sl.id} className="rounded-lg border border-cyan-500/20 bg-white/[0.02] px-3 py-2">
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-cyan-300">{sl.source}</span>
                      <span className="text-[10px] text-white/40">conf {Math.round(sl.confidence * 100)}%</span>
                    </div>
                    <p className="text-[11px] text-white/80">{sl.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Directives client */}
        {data.directives.length > 0 && (
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 mb-6">
            <h3 className="text-sm font-bold mb-3">⚙️ Directives client ({data.directives.length})</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.directives.map((d, i) => (
                <li key={i} className="rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-purple-300 font-bold mb-0.5">{d.type}</div>
                  <p className="text-[11px] text-white/80 truncate" title={d.raw_text}>{d.raw_text}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h3 className="text-sm font-bold">Timeline (100 derniers logs)</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.03] text-[10px] text-white/50 uppercase sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Quand</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2 text-right">Durée</th>
                  <th className="px-3 py-2 text-left">Preview</th>
                </tr>
              </thead>
              <tbody>
                {data.timeline.map((t) => {
                  const isErr = t.status === 'error' || t.status === 'failed';
                  return (
                    <tr key={t.id} className={`border-t border-white/5 ${isErr ? 'bg-red-500/5' : ''}`}>
                      <td className="px-3 py-1.5 text-white/50 text-[11px]">{formatRelative(t.created_at)}</td>
                      <td className="px-3 py-1.5 text-white/80 text-[11px]">{t.action}</td>
                      <td className="px-3 py-1.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isErr ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{t.status}</span></td>
                      <td className="px-3 py-1.5 text-right font-mono text-white/60">{t.duration_ms ? `${Math.round(t.duration_ms / 1000)}s` : '—'}</td>
                      <td className="px-3 py-1.5 text-white/60 text-[11px] max-w-[400px] truncate" title={t.preview}>{t.preview || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── Historique des audits sur ce client × cet agent ─── */}
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-purple-500/20 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold">📋 Historique audits supervision ({audits.length})</h3>
            <button onClick={runAudit} disabled={auditing} className="px-3 py-1.5 text-[11px] rounded bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:opacity-50">🔍 {auditing ? 'En cours...' : 'Nouvel audit'}</button>
          </div>
          {audits.length === 0 ? (
            <p className="px-4 py-6 text-xs text-white/40 text-center">Aucun audit lancé pour ce client. Clique "Lancer audit" en haut pour démarrer.</p>
          ) : (
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.03] text-[10px] text-white/50 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Quand</th>
                  <th className="px-3 py-2 text-left">Sévérité</th>
                  <th className="px-3 py-2 text-left">Findings</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2 text-left">Trigger</th>
                  <th className="px-3 py-2 text-left">Résolution</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id} className="border-t border-white/5 hover:bg-white/[0.04]">
                    <td className="px-3 py-2 text-white/60 text-[11px]">{new Date(a.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${a.severity === 'red' ? 'bg-red-500/15 text-red-300' : a.severity === 'amber' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{a.severity}</span></td>
                    <td className="px-3 py-2 text-white/70 text-[11px]">{a.findings?.length || 0} item(s){a.findings?.length ? ` — ${a.findings[0].title}` : ''}</td>
                    <td className="px-3 py-2 text-[10px]">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        a.status === 'open' ? 'bg-amber-500/15 text-amber-300' :
                        a.status === 'mutualised' ? 'bg-cyan-500/15 text-cyan-300' :
                        'bg-emerald-500/15 text-emerald-300'
                      }`}>{a.status}</span>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-white/40">{a.trigger_kind}</td>
                    <td className="px-3 py-2 text-[10px] text-white/60">{a.resolution_kind || '—'}{a.knowledge_id && <span className="text-cyan-300 ml-1">🧠</span>}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => setSelectedAudit(a)} className="text-cyan-400 hover:underline text-[10px]">ouvrir →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Audit modal */}
      {selectedAudit && (
        <DrillAuditModal audit={selectedAudit} onClose={() => setSelectedAudit(null)} onResolve={(kind, note, k) => resolveAudit(selectedAudit.id, kind, note, k)} />
      )}
    </div>
  );
}

function DrillAuditModal({ audit, onClose, onResolve }: { audit: AuditSummary; onClose: () => void; onResolve: (kind: string, note?: string, k?: any) => void }) {
  const [note, setNote] = useState('');
  const [knowledgeSummary, setKnowledgeSummary] = useState(audit.recommendations?.[0]?.knowledge_payload?.summary || '');
  const [knowledgeContent, setKnowledgeContent] = useState(audit.recommendations?.[0]?.knowledge_payload?.content || '');
  const [busy, setBusy] = useState<string | null>(null);

  const callResolve = async (kind: string) => {
    setBusy(kind);
    try {
      const k = kind === 'mutualise_to_knowledge' ? {
        summary: knowledgeSummary,
        content: knowledgeContent,
        business_type: audit.client_business_type || 'global',
        category: 'error_pattern',
      } : undefined;
      await onResolve(kind, note || undefined, k);
      onClose();
    } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-[#0c1a3a] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs ${audit.severity === 'red' ? 'bg-red-500/20 text-red-300' : audit.severity === 'amber' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{audit.severity.toUpperCase()}</span>
            Audit du {new Date(audit.created_at).toLocaleString('fr-FR')}
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2">Findings ({audit.findings?.length || 0})</h4>
            {(!audit.findings || audit.findings.length === 0) ? <p className="text-xs text-emerald-400">Aucun problème détecté 🎉</p> : (
              <ul className="space-y-2">
                {audit.findings.map((f: any, i: number) => (
                  <li key={i} className={`rounded-lg border px-3 py-2 ${f.severity === 'red' ? 'border-red-500/30 bg-red-500/5' : f.severity === 'amber' ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="text-[11px] font-bold text-white">{f.title}</span>
                      <span className="text-[10px] text-white/40 uppercase">{f.code}</span>
                    </div>
                    <p className="text-[11px] text-white/70">{f.detail}</p>
                    {f.suggested_fix && <p className="text-[10px] text-cyan-300 mt-1">💡 {f.suggested_fix}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <summary className="cursor-pointer text-[11px] text-white/60">📊 Snapshot métriques</summary>
            <pre className="text-[10px] text-white/60 mt-2 whitespace-pre-wrap font-mono">{JSON.stringify(audit.metrics, null, 2)}</pre>
          </details>

          {audit.status !== 'open' ? (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
              <p className="text-xs"><strong>Statut :</strong> {audit.status} · <em>{audit.resolution_kind}</em></p>
              {audit.resolution_note && <p className="text-[11px] text-white/70 mt-1">{audit.resolution_note}</p>}
              {audit.resolved_at && <p className="text-[10px] text-white/40 mt-1">Résolu le {new Date(audit.resolved_at).toLocaleString('fr-FR')}</p>}
              {audit.knowledge_id && <p className="text-[10px] text-cyan-300 mt-1">🧠 Mutualisé dans le pool (knowledge_id : {audit.knowledge_id.substring(0, 8)})</p>}
            </div>
          ) : (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/60">Résolution</h4>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optionnel)" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white" rows={2} />
              <details className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2">
                <summary className="cursor-pointer text-xs font-bold text-cyan-300">🧠 Mutualiser dans le pool de connaissance</summary>
                <div className="mt-2 space-y-2">
                  <input value={knowledgeSummary} onChange={e => setKnowledgeSummary(e.target.value)} placeholder="Summary" className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white" />
                  <textarea value={knowledgeContent} onChange={e => setKnowledgeContent(e.target.value)} placeholder="Content détaillé" className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white" rows={4} />
                  <p className="text-[10px] text-white/40">Business type : <strong>{audit.client_business_type || 'global'}</strong></p>
                  <button onClick={() => callResolve('mutualise_to_knowledge')} disabled={!knowledgeSummary || busy === 'mutualise_to_knowledge'} className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold disabled:opacity-50">{busy === 'mutualise_to_knowledge' ? '...' : '🧠 Mutualiser + clôturer'}</button>
                </div>
              </details>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button onClick={() => callResolve('manual_fix')} disabled={!!busy} className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">✅ Fix manuel</button>
                <button onClick={() => callResolve('auto_fix')} disabled={!!busy} className="py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold disabled:opacity-50">⚡ Auto-fix</button>
                <button onClick={() => callResolve('no_action')} disabled={!!busy} className="py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs disabled:opacity-50">🗄 Archiver</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: any; color?: 'red' | 'green' | 'amber' }) {
  const colorClass = color === 'red' ? 'text-red-400' : color === 'green' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${colorClass}`}>{value}</div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}
