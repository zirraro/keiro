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
  notes: string;
  tags: string[];
  created_at: string;
}

interface Activity {
  id: string;
  prospect_id: string;
  type: string;
  description: string;
  resultat: string;
  date_activite: string;
}

interface WorkspaceCrmProps {
  isAdmin: boolean;
}

// ─── Constants ──────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'identifie', label: 'Identifie', color: 'bg-slate-500' },
  { key: 'contacte', label: 'Contacte', color: 'bg-blue-500' },
  { key: 'repondu', label: 'Repondu', color: 'bg-emerald-500' },
  { key: 'demo', label: 'Demo', color: 'bg-violet-500' },
  { key: 'sprint', label: 'Sprint', color: 'bg-purple-500' },
  { key: 'client', label: 'Client', color: 'bg-green-500' },
  { key: 'perdu', label: 'Perdu', color: 'bg-red-500/70' },
];

const TEMP_CONFIG: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  hot:  { emoji: '\uD83D\uDD25', label: 'Hot',  bg: 'bg-red-500/20',    text: 'text-red-400' },
  warm: { emoji: '\uD83C\uDF21\uFE0F', label: 'Warm', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  cold: { emoji: '\u2744\uFE0F', label: 'Cold', bg: 'bg-blue-500/20',   text: 'text-blue-400' },
  dead: { emoji: '\uD83D\uDC80', label: 'Dead', bg: 'bg-gray-500/20',   text: 'text-gray-400' },
};

const SOURCES = [
  'dm_instagram', 'email', 'telephone', 'linkedin', 'terrain',
  'facebook', 'tiktok', 'recommandation', 'other',
];

const ACTIVITY_TYPES = [
  { key: 'appel', label: 'Appel', icon: '\uD83D\uDCDE' },
  { key: 'email', label: 'Email', icon: '\uD83D\uDCE7' },
  { key: 'dm_instagram', label: 'DM Instagram', icon: '\uD83D\uDCF8' },
  { key: 'rdv', label: 'RDV', icon: '\uD83D\uDCC5' },
  { key: 'relance', label: 'Relance', icon: '\uD83D\uDD04' },
  { key: 'note', label: 'Note', icon: '\uD83D\uDCDD' },
];

const RESULT_OPTIONS = [
  { key: '', label: '-- Resultat --' },
  { key: 'interesse', label: 'Interesse' },
  { key: 'demande_infos', label: 'Demande infos' },
  { key: 'rdv_pris', label: 'RDV pris' },
  { key: 'pas_de_reponse', label: 'Pas de reponse' },
  { key: 'rappeler', label: 'A rappeler' },
  { key: 'pas_interesse', label: 'Pas interesse' },
];

// ─── Helpers ────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}j`;
}

// ─── Component ──────────────────────────────────────────

export default function WorkspaceCrm({ isAdmin }: WorkspaceCrmProps) {
  // Data
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [tempFilter, setTempFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState<string | null>(null); // prospect id
  const [editingProspect, setEditingProspect] = useState<string | null>(null);

  // Add prospect form
  const [newProspect, setNewProspect] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    company: '', source: 'other', notes: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  // Activity form
  const [activityForm, setActivityForm] = useState({
    type: 'appel', description: '', resultat: '',
  });
  const [activityLoading, setActivityLoading] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({
    status: '', temperature: '', notes: '', priorite: '',
  });
  const [editLoading, setEditLoading] = useState(false);

  // ─── Fetch data (prospects + activities in one call) ────
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/crm', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          setError('Connectez-vous pour acceder a votre CRM.');
          setLoading(false);
          return;
        }
        throw new Error('Erreur serveur');
      }
      const data = await res.json();
      setProspects(data.prospects || []);
      setActivities(data.activities || []);
      setError(null);
    } catch {
      setError('Impossible de charger les prospects');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Pipeline stats ───────────────────────────────────
  const pipeline = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of prospects) {
      map[p.status] = (map[p.status] || 0) + 1;
    }
    return map;
  }, [prospects]);

  const stats = useMemo(() => {
    const total = prospects.length;
    const hot = prospects.filter(p => p.temperature === 'hot').length;
    const warm = prospects.filter(p => p.temperature === 'warm').length;
    const clients = prospects.filter(p => p.status === 'client').length;
    return { total, hot, warm, clients, conversionRate: total > 0 ? Math.round((clients / total) * 100) : 0 };
  }, [prospects]);

  // ─── Filtered prospects ───────────────────────────────
  const filtered = useMemo(() => {
    let list = [...prospects];
    if (stageFilter) list = list.filter(p => p.status === stageFilter);
    if (tempFilter) list = list.filter(p => p.temperature === tempFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.company && p.company.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q))
      );
    }
    const tempOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2, dead: 3 };
    list.sort((a, b) => {
      const ta = tempOrder[a.temperature] ?? 2;
      const tb = tempOrder[b.temperature] ?? 2;
      if (ta !== tb) return ta - tb;
      return b.score - a.score;
    });
    return list;
  }, [prospects, stageFilter, tempFilter, search]);

  // ─── Add prospect ─────────────────────────────────────
  const handleAddProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProspect.first_name.trim() && !newProspect.company.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...newProspect,
          status: 'identifie',
          temperature: 'cold',
          priorite: 'C',
          score: 0,
        }),
      });
      if (res.ok) {
        setNewProspect({ first_name: '', last_name: '', email: '', phone: '', company: '', source: 'other', notes: '' });
        setShowAddForm(false);
        await fetchData();
      }
    } catch { /* silent */ }
    setAddLoading(false);
  };

  // ─── Add activity ─────────────────────────────────────
  const handleAddActivity = async (prospectId: string) => {
    if (!activityForm.type) return;
    setActivityLoading(true);
    try {
      const res = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'add_activity',
          prospect_id: prospectId,
          type: activityForm.type,
          description: activityForm.description,
          resultat: activityForm.resultat || undefined,
        }),
      });
      if (res.ok) {
        setActivityForm({ type: 'appel', description: '', resultat: '' });
        setShowActivityForm(null);
        await fetchData();
      }
    } catch { /* silent */ }
    setActivityLoading(false);
  };

  // ─── Edit prospect ────────────────────────────────────
  const handleStartEdit = (p: Prospect) => {
    setEditingProspect(p.id);
    setEditForm({
      status: p.status,
      temperature: p.temperature,
      notes: p.notes || '',
      priorite: p.priorite || 'C',
    });
  };

  const handleSaveEdit = async (prospectId: string) => {
    setEditLoading(true);
    try {
      const res = await fetch('/api/crm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: prospectId, ...editForm }),
      });
      if (res.ok) {
        setEditingProspect(null);
        await fetchData();
      }
    } catch { /* silent */ }
    setEditLoading(false);
  };

  // ─── Loading / Error states ───────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6">
        <p className="text-white/40 text-xs">{error}</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header + Add button */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-bold text-sm">{'\uD83D\uDCCA'} CRM — Pipeline Commercial</h3>
          <p className="text-white/40 text-[10px] mt-0.5">
            {stats.total} prospects {'\u00B7'} {stats.hot} chauds {'\u00B7'} {stats.clients} clients ({stats.conversionRate}%)
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-purple-300 text-[11px] font-medium transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showAddForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'} />
          </svg>
          {showAddForm ? 'Annuler' : 'Nouveau prospect'}
        </button>
      </div>

      {/* Add prospect form */}
      {showAddForm && (
        <form onSubmit={handleAddProspect} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Prenom"
              value={newProspect.first_name}
              onChange={e => setNewProspect(prev => ({ ...prev, first_name: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <input
              type="text"
              placeholder="Nom"
              value={newProspect.last_name}
              onChange={e => setNewProspect(prev => ({ ...prev, last_name: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="Email"
              value={newProspect.email}
              onChange={e => setNewProspect(prev => ({ ...prev, email: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <input
              type="tel"
              placeholder="Telephone"
              value={newProspect.phone}
              onChange={e => setNewProspect(prev => ({ ...prev, phone: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Entreprise"
              value={newProspect.company}
              onChange={e => setNewProspect(prev => ({ ...prev, company: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <select
              value={newProspect.source}
              onChange={e => setNewProspect(prev => ({ ...prev, source: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none"
            >
              {SOURCES.map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Notes (optionnel)"
            value={newProspect.notes}
            onChange={e => setNewProspect(prev => ({ ...prev, notes: e.target.value }))}
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
          />
          <button
            type="submit"
            disabled={addLoading || (!newProspect.first_name.trim() && !newProspect.company.trim())}
            className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-40"
          >
            {addLoading ? 'Ajout en cours...' : 'Ajouter le prospect'}
          </button>
        </form>
      )}

      {/* Mini pipeline bar */}
      {stats.total > 0 && (
        <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
          {PIPELINE_STAGES.map(stage => {
            const count = pipeline[stage.key] || 0;
            if (count === 0) return null;
            const pct = (count / stats.total) * 100;
            return (
              <button
                key={stage.key}
                onClick={() => setStageFilter(stageFilter === stage.key ? null : stage.key)}
                className={`${stage.color} transition-all hover:brightness-125 ${stageFilter === stage.key ? 'ring-1 ring-white ring-inset' : ''}`}
                style={{ width: `${Math.max(pct, 3)}%` }}
                title={`${stage.label}: ${count}`}
              />
            );
          })}
        </div>
      )}

      {/* Pipeline legend */}
      {stats.total > 0 && (
        <div className="flex flex-wrap gap-2">
          {PIPELINE_STAGES.map(stage => {
            const count = pipeline[stage.key] || 0;
            if (count === 0) return null;
            return (
              <button
                key={stage.key}
                onClick={() => setStageFilter(stageFilter === stage.key ? null : stage.key)}
                className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full transition-all ${
                  stageFilter === stage.key ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${stage.color}`} />
                {stage.label} ({count})
              </button>
            );
          })}
          {stageFilter && (
            <button
              onClick={() => setStageFilter(null)}
              className="text-[9px] text-purple-400 hover:text-purple-300 ml-1"
            >
              Effacer
            </button>
          )}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>
        <select
          value={tempFilter}
          onChange={e => setTempFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-white/60 focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none"
        >
          <option value="">Temp.</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
      </div>

      {/* Prospect list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-white/30 text-xs">Aucun prospect trouve</p>
          </div>
        ) : (
          filtered.map(p => {
            const isExpanded = expandedId === p.id;
            const isEditing = editingProspect === p.id;
            const prospectActivities = activities.filter(a => a.prospect_id === p.id);
            const tempCfg = TEMP_CONFIG[p.temperature] || TEMP_CONFIG.cold;
            const statusStage = PIPELINE_STAGES.find(s => s.key === p.status);

            return (
              <div key={p.id} className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden">
                {/* Prospect row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-white/[0.03] transition-colors"
                >
                  {/* Temperature dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    p.temperature === 'hot' ? 'bg-red-500' : p.temperature === 'warm' ? 'bg-orange-500' : p.temperature === 'dead' ? 'bg-gray-500' : 'bg-blue-400'
                  }`} />

                  {/* Name + company */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-medium truncate">
                      {p.first_name} {p.last_name}
                    </div>
                    {p.company && (
                      <div className="text-white/30 text-[10px] truncate">{p.company}</div>
                    )}
                  </div>

                  {/* Status pill */}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    statusStage?.key === 'client' ? 'bg-green-500/20 text-green-400'
                    : statusStage?.key === 'perdu' ? 'bg-red-500/20 text-red-400'
                    : statusStage?.key === 'demo' || statusStage?.key === 'sprint' ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-white/10 text-white/50'
                  }`}>
                    {statusStage?.label || p.status}
                  </span>

                  {/* Score */}
                  <span className="text-white/30 text-[10px] w-6 text-right">{p.score}</span>

                  {/* Chevron */}
                  <svg className={`w-3.5 h-3.5 text-white/20 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-white/5 px-3 py-3 space-y-3">
                    {/* Contact info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                      {p.email && (
                        <div>
                          <span className="text-white/30">Email: </span>
                          <span className="text-white/70">{p.email}</span>
                        </div>
                      )}
                      {p.phone && (
                        <div>
                          <span className="text-white/30">Tel: </span>
                          <span className="text-white/70">{p.phone}</span>
                        </div>
                      )}
                      {p.instagram && (
                        <div>
                          <span className="text-white/30">IG: </span>
                          <span className="text-purple-400">@{p.instagram}</span>
                        </div>
                      )}
                      {p.source && (
                        <div>
                          <span className="text-white/30">Source: </span>
                          <span className="text-white/70 capitalize">{p.source.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {p.notes && !isEditing && (
                      <div className="bg-white/[0.03] rounded-lg p-2">
                        <p className="text-white/50 text-[10px] leading-relaxed">{p.notes}</p>
                      </div>
                    )}

                    {/* Edit form */}
                    {isEditing ? (
                      <div className="space-y-2 bg-white/[0.03] rounded-lg p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="text-white/30 text-[9px] uppercase tracking-wider">Statut</label>
                            <select
                              value={editForm.status}
                              onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 appearance-none mt-0.5"
                            >
                              {PIPELINE_STAGES.map(s => (
                                <option key={s.key} value={s.key}>{s.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-white/30 text-[9px] uppercase tracking-wider">Temp.</label>
                            <select
                              value={editForm.temperature}
                              onChange={e => setEditForm(prev => ({ ...prev, temperature: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 appearance-none mt-0.5"
                            >
                              <option value="hot">Hot</option>
                              <option value="warm">Warm</option>
                              <option value="cold">Cold</option>
                              <option value="dead">Dead</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-white/30 text-[9px] uppercase tracking-wider">Priorite</label>
                            <select
                              value={editForm.priorite}
                              onChange={e => setEditForm(prev => ({ ...prev, priorite: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 appearance-none mt-0.5"
                            >
                              <option value="A">A - Haute</option>
                              <option value="B">B - Moyenne</option>
                              <option value="C">C - Basse</option>
                            </select>
                          </div>
                        </div>
                        <textarea
                          placeholder="Notes..."
                          value={editForm.notes}
                          onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingProspect(null)}
                            className="flex-1 py-1.5 bg-white/5 text-white/50 text-[10px] rounded-lg hover:bg-white/10 transition-colors"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => handleSaveEdit(p.id)}
                            disabled={editLoading}
                            className="flex-1 py-1.5 bg-purple-600/30 text-purple-300 text-[10px] font-medium rounded-lg hover:bg-purple-600/40 transition-colors disabled:opacity-40"
                          >
                            {editLoading ? 'Sauvegarde...' : 'Sauvegarder'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Action buttons */
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEdit(p)}
                          className="flex items-center gap-1 px-2 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/50 text-[10px] transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Modifier
                        </button>
                        <button
                          onClick={() => setShowActivityForm(showActivityForm === p.id ? null : p.id)}
                          className="flex items-center gap-1 px-2 py-1.5 bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/20 rounded-lg text-purple-300 text-[10px] transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Activite
                        </button>
                        {p.phone && (
                          <a
                            href={`tel:${p.phone}`}
                            className="flex items-center gap-1 px-2 py-1.5 bg-green-600/15 hover:bg-green-600/25 border border-green-500/20 rounded-lg text-green-300 text-[10px] transition-colors"
                          >
                            {'\uD83D\uDCDE'} Appeler
                          </a>
                        )}
                        {p.email && (
                          <a
                            href={`mailto:${p.email}`}
                            className="flex items-center gap-1 px-2 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/20 rounded-lg text-blue-300 text-[10px] transition-colors"
                          >
                            {'\uD83D\uDCE7'} Email
                          </a>
                        )}
                      </div>
                    )}

                    {/* Activity form */}
                    {showActivityForm === p.id && (
                      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
                        <div className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-1">
                          Nouvelle activite
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {ACTIVITY_TYPES.map(at => (
                            <button
                              key={at.key}
                              onClick={() => setActivityForm(prev => ({ ...prev, type: at.key }))}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all ${
                                activityForm.type === at.key
                                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30'
                                  : 'bg-white/5 text-white/40 hover:bg-white/10'
                              }`}
                            >
                              {at.icon} {at.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Description..."
                          value={activityForm.description}
                          onChange={e => setActivityForm(prev => ({ ...prev, description: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                        />
                        <select
                          value={activityForm.resultat}
                          onChange={e => setActivityForm(prev => ({ ...prev, resultat: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/60 focus:outline-none focus:ring-1 focus:ring-purple-500/50 appearance-none"
                        >
                          {RESULT_OPTIONS.map(r => (
                            <option key={r.key} value={r.key}>{r.label}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowActivityForm(null)}
                            className="flex-1 py-1.5 bg-white/5 text-white/50 text-[10px] rounded-lg hover:bg-white/10 transition-colors"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => handleAddActivity(p.id)}
                            disabled={activityLoading}
                            className="flex-1 py-1.5 bg-purple-600/30 text-purple-300 text-[10px] font-medium rounded-lg hover:bg-purple-600/40 transition-colors disabled:opacity-40"
                          >
                            {activityLoading ? 'Envoi...' : 'Enregistrer'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Activity history */}
                    {prospectActivities.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-white/30 text-[9px] uppercase tracking-wider font-semibold">Historique</div>
                        {prospectActivities.slice(0, 5).map(act => (
                          <div key={act.id} className="flex items-start gap-2 text-[10px]">
                            <span>{ACTIVITY_TYPES.find(at => at.key === act.type)?.icon || '\uD83D\uDCDD'}</span>
                            <div className="flex-1 min-w-0">
                              <span className="text-white/60">{act.description || act.type.replace(/_/g, ' ')}</span>
                              {act.resultat && (
                                <span className="text-purple-300/70 ml-1">{'\u2192'} {act.resultat.replace(/_/g, ' ')}</span>
                              )}
                            </div>
                            <span className="text-white/20 flex-shrink-0">{timeAgo(act.date_activite)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Full CRM link for admin */}
      {isAdmin && (
        <a
          href="/admin/crm"
          className="block text-center text-[11px] text-purple-400 hover:text-purple-300 font-medium transition-colors py-2"
        >
          Ouvrir le CRM complet {'\u2192'}
        </a>
      )}
    </div>
  );
}
