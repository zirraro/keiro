'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────

interface Prospect {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  type: string;
  status: string;
  temperature: string;
  score: number;
  priorite: string;
  source: string;
  instagram: string;
  tiktok: string;
  website: string;
  notes: string;
  tags: string[];
  quartier: string;
  note_google: number;
  avis_google: number;
  abonnes: number;
  email_sequence_step: number;
  email_opens_count: number;
  email_clicks_count: number;
  last_email_sent_at: string;
  last_email_opened_at: string;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  prospect_id: string;
  type: string;
  description: string;
  resultat: string;
  date_activite: string;
  data: any;
  created_at: string;
}

type CrmView = 'dashboard' | 'pipeline' | 'list' | 'prospect';

// ─── Constants ──────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'identifie', label: 'Identifie', color: '#64748b', emoji: '🔍' },
  { key: 'contacte', label: 'Contacte', color: '#3b82f6', emoji: '📤' },
  { key: 'relance_1', label: 'Relance 1', color: '#f59e0b', emoji: '🔄' },
  { key: 'relance_2', label: 'Relance 2', color: '#f97316', emoji: '🔄' },
  { key: 'relance_3', label: 'Relance 3', color: '#ef4444', emoji: '🔄' },
  { key: 'repondu', label: 'Repondu', color: '#10b981', emoji: '✅' },
  { key: 'demo', label: 'Demo', color: '#8b5cf6', emoji: '🎯' },
  { key: 'sprint', label: 'Essai', color: '#a855f7', emoji: '🚀' },
  { key: 'client', label: 'Client', color: '#22c55e', emoji: '💎' },
  { key: 'perdu', label: 'Perdu', color: '#ef4444', emoji: '❌' },
];

const TEMP_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  hot:  { emoji: '🔥', label: 'Hot',  color: '#ef4444', bg: 'bg-red-500/10' },
  warm: { emoji: '🌡️', label: 'Warm', color: '#f59e0b', bg: 'bg-amber-500/10' },
  cold: { emoji: '❄️', label: 'Cold', color: '#3b82f6', bg: 'bg-blue-500/10' },
  dead: { emoji: '💀', label: 'Dead', color: '#6b7280', bg: 'bg-gray-500/10' },
};

const ACTIVITY_TYPES = [
  { key: 'appel', label: 'Appel', icon: '📞' },
  { key: 'email', label: 'Email', icon: '📧' },
  { key: 'dm_instagram', label: 'DM Instagram', icon: '📸' },
  { key: 'rdv', label: 'RDV', icon: '📅' },
  { key: 'relance', label: 'Relance', icon: '🔄' },
  { key: 'note', label: 'Note', icon: '📝' },
  { key: 'visite', label: 'Visite', icon: '🏪' },
  { key: 'message', label: 'Message', icon: '💬' },
];

const RESULT_OPTIONS = [
  { key: '', label: '-- Resultat --' },
  { key: 'interesse', label: 'Interesse' },
  { key: 'demande_infos', label: 'Demande infos' },
  { key: 'rdv_pris', label: 'RDV pris' },
  { key: 'pas_de_reponse', label: 'Pas de reponse' },
  { key: 'rappeler', label: 'A rappeler' },
  { key: 'pas_interesse', label: 'Pas interesse' },
  { key: 'mauvais_moment', label: 'Mauvais moment' },
];

const SOURCES = ['dm_instagram', 'email', 'telephone', 'linkedin', 'terrain', 'facebook', 'tiktok', 'recommandation', 'import', 'other'];
const SOURCE_LABELS: Record<string, string> = { dm_instagram: 'DM Instagram', email: 'Email', telephone: 'Telephone', linkedin: 'LinkedIn', terrain: 'Terrain', facebook: 'Facebook', tiktok: 'TikTok', recommandation: 'Recommandation', import: 'Import', other: 'Autre' };

// ─── Helpers ────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}j`;
  return `${Math.floor(days / 30)}m`;
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: undefined });
}

function prospectName(p: Prospect): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  return name || p.company || p.email || 'Sans nom';
}

function prospectInitials(p: Prospect): string {
  const f = p.first_name?.[0] || p.company?.[0] || '?';
  const l = p.last_name?.[0] || '';
  return (f + l).toUpperCase();
}

// ─── Sub-components ─────────────────────────────────────

/* ── KPI Card ── */
function KpiCard({ label, value, sub, icon, color, onClick }: {
  label: string; value: number | string; sub?: string; icon: string; color: string; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className={`flex-1 min-w-[120px] rounded-xl p-3 sm:p-4 text-left transition-all hover:scale-[1.02] hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ background: `${color}12`, borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-neutral-500 font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div>}
    </button>
  );
}

/* ── Pipeline Funnel ── */
function PipelineFunnel({ prospects, onStageClick, activeStage }: {
  prospects: Prospect[]; onStageClick: (stage: string | null) => void; activeStage: string | null;
}) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    PIPELINE_STAGES.forEach(s => c[s.key] = 0);
    prospects.forEach(p => { if (c[p.status] !== undefined) c[p.status]++; });
    return c;
  }, [prospects]);

  const total = prospects.length || 1;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-neutral-700 dark:text-neutral-200">Pipeline</h3>
        {activeStage && (
          <button onClick={() => onStageClick(null)} className="text-xs text-blue-500 hover:underline">Voir tout</button>
        )}
      </div>
      {/* Desktop: horizontal funnel */}
      <div className="hidden sm:flex gap-1 items-end h-20">
        {PIPELINE_STAGES.filter(s => s.key !== 'perdu').map(stage => {
          const count = counts[stage.key] || 0;
          const pct = Math.max((count / total) * 100, 4);
          const isActive = activeStage === stage.key;
          return (
            <button key={stage.key} onClick={() => onStageClick(isActive ? null : stage.key)}
              className={`flex flex-col items-center flex-1 transition-all rounded-lg hover:opacity-80 ${isActive ? 'ring-2 ring-offset-1' : ''}`}
              style={{ ['--tw-ring-color' as any]: stage.color }}>
              <div className="w-full rounded-t-lg transition-all" style={{ height: `${pct}%`, minHeight: 8, background: stage.color, opacity: isActive ? 1 : 0.7 }} />
              <div className="text-[10px] font-bold mt-1" style={{ color: stage.color }}>{count}</div>
              <div className="text-[9px] text-neutral-400 truncate max-w-full">{stage.label}</div>
            </button>
          );
        })}
      </div>
      {/* Mobile: stacked bars */}
      <div className="sm:hidden space-y-1.5">
        {PIPELINE_STAGES.filter(s => s.key !== 'perdu').map(stage => {
          const count = counts[stage.key] || 0;
          const pct = Math.max((count / total) * 100, 2);
          const isActive = activeStage === stage.key;
          return (
            <button key={stage.key} onClick={() => onStageClick(isActive ? null : stage.key)}
              className={`w-full flex items-center gap-2 text-left rounded-lg p-1.5 transition ${isActive ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}>
              <span className="text-xs w-16 truncate" style={{ color: stage.color }}>{stage.emoji} {stage.label}</span>
              <div className="flex-1 h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: stage.color }} />
              </div>
              <span className="text-xs font-bold w-6 text-right" style={{ color: stage.color }}>{count}</span>
            </button>
          );
        })}
      </div>
      {/* Perdu count */}
      {counts.perdu > 0 && (
        <button onClick={() => onStageClick(activeStage === 'perdu' ? null : 'perdu')}
          className="mt-2 text-xs text-neutral-400 hover:text-red-400 transition">
          ❌ {counts.perdu} perdu(s)
        </button>
      )}
    </div>
  );
}

/* ── Prospect Row ── */
function ProspectRow({ prospect, activities, onSelect, isSelected }: {
  prospect: Prospect; activities: Activity[]; onSelect: () => void; isSelected: boolean;
}) {
  const temp = TEMP_CONFIG[prospect.temperature] || TEMP_CONFIG.cold;
  const stage = PIPELINE_STAGES.find(s => s.key === prospect.status);
  const lastActivity = activities
    .filter(a => a.prospect_id === prospect.id)
    .sort((a, b) => new Date(b.date_activite || b.created_at).getTime() - new Date(a.date_activite || a.created_at).getTime())[0];

  return (
    <button onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl border transition-all hover:shadow-md ${isSelected
        ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/20 shadow-sm'
        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300'}`}>
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: stage?.color || '#64748b' }}>
          {prospectInitials(prospect)}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-neutral-800 dark:text-white truncate">{prospectName(prospect)}</span>
            <span className="text-xs">{temp.emoji}</span>
            {prospect.priorite && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                prospect.priorite === 'A' ? 'bg-green-100 text-green-700' :
                prospect.priorite === 'B' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
              }`}>{prospect.priorite}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
            {prospect.company && <span>{prospect.company}</span>}
            {prospect.type && <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-neutral-500">{prospect.type}</span>}
          </div>
        </div>
        {/* Right side */}
        <div className="text-right shrink-0">
          <div className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${stage?.color}20`, color: stage?.color }}>
            {stage?.label || prospect.status}
          </div>
          {lastActivity && (
            <div className="text-[10px] text-neutral-400 mt-1">{timeAgo(lastActivity.date_activite || lastActivity.created_at)}</div>
          )}
        </div>
      </div>
      {/* Quick stats row */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-neutral-400">
        {prospect.email_opens_count > 0 && <span>📧 {prospect.email_opens_count} ouvert{prospect.email_opens_count > 1 ? 's' : ''}</span>}
        {prospect.email_clicks_count > 0 && <span>🔗 {prospect.email_clicks_count} clic{prospect.email_clicks_count > 1 ? 's' : ''}</span>}
        {prospect.instagram && <span>📸 @{prospect.instagram}</span>}
        {prospect.score > 0 && <span>⭐ {prospect.score}/20</span>}
        {prospect.note_google > 0 && <span>⭐ Google {prospect.note_google}</span>}
      </div>
    </button>
  );
}

/* ── Prospect Detail Panel ── */
function ProspectDetail({ prospect, activities, onClose, onUpdate }: {
  prospect: Prospect; activities: Activity[]; onClose: () => void; onUpdate: () => void;
}) {
  const [tab, setTab] = useState<'timeline' | 'info' | 'emails' | 'social' | 'agents'>('timeline');
  const [addingActivity, setAddingActivity] = useState(false);
  const [actForm, setActForm] = useState({ type: 'note', description: '', resultat: '' });
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({ status: prospect.status, temperature: prospect.temperature, notes: prospect.notes || '', priorite: prospect.priorite || '' });

  const prospectActivities = activities
    .filter(a => a.prospect_id === prospect.id)
    .sort((a, b) => new Date(b.date_activite || b.created_at).getTime() - new Date(a.date_activite || a.created_at).getTime());

  const temp = TEMP_CONFIG[prospect.temperature] || TEMP_CONFIG.cold;
  const stage = PIPELINE_STAGES.find(s => s.key === prospect.status);

  const saveActivity = async () => {
    if (!actForm.description.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/crm', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_activity', prospect_id: prospect.id, ...actForm }),
      });
      setAddingActivity(false);
      setActForm({ type: 'note', description: '', resultat: '' });
      onUpdate();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await fetch('/api/crm', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prospect.id, ...editData }),
      });
      setEditMode(false);
      onUpdate();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const tabs = [
    { key: 'timeline', label: 'Timeline', icon: '📋' },
    { key: 'info', label: 'Infos', icon: '👤' },
    { key: 'emails', label: 'Emails', icon: '📧' },
    { key: 'social', label: 'Social', icon: '📱' },
    { key: 'agents', label: 'Agents', icon: '🤖' },
  ];

  return (
    <div className="fixed inset-x-0 top-0 bottom-0 z-[60] flex" style={{ paddingTop: '56px' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative ml-auto w-full max-w-lg bg-white dark:bg-neutral-900 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
          <div className="p-4 pb-2">
            <div className="flex items-center justify-between mb-2">
              <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg">← Retour</button>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <button onClick={() => setEditMode(true)} className="text-xs text-blue-500 hover:underline">Modifier</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={saving} className="text-xs bg-blue-500 text-white px-3 py-1 rounded-lg">{saving ? '...' : 'Sauver'}</button>
                    <button onClick={() => setEditMode(false)} className="text-xs text-neutral-400">Annuler</button>
                  </div>
                )}
              </div>
            </div>
            {/* Prospect header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold text-white shrink-0"
                style={{ background: stage?.color || '#64748b' }}>
                {prospectInitials(prospect)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-neutral-800 dark:text-white truncate">{prospectName(prospect)}</h2>
                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                  {editMode ? (
                    <>
                      <select value={editData.status} onChange={e => setEditData({ ...editData, status: e.target.value })}
                        className="text-[10px] border rounded px-1.5 py-0.5">
                        {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      <select value={editData.temperature} onChange={e => setEditData({ ...editData, temperature: e.target.value })}
                        className="text-[10px] border rounded px-1.5 py-0.5">
                        {Object.entries(TEMP_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                      </select>
                      <select value={editData.priorite} onChange={e => setEditData({ ...editData, priorite: e.target.value })}
                        className="text-[10px] border rounded px-1.5 py-0.5">
                        <option value="">-</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${stage?.color}20`, color: stage?.color }}>
                        {stage?.emoji} {stage?.label}
                      </span>
                      <span className="text-[11px]">{temp.emoji} {temp.label}</span>
                      {prospect.priorite && <span className="text-[11px] font-bold">P{prospect.priorite}</span>}
                      {prospect.score > 0 && <span className="text-[11px]">⭐ {prospect.score}/20</span>}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Conversion Progress Bar ── */}
          <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/50">
            <div className="flex items-center gap-1">
              {PIPELINE_STAGES.filter(s => s.key !== 'perdu').map((s, i) => {
                const currentIdx = PIPELINE_STAGES.findIndex(ps => ps.key === prospect.status);
                const thisIdx = PIPELINE_STAGES.findIndex(ps => ps.key === s.key);
                const isCompleted = thisIdx <= currentIdx && prospect.status !== 'perdu';
                const isCurrent = s.key === prospect.status;
                return (
                  <div key={s.key} className="flex items-center flex-1">
                    <div className={`h-1.5 flex-1 rounded-full transition-all ${isCompleted ? '' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                      style={isCompleted ? { background: s.color } : undefined}
                    />
                    {isCurrent && (
                      <div className="w-3 h-3 rounded-full border-2 shrink-0 -mx-0.5" style={{ borderColor: s.color, background: s.color }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] text-neutral-400">{stage?.emoji} {stage?.label}</span>
              <span className="text-[9px] text-neutral-400">
                {prospect.source && `Source: ${SOURCE_LABELS[prospect.source] || prospect.source}`}
                {prospect.created_at && ` · ${formatDate(prospect.created_at)}`}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-t border-neutral-100 dark:border-neutral-800">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`flex-1 py-2 text-xs font-medium transition ${tab === t.key
                  ? 'text-blue-600 border-b-2 border-blue-600' : 'text-neutral-400 hover:text-neutral-600'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {/* ── TIMELINE TAB ── */}
          {tab === 'timeline' && (
            <div>
              {/* Add activity button */}
              {!addingActivity ? (
                <button onClick={() => setAddingActivity(true)}
                  className="w-full py-2.5 rounded-xl border-2 border-dashed border-neutral-200 text-sm text-neutral-400 hover:border-blue-300 hover:text-blue-500 transition mb-4">
                  + Ajouter une activite
                </button>
              ) : (
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-3 mb-4 space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    {ACTIVITY_TYPES.map(at => (
                      <button key={at.key} onClick={() => setActForm({ ...actForm, type: at.key })}
                        className={`text-xs px-2 py-1 rounded-lg transition ${actForm.type === at.key ? 'bg-blue-500 text-white' : 'bg-white dark:bg-neutral-700 text-neutral-600'}`}>
                        {at.icon} {at.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={actForm.description} onChange={e => setActForm({ ...actForm, description: e.target.value })}
                    placeholder="Description..." rows={2} className="w-full text-sm border rounded-lg p-2 resize-none" />
                  <div className="flex gap-2">
                    <select value={actForm.resultat} onChange={e => setActForm({ ...actForm, resultat: e.target.value })}
                      className="text-xs border rounded-lg px-2 py-1.5 flex-1">
                      {RESULT_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                    <button onClick={saveActivity} disabled={saving} className="bg-blue-500 text-white text-xs px-4 py-1.5 rounded-lg hover:bg-blue-600">
                      {saving ? '...' : 'Ajouter'}
                    </button>
                    <button onClick={() => setAddingActivity(false)} className="text-xs text-neutral-400">✕</button>
                  </div>
                </div>
              )}

              {/* Timeline */}
              {prospectActivities.length === 0 ? (
                <p className="text-center text-sm text-neutral-400 py-8">Aucune activite pour le moment</p>
              ) : (
                <div className="space-y-1">
                  {prospectActivities.map(act => {
                    const actType = ACTIVITY_TYPES.find(t => t.key === act.type);
                    return (
                      <div key={act.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition">
                        <div className="text-base mt-0.5">{actType?.icon || '📋'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{actType?.label || act.type}</span>
                            {act.resultat && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                act.resultat === 'interesse' || act.resultat === 'rdv_pris' ? 'bg-green-100 text-green-700' :
                                act.resultat === 'pas_interesse' ? 'bg-red-100 text-red-600' : 'bg-neutral-100 text-neutral-500'
                              }`}>{act.resultat.replace(/_/g, ' ')}</span>
                            )}
                          </div>
                          {act.description && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{act.description}</p>}
                        </div>
                        <span className="text-[10px] text-neutral-400 shrink-0">{timeAgo(act.date_activite || act.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── INFO TAB ── */}
          {tab === 'info' && (
            <div className="space-y-4">
              {/* Contact */}
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-4">
                <h4 className="text-xs font-bold text-neutral-400 uppercase mb-3">Contact</h4>
                <div className="space-y-2 text-sm">
                  {prospect.email && <div className="flex items-center gap-2"><span className="text-neutral-400 w-5">📧</span><span className="text-neutral-700 dark:text-neutral-200">{prospect.email}</span></div>}
                  {prospect.phone && <div className="flex items-center gap-2"><span className="text-neutral-400 w-5">📞</span><span>{prospect.phone}</span></div>}
                  {prospect.company && <div className="flex items-center gap-2"><span className="text-neutral-400 w-5">🏢</span><span>{prospect.company}</span></div>}
                  {prospect.quartier && <div className="flex items-center gap-2"><span className="text-neutral-400 w-5">📍</span><span>{prospect.quartier}</span></div>}
                  {prospect.website && <div className="flex items-center gap-2"><span className="text-neutral-400 w-5">🌐</span><a href={prospect.website} target="_blank" rel="noopener" className="text-blue-500 hover:underline truncate">{prospect.website}</a></div>}
                </div>
              </div>
              {/* Business */}
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-4">
                <h4 className="text-xs font-bold text-neutral-400 uppercase mb-3">Business</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {prospect.type && <div><span className="text-neutral-400 text-xs block">Type</span><span className="font-medium">{prospect.type}</span></div>}
                  {prospect.source && <div><span className="text-neutral-400 text-xs block">Source</span><span className="font-medium">{SOURCE_LABELS[prospect.source] || prospect.source}</span></div>}
                  {prospect.note_google > 0 && <div><span className="text-neutral-400 text-xs block">Google</span><span className="font-medium">⭐ {prospect.note_google} ({prospect.avis_google} avis)</span></div>}
                  {prospect.abonnes > 0 && <div><span className="text-neutral-400 text-xs block">Abonnes IG</span><span className="font-medium">{prospect.abonnes.toLocaleString()}</span></div>}
                </div>
              </div>
              {/* Notes */}
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-4">
                <h4 className="text-xs font-bold text-neutral-400 uppercase mb-3">Notes</h4>
                {editMode ? (
                  <textarea value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })}
                    rows={4} className="w-full text-sm border rounded-lg p-2 resize-none" />
                ) : (
                  <p className="text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">{prospect.notes || 'Aucune note'}</p>
                )}
              </div>
              {/* Tags */}
              {prospect.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {prospect.tags.map(tag => (
                    <span key={tag} className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{tag}</span>
                  ))}
                </div>
              )}
              {/* Meta */}
              <div className="text-[10px] text-neutral-400 space-y-0.5">
                <div>Cree le {formatDate(prospect.created_at)}</div>
                {prospect.updated_at && <div>Mis a jour {timeAgo(prospect.updated_at)}</div>}
              </div>
            </div>
          )}

          {/* ── EMAILS TAB ── */}
          {tab === 'emails' && (
            <div className="space-y-4">
              {/* Email stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-blue-500">{prospect.email_sequence_step || 0}</div>
                  <div className="text-[10px] text-neutral-400">Etape sequence</div>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-green-500">{prospect.email_opens_count || 0}</div>
                  <div className="text-[10px] text-neutral-400">Ouvertures</div>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-purple-500">{prospect.email_clicks_count || 0}</div>
                  <div className="text-[10px] text-neutral-400">Clics</div>
                </div>
              </div>
              {/* Email activities */}
              <h4 className="text-xs font-bold text-neutral-400 uppercase">Historique emails</h4>
              {prospectActivities.filter(a => a.type === 'email' || a.type === 'email_opened').length === 0 ? (
                <p className="text-center text-sm text-neutral-400 py-4">Aucun email envoye</p>
              ) : (
                <div className="space-y-1">
                  {prospectActivities.filter(a => a.type === 'email' || a.type === 'email_opened' || a.type === 'email_replied').map(act => (
                    <div key={act.id} className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{act.type === 'email' ? '📤 Envoye' : act.type === 'email_opened' ? '📬 Ouvert' : '💬 Repondu'}</span>
                        <span className="text-[10px] text-neutral-400">{formatDate(act.date_activite || act.created_at)}</span>
                      </div>
                      {act.description && <p className="text-xs text-neutral-500 mt-1">{act.description}</p>}
                      {act.data?.subject && <p className="text-xs text-blue-500 mt-0.5">Sujet: {act.data.subject}</p>}
                    </div>
                  ))}
                </div>
              )}
              {/* Last email dates */}
              <div className="text-[10px] text-neutral-400 space-y-0.5">
                {prospect.last_email_sent_at && <div>Dernier email envoye: {formatDate(prospect.last_email_sent_at)}</div>}
                {prospect.last_email_opened_at && <div>Derniere ouverture: {formatDate(prospect.last_email_opened_at)}</div>}
              </div>
            </div>
          )}

          {/* ── SOCIAL TAB ── */}
          {tab === 'social' && (
            <div className="space-y-4">
              {/* Instagram */}
              {prospect.instagram && (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">📸</span>
                    <span className="font-bold text-sm">Instagram</span>
                  </div>
                  <a href={`https://instagram.com/${prospect.instagram}`} target="_blank" rel="noopener"
                    className="text-sm text-purple-600 hover:underline">@{prospect.instagram}</a>
                  {prospect.abonnes > 0 && <p className="text-xs text-neutral-500 mt-1">{prospect.abonnes.toLocaleString()} abonnes</p>}
                  {/* DM activities */}
                  {prospectActivities.filter(a => a.type === 'dm_instagram').length > 0 && (
                    <div className="mt-3 space-y-1">
                      <h5 className="text-[10px] font-bold text-neutral-400 uppercase">DMs envoyes</h5>
                      {prospectActivities.filter(a => a.type === 'dm_instagram').map(act => (
                        <div key={act.id} className="text-xs bg-white/50 dark:bg-neutral-800/50 rounded-lg p-2">
                          <p className="text-neutral-600">{act.description}</p>
                          <span className="text-[10px] text-neutral-400">{timeAgo(act.date_activite || act.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* TikTok */}
              {prospect.tiktok && (
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🎵</span>
                    <span className="font-bold text-sm">TikTok</span>
                  </div>
                  <a href={`https://tiktok.com/@${prospect.tiktok}`} target="_blank" rel="noopener"
                    className="text-sm text-neutral-600 hover:underline">@{prospect.tiktok}</a>
                </div>
              )}
              {/* Website */}
              {prospect.website && (
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🌐</span>
                    <span className="font-bold text-sm">Site web</span>
                  </div>
                  <a href={prospect.website} target="_blank" rel="noopener"
                    className="text-sm text-blue-500 hover:underline truncate block">{prospect.website}</a>
                </div>
              )}
              {!prospect.instagram && !prospect.tiktok && !prospect.website && (
                <p className="text-center text-sm text-neutral-400 py-8">Aucun reseau social renseigne</p>
              )}
            </div>
          )}

          {/* ── AGENTS TAB ── */}
          {tab === 'agents' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-neutral-400 uppercase">Actions des agents sur ce prospect</h4>
              {/* Group activities by agent */}
              {(() => {
                const byAgent: Record<string, Activity[]> = {};
                prospectActivities.forEach(act => {
                  const agent = act.data?.agent || act.type || 'autre';
                  if (!byAgent[agent]) byAgent[agent] = [];
                  byAgent[agent].push(act);
                });

                const agents = Object.entries(byAgent);
                if (agents.length === 0) return <p className="text-center text-sm text-neutral-400 py-8">Aucune action d agent enregistree</p>;

                return agents.map(([agent, acts]) => (
                  <div key={agent} className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{ACTIVITY_TYPES.find(t => t.key === agent)?.icon || '🤖'}</span>
                      <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200 capitalize">{agent.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded-full text-neutral-500">{acts.length}</span>
                    </div>
                    <div className="space-y-1">
                      {acts.slice(0, 5).map(act => (
                        <div key={act.id} className="text-xs text-neutral-500 flex items-center gap-2">
                          <span className="text-neutral-300">{timeAgo(act.date_activite || act.created_at)}</span>
                          <span className="flex-1 truncate">{act.description || act.resultat || '-'}</span>
                          {act.resultat && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                              act.resultat === 'interesse' || act.resultat === 'rdv_pris' ? 'bg-green-100 text-green-700' :
                              act.resultat === 'pas_interesse' ? 'bg-red-100 text-red-600' : 'bg-neutral-100 text-neutral-500'
                            }`}>{act.resultat.replace(/_/g, ' ')}</span>
                          )}
                        </div>
                      ))}
                      {acts.length > 5 && <p className="text-[10px] text-neutral-400">+{acts.length - 5} autres actions...</p>}
                    </div>
                  </div>
                ));
              })()}

              {/* Agent interaction summary */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                <h5 className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2">Resume interactions</h5>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-neutral-400">Emails envoyes:</span> <span className="font-bold">{prospectActivities.filter(a => a.type === 'email').length}</span></div>
                  <div><span className="text-neutral-400">DMs envoyes:</span> <span className="font-bold">{prospectActivities.filter(a => a.type === 'dm_instagram').length}</span></div>
                  <div><span className="text-neutral-400">Appels:</span> <span className="font-bold">{prospectActivities.filter(a => a.type === 'appel').length}</span></div>
                  <div><span className="text-neutral-400">Relances:</span> <span className="font-bold">{prospectActivities.filter(a => a.type === 'relance').length}</span></div>
                  <div><span className="text-neutral-400">Total actions:</span> <span className="font-bold">{prospectActivities.length}</span></div>
                  <div><span className="text-neutral-400">Derniere:</span> <span className="font-bold">{prospectActivities[0] ? timeAgo(prospectActivities[0].date_activite || prospectActivities[0].created_at) : '-'}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Add Prospect Modal ── */
function AddProspectModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    company: '', type: '', source: 'other', notes: '', instagram: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.first_name && !form.company && !form.email) return;
    setSaving(true);
    try {
      await fetch('/api/crm', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      onSave();
      onClose();
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Nouveau prospect</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Prenom" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })}
              className="text-sm border rounded-lg px-3 py-2" />
            <input placeholder="Nom" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })}
              className="text-sm border rounded-lg px-3 py-2" />
          </div>
          <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
            className="w-full text-sm border rounded-lg px-3 py-2" />
          <input placeholder="Telephone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
            className="w-full text-sm border rounded-lg px-3 py-2" />
          <input placeholder="Entreprise" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
            className="w-full text-sm border rounded-lg px-3 py-2" />
          <input placeholder="Instagram (@handle)" value={form.instagram} onChange={e => setForm({ ...form, instagram: e.target.value })}
            className="w-full text-sm border rounded-lg px-3 py-2" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
              className="text-sm border rounded-lg px-3 py-2 text-neutral-500">
              <option value="">Type de commerce</option>
              {['restaurant', 'boutique', 'coach', 'coiffeur', 'fleuriste', 'boulangerie', 'traiteur', 'caviste', 'spa', 'garage', 'autre'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}
              className="text-sm border rounded-lg px-3 py-2 text-neutral-500">
              {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
            </select>
          </div>
          <textarea placeholder="Notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2} className="w-full text-sm border rounded-lg px-3 py-2 resize-none" />
        </div>
        <button onClick={handleSave} disabled={saving}
          className="w-full mt-4 py-2.5 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600 transition">
          {saving ? 'Ajout en cours...' : 'Ajouter le prospect'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN CRM COMPONENT
// ═══════════════════════════════════════════════════════

export default function WorkspaceCrm({ isAdmin }: { isAdmin: boolean }) {
  // Data
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [tempFilter, setTempFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'score' | 'name'>('recent');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // ─── Export Excel ────
  const exportToExcel = useCallback(async (data: Prospect[]) => {
    try {
      const XLSX = await import('xlsx');
      const rows = data.map(p => ({
        Nom: prospectName(p), Email: p.email, Telephone: p.phone, Entreprise: p.company,
        Type: p.type, Statut: p.status, Temperature: p.temperature, Score: p.score,
        Priorite: p.priorite, Source: p.source, Instagram: p.instagram, TikTok: p.tiktok,
        Quartier: p.quartier, 'Note Google': p.note_google, 'Avis Google': p.avis_google,
        Notes: p.notes, Tags: p.tags?.join(', '), 'Cree le': p.created_at?.split('T')[0],
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Prospects');
      XLSX.writeFile(wb, `prospects_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch { alert('Erreur lors de l\'export'); }
  }, []);

  // ─── Import Excel/CSV ────
  const importFromExcel = useCallback(async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);

      let imported = 0;
      for (const row of rows) {
        const prospect: any = {};
        if (row['Nom'] || row['first_name'] || row['nom']) {
          const nameParts = (row['Nom'] || row['nom'] || '').split(' ');
          prospect.first_name = row['first_name'] || row['prenom'] || row['Prenom'] || nameParts[0] || '';
          prospect.last_name = row['last_name'] || nameParts.slice(1).join(' ') || '';
        }
        prospect.email = row['Email'] || row['email'] || row['E-mail'] || '';
        prospect.phone = row['Telephone'] || row['phone'] || row['Tel'] || row['tel'] || '';
        prospect.company = row['Entreprise'] || row['company'] || row['societe'] || row['Societe'] || '';
        prospect.type = row['Type'] || row['type'] || '';
        prospect.source = row['Source'] || row['source'] || 'import';
        prospect.notes = row['Notes'] || row['notes'] || '';
        prospect.instagram = row['Instagram'] || row['instagram'] || row['ig'] || '';

        if (prospect.first_name || prospect.email || prospect.company) {
          await fetch('/api/crm', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prospect),
          });
          imported++;
        }
      }
      alert(`${imported} prospect(s) importes avec succes`);
      window.location.reload();
    } catch { alert('Erreur lors de l\'import. Verifiez le format du fichier.'); }
  }, []);

  // ─── Fetch ────
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/crm', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) { setError('Connectez-vous pour acceder a votre CRM.'); setLoading(false); return; }
        throw new Error('Erreur serveur');
      }
      const data = await res.json();
      setProspects(data.prospects || []);
      setActivities(data.activities || []);
      setError(null);
    } catch { setError('Impossible de charger les prospects'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Computed ────
  const filtered = useMemo(() => {
    let result = [...prospects];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        [p.first_name, p.last_name, p.company, p.email, p.type, p.instagram].some(f => f?.toLowerCase().includes(q))
      );
    }
    if (stageFilter) result = result.filter(p => p.status === stageFilter);
    if (tempFilter) result = result.filter(p => p.temperature === tempFilter);
    if (sourceFilter) result = result.filter(p => p.source === sourceFilter);

    // Sort
    if (sortBy === 'score') result.sort((a, b) => (b.score || 0) - (a.score || 0));
    else if (sortBy === 'name') result.sort((a, b) => prospectName(a).localeCompare(prospectName(b)));
    else result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return result;
  }, [prospects, search, stageFilter, tempFilter, sourceFilter, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const total = prospects.length;
    const hot = prospects.filter(p => p.temperature === 'hot').length;
    const warm = prospects.filter(p => p.temperature === 'warm').length;
    const clients = prospects.filter(p => p.status === 'client').length;
    const conversion = total > 0 ? ((clients / total) * 100).toFixed(1) : '0';
    const thisWeek = prospects.filter(p => Date.now() - new Date(p.created_at).getTime() < 7 * 86400000).length;
    return { total, hot, warm, clients, conversion, thisWeek };
  }, [prospects]);

  // ─── Render ────
  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (error) return <div className="text-center py-16"><p className="text-neutral-400 mb-4">{error}</p><button onClick={fetchData} className="text-blue-500 text-sm hover:underline">Reessayer</button></div>;

  // CRM view toggle
  const [crmView, setCrmView] = useState<'prospects' | 'tasks'>('prospects');

  return (
    <div className="space-y-4">
      {/* ─── CRM View Toggle ─── */}
      <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        <button onClick={() => setCrmView('prospects')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${crmView === 'prospects' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-400'}`}>
          👥 Prospects ({stats.total})
        </button>
        <button onClick={() => setCrmView('tasks')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${crmView === 'tasks' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' : 'text-neutral-400'}`}>
          📋 Taches agents
        </button>
      </div>

      {/* ─── TASKS VIEW ─── */}
      {crmView === 'tasks' && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-400">Activites recentes de vos agents (24h)</p>
          {activities.length === 0 ? (
            <p className="text-center text-sm text-neutral-400 py-8">Aucune activite recente</p>
          ) : (
            <div className="space-y-2">
              {/* Group by agent */}
              {(() => {
                const byAgent: Record<string, Activity[]> = {};
                activities.slice(0, 100).forEach(act => {
                  const agent = act.data?.agent || act.type || 'autre';
                  if (!byAgent[agent]) byAgent[agent] = [];
                  byAgent[agent].push(act);
                });
                return Object.entries(byAgent).map(([agent, acts]) => (
                  <div key={agent} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                    <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{ACTIVITY_TYPES.find(t => t.key === agent)?.icon || '🤖'}</span>
                        <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200 capitalize">{agent.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 px-2 py-0.5 rounded-full">{acts.length} actions</span>
                    </div>
                    <div className="divide-y divide-neutral-50 dark:divide-neutral-800">
                      {acts.slice(0, 5).map(act => {
                        const prospect = prospects.find(p => p.id === act.prospect_id);
                        return (
                          <div key={act.id} className="px-3 py-2 flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate">{act.description || '-'}</span>
                                {act.resultat && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                                    act.resultat === 'interesse' || act.resultat === 'rdv_pris' ? 'bg-green-100 text-green-700' :
                                    act.resultat === 'pas_interesse' ? 'bg-red-100 text-red-600' : 'bg-neutral-100 text-neutral-500'
                                  }`}>{act.resultat.replace(/_/g, ' ')}</span>
                                )}
                              </div>
                              {prospect && (
                                <button onClick={() => setSelectedProspect(prospect)} className="text-[10px] text-blue-500 hover:underline mt-0.5">
                                  → {prospectName(prospect)}
                                </button>
                              )}
                            </div>
                            <span className="text-[10px] text-neutral-400 shrink-0">{timeAgo(act.date_activite || act.created_at)}</span>
                          </div>
                        );
                      })}
                      {acts.length > 5 && <div className="px-3 py-1.5 text-[10px] text-neutral-400 text-center">+{acts.length - 5} autres</div>}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* ─── PROSPECTS VIEW ─── */}
      {crmView === 'prospects' && <>
      {/* ─── KPI Row ─── */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <KpiCard label="Total" value={stats.total} sub={`+${stats.thisWeek} cette semaine`} icon="👥" color="#3b82f6"
          onClick={() => { setStageFilter(null); setTempFilter(''); }} />
        <KpiCard label="Hot" value={stats.hot} icon="🔥" color="#ef4444"
          onClick={() => setTempFilter(tempFilter === 'hot' ? '' : 'hot')} />
        <KpiCard label="Warm" value={stats.warm} icon="🌡️" color="#f59e0b"
          onClick={() => setTempFilter(tempFilter === 'warm' ? '' : 'warm')} />
        <KpiCard label="Clients" value={stats.clients} sub={`${stats.conversion}% conversion`} icon="💎" color="#22c55e"
          onClick={() => setStageFilter(stageFilter === 'client' ? null : 'client')} />
      </div>

      {/* ─── Pipeline Funnel ─── */}
      <PipelineFunnel prospects={prospects} onStageClick={setStageFilter} activeStage={stageFilter} />

      {/* ─── Search + Filters + Actions ─── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un prospect..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm bg-white dark:bg-neutral-900" />
        </div>
        <div className="flex gap-2">
          <select value={tempFilter} onChange={e => setTempFilter(e.target.value)}
            className="text-xs border rounded-xl px-3 py-2 bg-white dark:bg-neutral-900">
            <option value="">Temperature</option>
            {Object.entries(TEMP_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            className="text-xs border rounded-xl px-3 py-2 bg-white dark:bg-neutral-900">
            <option value="">Source</option>
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
            className="text-xs border rounded-xl px-3 py-2 bg-white dark:bg-neutral-900">
            <option value="recent">Plus recents</option>
            <option value="score">Score</option>
            <option value="name">Nom</option>
          </select>
          <button onClick={() => setShowAddModal(true)}
            className="bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-blue-600 transition whitespace-nowrap">
            + Prospect
          </button>
          {/* Import/Export */}
          <button onClick={() => exportToExcel(filtered)} title="Exporter Excel"
            className="text-neutral-400 hover:text-green-500 text-xs px-2 py-2 rounded-xl border border-neutral-200 hover:border-green-300 transition">
            📥 Export
          </button>
          <label title="Importer Excel/CSV"
            className="text-neutral-400 hover:text-blue-500 text-xs px-2 py-2 rounded-xl border border-neutral-200 hover:border-blue-300 transition cursor-pointer">
            📤 Import
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) importFromExcel(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {/* ─── Active Filters ─── */}
      {(stageFilter || tempFilter || sourceFilter || search) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-neutral-400">Filtres:</span>
          {stageFilter && (
            <button onClick={() => setStageFilter(null)} className="text-[11px] bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full flex items-center gap-1">
              {PIPELINE_STAGES.find(s => s.key === stageFilter)?.emoji} {stageFilter} <span className="text-neutral-400">×</span>
            </button>
          )}
          {tempFilter && (
            <button onClick={() => setTempFilter('')} className="text-[11px] bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full flex items-center gap-1">
              {TEMP_CONFIG[tempFilter]?.emoji} {tempFilter} <span className="text-neutral-400">×</span>
            </button>
          )}
          {sourceFilter && (
            <button onClick={() => setSourceFilter('')} className="text-[11px] bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full flex items-center gap-1">
              {SOURCE_LABELS[sourceFilter]} <span className="text-neutral-400">×</span>
            </button>
          )}
          {search && (
            <button onClick={() => setSearch('')} className="text-[11px] bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full flex items-center gap-1">
              "{search}" <span className="text-neutral-400">×</span>
            </button>
          )}
          <button onClick={() => { setStageFilter(null); setTempFilter(''); setSourceFilter(''); setSearch(''); }}
            className="text-[10px] text-red-400 hover:text-red-500">Tout effacer</button>
        </div>
      )}

      {/* ─── Results count ─── */}
      <div className="text-xs text-neutral-400">
        {filtered.length} prospect{filtered.length > 1 ? 's' : ''} {(stageFilter || tempFilter || sourceFilter || search) ? '(filtre)' : ''}
      </div>

      {/* ─── Prospect List ─── */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-neutral-400 text-sm mb-3">Aucun prospect{search ? ' trouve' : ''}</p>
          <button onClick={() => setShowAddModal(true)} className="text-blue-500 text-sm hover:underline">+ Ajouter un prospect</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <ProspectRow key={p.id} prospect={p} activities={activities}
              onSelect={() => setSelectedProspect(p)}
              isSelected={selectedProspect?.id === p.id} />
          ))}
        </div>
      )}

      </>}

      {/* ─── Prospect Detail Slide (visible in both views) ─── */}
      {selectedProspect && (
        <ProspectDetail
          prospect={selectedProspect}
          activities={activities}
          onClose={() => setSelectedProspect(null)}
          onUpdate={() => { fetchData(); }}
        />
      )}

      {/* ─── Add Prospect Modal ─── */}
      {showAddModal && (
        <AddProspectModal onClose={() => setShowAddModal(false)} onSave={fetchData} />
      )}
    </div>
  );
}
