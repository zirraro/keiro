'use client';

/**
 * Cockpit de supervision pour UN agent à travers TOUS les clients.
 *
 * Cette vue est DISTINCTE du dashboard client — ici on supervise, on
 * pilote, on audite, on mutualise. 6 onglets :
 *   1. Vue d'ensemble : KPIs supervision + 3 zones critiques
 *   2. Clients : table avec health + bouton Audit + pilote (run/pause)
 *   3. Anomalies : feed live, anomalies ouvertes/résolues
 *   4. Audits : archive complète des audits passés
 *   5. Savoir mutualisé : patterns appris + auto-résolutions
 *   6. Anticipation : prédictions de dégradation avant seuil
 *
 * Bouton Audit par ligne client → POST /api/admin/agents/audit
 *   → persiste dans agent_audits + ouvre la résolution modale.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface ClientRow {
  user_id: string;
  email: string;
  first_name: string;
  plan: string;
  paused: boolean;
  runs_24h: number;
  runs_7d: number;
  errors_24h: number;
  errors_7d: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  actions_breakdown: Record<string, number>;
  kpis: Record<string, any>;
  volume: Record<string, any>;
  health: { score: number; level: 'green' | 'amber' | 'red'; label: string; reasons: string[] };
}

interface Panel {
  ok: boolean;
  agent_id: string;
  networks: string[];
  summary: any;
  clients: ClientRow[];
}

interface Audit {
  id: string;
  agent: string;
  user_id: string;
  severity: 'green' | 'amber' | 'red';
  findings: Array<{ code: string; severity: string; title: string; detail: string; suggested_fix?: string; mutualisable: boolean; evidence?: any }>;
  recommendations: Array<{ kind: string; label: string; detail: string; knowledge_payload?: any }>;
  metrics: Record<string, any>;
  status: 'open' | 'mutualised' | 'resolved' | 'auto_resolved' | 'archived';
  resolution_kind: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  knowledge_id: string | null;
  trigger_kind: string;
  created_at: string;
  client_email?: string | null;
  client_business_type?: string | null;
}

interface AnomalyRow {
  id: string;
  severity: 'P0' | 'P1' | 'P2';
  kind: string;
  title: string;
  detail: string;
  user_id: string | null;
  first_seen: string;
  last_seen: string;
  count_in_window: number;
  resolved_at: string | null;
}

const AGENT_LABELS: Record<string, { name: string; emoji: string; mission: string }> = {
  content:             { name: 'Léna · Contenu', emoji: '🎨', mission: 'Garantir un feed cohérent + cadence story + qualité visuelle.' },
  dm_instagram:        { name: 'Jade · DM', emoji: '💬', mission: 'Réponse en <1h dans la fenêtre 24h, opt-out propre, taux reply ≥30%.' },
  email:               { name: 'Hugo · Email', emoji: '📧', mission: 'Délivrabilité, opens ≥20%, reply ≥3%, anti-spam strict.' },
  commercial:          { name: 'Léo · Prospection', emoji: '💼', mission: 'Enrichment >40%, sources diversifiées, déduplication.' },
  reviews:             { name: 'Théo · Avis Google', emoji: '⭐', mission: 'Réponse <24h sur tous les avis, escalade humain au besoin.' },
  ceo:                 { name: 'Noah · CEO', emoji: '👔', mission: 'Briefs stratégiques quotidiens, recap métriques fiables.' },
  marketing:           { name: 'Marketing CMO', emoji: '🎯', mission: 'Arbitrage cross-canal selon ROI, équilibre formats.' },
  seo:                 { name: 'SEO', emoji: '🔍', mission: 'Calendrier articles + indexation, mots-clés ciblés.' },
  onboarding:          { name: 'Clara · Onboarding', emoji: '👋', mission: 'Activation J+1, J+3, J+7. Engagement ≥60%.' },
  retention:           { name: 'Clara · Rétention', emoji: '🔄', mission: 'Détection churn risk, séquence revival.' },
  instagram_comments:  { name: 'Jade · Comments IG', emoji: '💭', mission: 'Réponses pertinentes sur posts, escalade DM si besoin.' },
  gmaps:               { name: 'Léo · Google Maps', emoji: '📍', mission: 'Scan zones cibles, budget Places contrôlé.' },
  amit:                { name: 'AMI · Stratégie', emoji: '🧠', mission: 'Méta-analyse, propositions optimisation globale.' },
};

export default function AgentSupervisionPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params?.agentId as string;
  const [data, setData] = useState<Panel | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [tab, setTab] = useState<'overview' | 'clients' | 'anomalies' | 'audits' | 'knowledge' | 'anticipation'>('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [auditing, setAuditing] = useState<string | null>(null);
  const [currentAudit, setCurrentAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPanel = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/agents/control/${agentId}`, { credentials: 'include' });
      if (r.status === 403) { setError('Admin only'); return; }
      const j = await r.json();
      if (j.ok) setData(j);
      else setError(j.error || 'Erreur panel');
    } catch (e: any) { setError(e?.message || 'fetch failed'); }
  }, [agentId]);

  const loadAudits = useCallback(async () => {
    const r = await fetch(`/api/admin/agents/audit?agent=${agentId}&limit=200`, { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      setAudits(j.audits || []);
    }
  }, [agentId]);

  const loadAnomalies = useCallback(async () => {
    const r = await fetch(`/api/admin/agents/anomalies?agent=${agentId}&limit=100&include_resolved=true`, { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      setAnomalies(j.anomalies || []);
    }
  }, [agentId]);

  const loadKnowledge = useCallback(async () => {
    const r = await fetch(`/api/admin/agents/knowledge?agent=${agentId}&limit=100`, { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      setKnowledge(j.knowledge || []);
    }
  }, [agentId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadPanel(), loadAudits(), loadAnomalies(), loadKnowledge()]).finally(() => setLoading(false));
  }, [loadPanel, loadAudits, loadAnomalies, loadKnowledge]);

  const pilot = useCallback(async (userIdTarget: string, action: 'trigger' | 'pause' | 'resume') => {
    setBusy(`${action}-${userIdTarget}`);
    try {
      await fetch(`/api/admin/agents/control/${agentId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, user_id: userIdTarget }),
      });
      await loadPanel();
    } finally { setBusy(null); }
  }, [agentId, loadPanel]);

  const runAudit = useCallback(async (userIdTarget: string) => {
    setAuditing(userIdTarget);
    try {
      const r = await fetch('/api/admin/agents/audit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentId, user_id: userIdTarget }),
      });
      const j = await r.json();
      if (j.ok && j.audit) {
        setCurrentAudit(j.audit);
        await loadAudits();
      } else {
        alert(`Audit failed: ${j.error || 'unknown'}`);
      }
    } finally { setAuditing(null); }
  }, [agentId, loadAudits]);

  const resolveAudit = useCallback(async (auditId: string, kind: string, note?: string, knowledge?: any) => {
    const r = await fetch(`/api/admin/agents/audit/${auditId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, note, knowledge }),
    });
    if (r.ok) {
      const j = await r.json();
      setCurrentAudit(j.audit);
      await loadAudits();
      await loadKnowledge();
    }
  }, [loadAudits, loadKnowledge]);

  if (loading) return <div className="min-h-screen bg-[#0c1a3a] text-white p-6 flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400" /></div>;
  if (error) return <div className="min-h-screen bg-[#0c1a3a] text-red-400 p-6">{error}</div>;
  if (!data) return null;

  const meta = AGENT_LABELS[agentId] || { name: agentId, emoji: '🤖', mission: '' };
  const openAudits = audits.filter(a => a.status === 'open');
  const openAnomalies = anomalies.filter(a => !a.resolved_at);

  return (
    <div className="min-h-screen bg-[#0c1a3a] text-white p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* ─── Supervisor header ─── */}
        <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <button onClick={() => router.push('/admin/agents/control')} className="text-xs text-cyan-400 hover:underline mb-2">← Cockpit agents</button>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <span className="text-2xl">{meta.emoji}</span> Supervision — {meta.name}
            </h1>
            <p className="text-[11px] text-white/50 mt-1">{meta.mission}</p>
          </div>
          <button onClick={() => { setLoading(true); Promise.all([loadPanel(), loadAudits(), loadAnomalies(), loadKnowledge()]).finally(() => setLoading(false)); }} className="px-3 py-2 text-xs rounded-lg bg-white/10 hover:bg-white/15">↻ Rafraîchir</button>
        </div>

        {/* ─── Tabs ─── */}
        <div className="flex gap-1 mb-4 border-b border-white/10 overflow-x-auto">
          {([
            ['overview',     '📊 Vue d\'ensemble'],
            ['clients',      `👥 Clients (${data.clients.length})`],
            ['anomalies',    `🚨 Anomalies (${openAnomalies.length})`],
            ['audits',       `📋 Audits (${openAudits.length}/${audits.length})`],
            ['knowledge',    `🧠 Savoir (${knowledge.length})`],
            ['anticipation', '🔮 Anticipation'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition whitespace-nowrap ${tab === key ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-white/50 hover:text-white/80'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ─── TAB: Overview ─── */}
        {tab === 'overview' && (
          <OverviewTab data={data} audits={audits} anomalies={anomalies} knowledge={knowledge} />
        )}

        {/* ─── TAB: Clients ─── */}
        {tab === 'clients' && (
          <ClientsTab
            data={data}
            audits={audits}
            agentId={agentId}
            busy={busy}
            auditing={auditing}
            onPilot={pilot}
            onAudit={runAudit}
            onOpenDrill={(uid: string) => router.push(`/admin/agents/control/${agentId}/${uid}`)}
          />
        )}

        {/* ─── TAB: Anomalies ─── */}
        {tab === 'anomalies' && (
          <AnomaliesTab anomalies={anomalies} />
        )}

        {/* ─── TAB: Audits archive ─── */}
        {tab === 'audits' && (
          <AuditsTab audits={audits} onOpen={(a) => setCurrentAudit(a)} />
        )}

        {/* ─── TAB: Knowledge ─── */}
        {tab === 'knowledge' && (
          <KnowledgeTab knowledge={knowledge} />
        )}

        {/* ─── TAB: Anticipation ─── */}
        {tab === 'anticipation' && (
          <AnticipationTab data={data} audits={audits} />
        )}

        {/* ─── Audit resolution modal ─── */}
        {currentAudit && (
          <AuditModal audit={currentAudit} onClose={() => setCurrentAudit(null)} onResolve={(kind, note, knowledge) => resolveAudit(currentAudit.id, kind, note, knowledge)} />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tabs
// ────────────────────────────────────────────────────────────

function OverviewTab({ data, audits, anomalies, knowledge }: { data: Panel; audits: Audit[]; anomalies: AnomalyRow[]; knowledge: any[] }) {
  const openAudits = audits.filter(a => a.status === 'open');
  const mutAudits = audits.filter(a => a.status === 'mutualised');
  const openAnomalies = anomalies.filter(a => !a.resolved_at);
  const slaBreach = openAnomalies.filter(a => {
    const ageH = (Date.now() - new Date(a.first_seen).getTime()) / 3600000;
    return ageH > 12;
  });

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <Kpi label="🚨 Audits ouverts" value={openAudits.length} color={openAudits.length > 0 ? 'amber' : 'green'} />
        <Kpi label="🚨 Anomalies > 12h" value={slaBreach.length} color={slaBreach.length > 0 ? 'red' : 'green'} />
        <Kpi label="Clients RED" value={data.summary.health_red ?? 0} color={(data.summary.health_red ?? 0) > 0 ? 'red' : 'green'} />
        <Kpi label="Clients AMBER" value={data.summary.health_amber ?? 0} color={(data.summary.health_amber ?? 0) > 0 ? 'amber' : undefined} />
        <Kpi label="🧠 Patterns mutualisés" value={mutAudits.length} color={mutAudits.length > 0 ? 'green' : undefined} />
        <Kpi label="Success rate 24h" value={`${data.summary.success_rate_24h ?? '—'}%`} color={data.summary.success_rate_24h >= 95 ? 'green' : data.summary.success_rate_24h >= 80 ? 'amber' : 'red'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="⏳ SLA breach (anomalies > 12h)">
          {slaBreach.length === 0 ? <p className="text-xs text-emerald-400">Aucune anomalie hors SLA 🎉</p> : (
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {slaBreach.map(a => (
                <li key={a.id} className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
                  <div className="flex justify-between gap-2 text-[10px] mb-0.5"><span className="font-bold text-red-300">{a.severity}</span><span className="text-white/40">{Math.round((Date.now() - new Date(a.first_seen).getTime()) / 3600000)}h</span></div>
                  <p className="text-[11px] text-white/80">{a.title}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="🚨 Top audits ouverts">
          {openAudits.length === 0 ? <p className="text-xs text-emerald-400">Aucun audit ouvert 🎉</p> : (
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {openAudits.slice(0, 8).map(a => (
                <li key={a.id} className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
                  <div className="flex justify-between gap-2 text-[10px] mb-0.5"><span className={`font-bold ${a.severity === 'red' ? 'text-red-300' : a.severity === 'amber' ? 'text-amber-300' : 'text-emerald-300'}`}>{a.severity.toUpperCase()}</span><span className="text-white/40 truncate">{a.client_email || a.user_id?.substring(0, 8)}</span></div>
                  <p className="text-[11px] text-white/80 truncate">{a.findings?.[0]?.title || 'Audit'}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="🧠 Dernier savoir mutualisé">
          {mutAudits.length === 0 ? <p className="text-xs text-white/40">Pas encore de pattern mutualisé. Audit → résoudre via "Mutualiser" pour alimenter le pool.</p> : (
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {mutAudits.slice(0, 6).map(a => (
                <li key={a.id} className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 px-3 py-2">
                  <div className="text-[10px] text-cyan-300 mb-0.5">mutualisé · {new Date(a.resolved_at || a.created_at).toLocaleDateString('fr-FR')}</div>
                  <p className="text-[11px] text-white/80">{a.findings?.[0]?.title || 'pattern'}</p>
                  {a.resolution_note && <p className="text-[10px] text-white/50 mt-1">{a.resolution_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ClientsTab({ data, audits, agentId, busy, auditing, onPilot, onAudit, onOpenDrill }: any) {
  const lastAuditByClient: Record<string, Audit> = {};
  for (const a of audits) {
    if (!a.user_id) continue;
    if (!lastAuditByClient[a.user_id] || new Date(a.created_at) > new Date(lastAuditByClient[a.user_id].created_at)) {
      lastAuditByClient[a.user_id] = a;
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold">Pilotage par client ({data.clients.length})</h2>
        <span className="text-[10px] text-white/40">Triés : RED → AMBER → GREEN puis erreurs 24h ↓</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-white/[0.03] text-[10px] text-white/50 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Health</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-left">Plan</th>
              <th className="px-3 py-2 text-right">Runs 24h</th>
              <th className="px-3 py-2 text-right">Errs 24h</th>
              <th className="px-3 py-2 text-left">Dernière exec</th>
              <th className="px-3 py-2 text-left">Dernier audit</th>
              <th className="px-3 py-2 text-right">Actions superviseur</th>
            </tr>
          </thead>
          <tbody>
            {data.clients.map((c: ClientRow) => {
              const lastAudit = lastAuditByClient[c.user_id];
              const sinceRun = c.last_run_at ? formatRelative(c.last_run_at) : '—';
              return (
                <tr key={c.user_id} className={`border-t border-white/5 hover:bg-white/[0.04] ${c.health.level === 'red' ? 'bg-red-500/5' : c.health.level === 'amber' ? 'bg-amber-500/5' : ''}`}>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${c.health.level === 'red' ? 'bg-red-500/15 border-red-500/40 text-red-300' : c.health.level === 'amber' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'}`} title={c.health.reasons.join(' · ') || 'OK'}>
                      {c.health.level === 'red' ? '🚨' : c.health.level === 'amber' ? '⚠️' : '✅'} {c.health.score}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => onOpenDrill(c.user_id)} className="font-medium text-white truncate max-w-[180px] underline-offset-2 hover:underline text-left">{c.email || c.user_id.substring(0, 8)}</button>
                    {c.paused && <div className="text-[9px] text-amber-300 uppercase">⏸ paused</div>}
                  </td>
                  <td className="px-3 py-2 text-white/60">{c.plan}</td>
                  <td className={`px-3 py-2 text-right font-mono ${c.runs_24h === 0 ? 'text-white/30' : 'text-white'}`}>{c.runs_24h}</td>
                  <td className={`px-3 py-2 text-right font-mono ${c.errors_24h > 0 ? 'text-red-400 font-bold' : 'text-white/40'}`}>{c.errors_24h}</td>
                  <td className="px-3 py-2 text-white/50 text-[11px]">{sinceRun}</td>
                  <td className="px-3 py-2 text-[11px]">
                    {lastAudit ? (
                      <span className={`inline-flex items-center gap-1 ${lastAudit.severity === 'red' ? 'text-red-300' : lastAudit.severity === 'amber' ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {lastAudit.severity === 'red' ? '🚨' : lastAudit.severity === 'amber' ? '⚠️' : '✅'} {formatRelative(lastAudit.created_at)} · {lastAudit.status}
                      </span>
                    ) : <span className="text-white/30">jamais</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-1 justify-end flex-wrap">
                      <button onClick={() => onAudit(c.user_id)} disabled={auditing === c.user_id} className="px-2 py-1 text-[10px] rounded bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50" title="Run a deep supervision audit for this client now">🔍 {auditing === c.user_id ? '...' : 'Audit'}</button>
                      <button onClick={() => onPilot(c.user_id, 'trigger')} disabled={busy === `trigger-${c.user_id}`} className="px-2 py-1 text-[10px] rounded bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50" title="Run this agent now">▶ Run</button>
                      {c.paused ? (
                        <button onClick={() => onPilot(c.user_id, 'resume')} disabled={busy === `resume-${c.user_id}`} className="px-2 py-1 text-[10px] rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">Resume</button>
                      ) : (
                        <button onClick={() => onPilot(c.user_id, 'pause')} disabled={busy === `pause-${c.user_id}`} className="px-2 py-1 text-[10px] rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">Pause</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.clients.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-white/40">Aucun client actif</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnomaliesTab({ anomalies }: { anomalies: AnomalyRow[] }) {
  const open = anomalies.filter(a => !a.resolved_at);
  const resolved = anomalies.filter(a => a.resolved_at);
  return (
    <div className="space-y-4">
      <Card title={`🚨 Anomalies ouvertes (${open.length})`}>
        {open.length === 0 ? <p className="text-xs text-emerald-400">Aucune anomalie ouverte 🎉</p> : (
          <ul className="space-y-2">
            {open.map(a => {
              const ageH = (Date.now() - new Date(a.first_seen).getTime()) / 3600000;
              const slaBreach = ageH > 12;
              return (
                <li key={a.id} className={`rounded-lg border px-3 py-2 ${slaBreach ? 'border-red-500/40 bg-red-500/10' : a.severity === 'P0' ? 'border-red-500/30 bg-red-500/5' : a.severity === 'P1' ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex justify-between gap-2 mb-1 text-[10px]">
                    <span className="font-bold">{a.severity} · {a.kind}</span>
                    <span className={slaBreach ? 'text-red-300 font-bold' : 'text-white/40'}>{slaBreach && '⏰ SLA breach · '}{Math.round(ageH)}h</span>
                  </div>
                  <p className="text-xs text-white/90">{a.title}</p>
                  <p className="text-[10px] text-white/50 mt-1">{a.detail}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={`✅ Anomalies résolues récemment (${resolved.length})`}>
        {resolved.length === 0 ? <p className="text-xs text-white/40">—</p> : (
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {resolved.slice(0, 30).map(a => (
              <li key={a.id} className="text-[11px] text-white/60 flex justify-between gap-2 px-2 py-1 border-b border-white/5">
                <span className="truncate">{a.title}</span>
                <span className="text-white/40 whitespace-nowrap">{formatRelative(a.resolved_at!)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AuditsTab({ audits, onOpen }: { audits: Audit[]; onOpen: (a: Audit) => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-bold">Archive des audits ({audits.length})</h2>
        <p className="text-[10px] text-white/40">Tout ce que le superviseur (ou l'auto-audit cron) a inspecté. Cliquer pour revoir.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-white/[0.03] text-[10px] text-white/50 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Quand</th>
              <th className="px-3 py-2 text-left">Sévérité</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-left">Findings</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Trigger</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {audits.map(a => (
              <tr key={a.id} className="border-t border-white/5 hover:bg-white/[0.04]">
                <td className="px-3 py-2 text-white/60">{new Date(a.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${a.severity === 'red' ? 'bg-red-500/15 text-red-300' : a.severity === 'amber' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{a.severity}</span></td>
                <td className="px-3 py-2 text-white/70 truncate max-w-[160px]">{a.client_email || (a.user_id || '').substring(0, 8)}</td>
                <td className="px-3 py-2 text-white/70">{a.findings?.length || 0} item(s)</td>
                <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                <td className="px-3 py-2 text-[10px] text-white/40">{a.trigger_kind}</td>
                <td className="px-3 py-2 text-right"><button onClick={() => onOpen(a)} className="text-cyan-400 hover:underline text-[10px]">ouvrir →</button></td>
              </tr>
            ))}
            {audits.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-white/40">Aucun audit. Lance un audit depuis l'onglet Clients.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KnowledgeTab({ knowledge }: { knowledge: any[] }) {
  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-cyan-500/20">
        <h2 className="text-sm font-bold">Savoir mutualisé ({knowledge.length})</h2>
        <p className="text-[10px] text-white/50">Patterns + résolutions partagés à tous les clients du même type business. Alimenté par les audits "mutualisés".</p>
      </div>
      <div className="divide-y divide-cyan-500/10 max-h-[70vh] overflow-y-auto">
        {knowledge.map(k => (
          <div key={k.id} className="px-4 py-3">
            <div className="flex justify-between items-start gap-2 mb-1 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider">{k.category} · {k.business_type || 'global'}</span>
              <span className="text-[10px] text-white/40">conf {Math.round((k.confidence ?? 0) * 100)}% · {k.source} · {new Date(k.created_at).toLocaleDateString('fr-FR')}</span>
            </div>
            <p className="text-xs font-semibold text-white">{k.summary}</p>
            {k.content && <p className="text-[11px] text-white/60 mt-1 whitespace-pre-wrap">{k.content}</p>}
            {k.usage_count > 0 && <p className="text-[10px] text-emerald-300 mt-1">↻ Appliqué {k.usage_count} fois</p>}
          </div>
        ))}
        {knowledge.length === 0 && <div className="px-4 py-8 text-center text-white/40 text-xs">Aucun savoir mutualisé pour cet agent. Audits → résoudre via "Mutualiser" pour démarrer.</div>}
      </div>
    </div>
  );
}

function AnticipationTab({ data, audits }: { data: Panel; audits: Audit[] }) {
  // Prédire les clients à risque : taux d'erreur en hausse, success en baisse mais pas encore < seuil
  const atRisk = data.clients
    .filter(c => c.runs_7d >= 5 && c.health.level === 'amber')
    .sort((a, b) => b.errors_7d - a.errors_7d);

  // Clients qui n'ont jamais été audités
  const auditedUserIds = new Set(audits.map(a => a.user_id));
  const neverAudited = data.clients.filter(c => !auditedUserIds.has(c.user_id) && c.runs_7d >= 3);

  return (
    <div className="space-y-4">
      <Card title={`⚠️ Clients en zone AMBER (${atRisk.length}) — avant que ça bascule RED`}>
        {atRisk.length === 0 ? <p className="text-xs text-emerald-400">Aucun client en zone AMBER.</p> : (
          <ul className="space-y-2">
            {atRisk.map(c => (
              <li key={c.user_id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{c.email}</p>
                  <p className="text-[10px] text-white/50">{c.runs_7d} runs · {c.errors_7d} erreurs · health {c.health.score}</p>
                </div>
                <p className="text-[10px] text-amber-300 text-right max-w-[200px]">{c.health.reasons.slice(0, 2).join(' · ')}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`📋 Clients jamais audités (${neverAudited.length}) — angles morts`}>
        {neverAudited.length === 0 ? <p className="text-xs text-emerald-400">Tous les clients actifs ont été audités au moins une fois.</p> : (
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {neverAudited.map(c => (
              <li key={c.user_id} className="text-[11px] flex justify-between gap-2 px-2 py-1 border-b border-white/5">
                <span className="truncate text-white/80">{c.email}</span>
                <span className="text-white/40">{c.runs_7d} runs</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Audit resolution modal
// ────────────────────────────────────────────────────────────

function AuditModal({ audit, onClose, onResolve }: { audit: Audit; onClose: () => void; onResolve: (kind: string, note?: string, knowledge?: any) => void }) {
  const [note, setNote] = useState('');
  const [knowledgeSummary, setKnowledgeSummary] = useState(audit.recommendations?.[0]?.knowledge_payload?.summary || '');
  const [knowledgeContent, setKnowledgeContent] = useState(audit.recommendations?.[0]?.knowledge_payload?.content || '');
  const [busy, setBusy] = useState<string | null>(null);

  const callResolve = async (kind: string) => {
    setBusy(kind);
    try {
      const knowledge = kind === 'mutualise_to_knowledge' ? {
        summary: knowledgeSummary,
        content: knowledgeContent,
        business_type: audit.client_business_type || 'global',
        category: 'error_pattern',
      } : undefined;
      await onResolve(kind, note || undefined, knowledge);
      onClose();
    } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-[#0c1a3a] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs ${audit.severity === 'red' ? 'bg-red-500/20 text-red-300' : audit.severity === 'amber' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{audit.severity.toUpperCase()}</span>
              Audit · {audit.client_email}
            </h3>
            <p className="text-[10px] text-white/40 mt-0.5">{new Date(audit.created_at).toLocaleString('fr-FR')} · trigger {audit.trigger_kind}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Findings */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2">Findings ({audit.findings?.length || 0})</h4>
            {(!audit.findings || audit.findings.length === 0) ? <p className="text-xs text-emerald-400">Aucun problème détecté 🎉</p> : (
              <ul className="space-y-2">
                {audit.findings.map((f, i) => (
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

          {/* Metrics snapshot */}
          <details className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <summary className="cursor-pointer text-[11px] text-white/60">📊 Snapshot métriques au moment de l'audit</summary>
            <pre className="text-[10px] text-white/60 mt-2 whitespace-pre-wrap font-mono">{JSON.stringify(audit.metrics, null, 2)}</pre>
          </details>

          {/* Already resolved? */}
          {audit.status !== 'open' && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
              <p className="text-xs"><strong>Statut :</strong> <StatusBadge status={audit.status} /></p>
              {audit.resolution_note && <p className="text-[11px] text-white/70 mt-1">{audit.resolution_note}</p>}
              {audit.resolved_at && <p className="text-[10px] text-white/40 mt-1">Résolu le {new Date(audit.resolved_at).toLocaleString('fr-FR')}</p>}
            </div>
          )}

          {/* Resolution form */}
          {audit.status === 'open' && (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/60">Résolution</h4>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40">Note (optionnel)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ce qui a été fait, ou pourquoi on n'agit pas..." className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white" rows={2} />
              </div>

              <details className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2">
                <summary className="cursor-pointer text-xs font-bold text-cyan-300">🧠 Mutualiser dans le pool de connaissance</summary>
                <div className="mt-2 space-y-2">
                  <input value={knowledgeSummary} onChange={e => setKnowledgeSummary(e.target.value)} placeholder="Summary (1 ligne)" className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white" />
                  <textarea value={knowledgeContent} onChange={e => setKnowledgeContent(e.target.value)} placeholder="Content (résolution détaillée)" className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white" rows={4} />
                  <p className="text-[10px] text-white/40">Business type : <strong>{audit.client_business_type || 'global'}</strong></p>
                  <button onClick={() => callResolve('mutualise_to_knowledge')} disabled={!knowledgeSummary || busy === 'mutualise_to_knowledge'} className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold disabled:opacity-50">{busy === 'mutualise_to_knowledge' ? '...' : '🧠 Mutualiser + clôturer'}</button>
                </div>
              </details>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button onClick={() => callResolve('manual_fix')} disabled={!!busy} className="py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">✅ Fix manuel</button>
                <button onClick={() => callResolve('auto_fix')} disabled={!!busy} className="py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold disabled:opacity-50">⚡ Auto-fix (re-trigger)</button>
                <button onClick={() => callResolve('no_action')} disabled={!!busy} className="py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs disabled:opacity-50">🗄 Archiver (sans action)</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tiny UI helpers
// ────────────────────────────────────────────────────────────

function Kpi({ label, value, color }: { label: string; value: any; color?: 'red' | 'green' | 'amber' }) {
  const cc = color === 'red' ? 'text-red-400' : color === 'green' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${cc}`}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-sm font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open:           { label: 'ouvert',          cls: 'bg-amber-500/15 text-amber-300' },
    mutualised:     { label: 'mutualisé',       cls: 'bg-cyan-500/15 text-cyan-300' },
    resolved:       { label: 'résolu (manuel)', cls: 'bg-emerald-500/15 text-emerald-300' },
    auto_resolved:  { label: 'auto-résolu',     cls: 'bg-emerald-500/15 text-emerald-300' },
    archived:       { label: 'archivé',         cls: 'bg-white/10 text-white/50' },
  };
  const m = map[status] || { label: status, cls: 'bg-white/10 text-white/60' };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}j`;
}
