'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type Prospect = {
  id: string; first_name: string | null; last_name: string | null; email: string | null;
  phone: string | null; company: string | null; status: string; temperature: string | null;
  type: string | null; quartier: string | null; instagram: string | null; score: number;
  source: string | null; notes: string | null; created_at: string; updated_at: string;
  website?: string | null; google_rating?: number | null; google_reviews?: number | null;
};

type Activity = {
  id: string; prospect_id: string; type: string; description: string; data?: any; created_at: string;
};

const STATUSES = [
  { id: 'identifie', label: 'Identifie', color: 'bg-slate-400', hex: '#94a3b8', icon: '\u{1F50D}' },
  { id: 'contacte', label: 'Contacte', color: 'bg-blue-500', hex: '#3b82f6', icon: '\u{1F4E8}' },
  { id: 'relance_1', label: 'Relance 1', color: 'bg-sky-400', hex: '#38bdf8', icon: '\u{1F504}' },
  { id: 'relance_2', label: 'Relance 2', color: 'bg-indigo-400', hex: '#818cf8', icon: '\u{1F504}' },
  { id: 'relance_3', label: 'Relance 3', color: 'bg-purple-400', hex: '#a78bfa', icon: '\u23F0' },
  { id: 'repondu', label: 'Repondu', color: 'bg-violet-500', hex: '#8b5cf6', icon: '\u{1F4AC}' },
  { id: 'client', label: 'Client', color: 'bg-emerald-500', hex: '#10b981', icon: '\u2705' },
  { id: 'perdu', label: 'Perdu', color: 'bg-red-500', hex: '#ef4444', icon: '\u274C' },
];

const TEMPS = [
  { id: 'hot', label: 'Chaud', color: 'text-red-500', bg: 'bg-red-500/15', icon: '\u{1F525}' },
  { id: 'warm', label: 'Tiede', color: 'text-amber-500', bg: 'bg-amber-500/15', icon: '\u2600\uFE0F' },
  { id: 'cold', label: 'Froid', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: '\u2744\uFE0F' },
  { id: 'dead', label: 'Perdu', color: 'text-neutral-400', bg: 'bg-neutral-500/15', icon: '\u{1F480}' },
];

const SOURCES = ['email', 'dm_instagram', 'telephone', 'linkedin', 'terrain', 'widget_chatbot', 'widget_form', 'import_excel', 'google_maps'];

// ─── Prospect Detail Panel ──────────────────────────────────
function ProspectPanel({ prospect, activities, onClose, onUpdate }: {
  prospect: Prospect; activities: Activity[]; onClose: () => void;
  onUpdate: (id: string, data: Partial<Prospect>) => void;
}) {
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const statusCfg = STATUSES.find(s => s.id === prospect.status);
  const tempCfg = TEMPS.find(t => t.id === prospect.temperature);
  const prospectActivities = activities.filter(a => a.prospect_id === prospect.id);

  const addNote = useCallback(async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'add_activity', prospect_id: prospect.id, type: 'note', description: newNote }),
      });
      setNewNote('');
      window.location.reload();
    } catch {} finally { setSaving(false); }
  }, [newNote, prospect.id]);

  const updateStatus = useCallback(async (newStatus: string) => {
    try {
      await fetch('/api/crm', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: prospect.id, status: newStatus }),
      });
      onUpdate(prospect.id, { status: newStatus });
    } catch {}
  }, [prospect.id, onUpdate]);

  const updateTemp = useCallback(async (newTemp: string) => {
    try {
      await fetch('/api/crm', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: prospect.id, temperature: newTemp }),
      });
      onUpdate(prospect.id, { temperature: newTemp });
    } catch {}
  }, [prospect.id, onUpdate]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0c1a3a] h-full overflow-y-auto animate-in slide-in-from-right duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-[#0c1a3a] border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-white font-bold text-base">{prospect.company || `${prospect.first_name || ''} ${prospect.last_name || ''}`}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-[10px] ${statusCfg?.color || 'bg-white/10'} text-white font-medium`}>{statusCfg?.label || prospect.status}</span>
              {tempCfg && <span className={`${tempCfg.color} text-[11px]`}>{tempCfg.icon} {tempCfg.label}</span>}
              {prospect.score > 0 && <span className="text-[10px] text-white/40">Score: {prospect.score}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 p-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Contact info */}
          <div className="space-y-2">
            {prospect.email && <div className="flex items-center gap-2 text-xs"><span className="text-white/30 w-16">Email</span><a href={`mailto:${prospect.email}`} className="text-purple-400 hover:underline">{prospect.email}</a></div>}
            {prospect.phone && <div className="flex items-center gap-2 text-xs"><span className="text-white/30 w-16">Tel</span><a href={`tel:${prospect.phone}`} className="text-white/70">{prospect.phone}</a></div>}
            {prospect.type && <div className="flex items-center gap-2 text-xs"><span className="text-white/30 w-16">Type</span><span className="text-white/70">{prospect.type}</span></div>}
            {prospect.quartier && <div className="flex items-center gap-2 text-xs"><span className="text-white/30 w-16">Quartier</span><span className="text-white/70">{prospect.quartier}</span></div>}
            {prospect.instagram && <div className="flex items-center gap-2 text-xs"><span className="text-white/30 w-16">Instagram</span><span className="text-purple-400">{prospect.instagram}</span></div>}
            {prospect.website && <div className="flex items-center gap-2 text-xs"><span className="text-white/30 w-16">Site</span><a href={prospect.website} target="_blank" rel="noopener" className="text-purple-400 hover:underline truncate">{prospect.website}</a></div>}
            {prospect.google_rating && <div className="flex items-center gap-2 text-xs"><span className="text-white/30 w-16">Google</span><span className="text-amber-400">{'\u2B50'} {prospect.google_rating} ({prospect.google_reviews || 0} avis)</span></div>}
          </div>

          {/* Score bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/40">Score de qualification</span>
              <span className="text-xs font-bold text-white">{prospect.score}/100</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all" style={{ width: `${Math.min(prospect.score, 100)}%` }} />
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <h3 className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Avancer dans le pipeline</h3>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.filter(s => s.id !== prospect.status).slice(0, 4).map(s => (
                <button key={s.id} onClick={() => updateStatus(s.id)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium ${s.color} text-white hover:opacity-80 transition`}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Temperature */}
          <div>
            <h3 className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Temperature</h3>
            <div className="flex gap-1.5">
              {TEMPS.map(t => (
                <button key={t.id} onClick={() => updateTemp(t.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition ${prospect.temperature === t.id ? `${t.bg} ${t.color} ring-1 ring-current` : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Add note */}
          <div>
            <h3 className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Ajouter une note</h3>
            <div className="flex gap-2">
              <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Note, suivi, remarque..." className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50" onKeyDown={e => { if (e.key === 'Enter') addNote(); }} />
              <button onClick={addNote} disabled={saving || !newNote.trim()} className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-40">{saving ? '...' : '+'}</button>
            </div>
          </div>

          {/* Notes */}
          {prospect.notes && (
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
              <h3 className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Notes</h3>
              <p className="text-xs text-white/60 whitespace-pre-wrap">{prospect.notes}</p>
            </div>
          )}

          {/* Activity timeline */}
          {prospectActivities.length > 0 && (
            <div>
              <h3 className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Historique ({prospectActivities.length})</h3>
              <div className="space-y-2">
                {prospectActivities.slice(0, 20).map(a => (
                  <div key={a.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white/[0.02]">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-white/70">{a.description || a.type}</div>
                      <div className="text-[9px] text-white/25 mt-0.5">{new Date(a.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="text-[9px] text-white/15 pt-2 border-t border-white/5">
            Cree le {new Date(prospect.created_at).toLocaleDateString('fr-FR')} | Source: {prospect.source?.replace(/_/g, ' ') || '?'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main CRM Page ──────────────────────────────────────────
export default function ClientCRM() {
  const [tab, setTab] = useState<'dashboard' | 'pipeline' | 'liste'>('dashboard');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterTemp, setFilterTemp] = useState<string | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/crm?limit=5000', { credentials: 'include' });
        const data = await res.json();
        if (data.ok) {
          setProspects(data.prospects || []);
          setActivities(data.activities || []);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleUpdate = useCallback((id: string, data: Partial<Prospect>) => {
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    if (selectedProspect?.id === id) setSelectedProspect(prev => prev ? { ...prev, ...data } : null);
  }, [selectedProspect]);

  // Stats
  const stats = {
    total: prospects.length,
    hot: prospects.filter(p => p.temperature === 'hot').length,
    warm: prospects.filter(p => p.temperature === 'warm').length,
    cold: prospects.filter(p => p.temperature === 'cold').length,
    clients: prospects.filter(p => p.status === 'client').length,
    repondu: prospects.filter(p => p.status === 'repondu').length,
    contacte: prospects.filter(p => ['contacte', 'relance_1', 'relance_2', 'relance_3'].includes(p.status)).length,
    thisWeek: prospects.filter(p => new Date(p.created_at).getTime() > Date.now() - 7 * 86400000).length,
  };

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byType: Record<string, number> = {};
  prospects.forEach(p => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    if (p.source) bySource[p.source] = (bySource[p.source] || 0) + 1;
    if (p.type) byType[p.type] = (byType[p.type] || 0) + 1;
  });

  const filtered = prospects.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterTemp && p.temperature !== filterTemp) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (p.company || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.first_name || '').toLowerCase().includes(q) || (p.type || '').toLowerCase().includes(q) || (p.quartier || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleImport = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', files[0]);
    try {
      const res = await fetch('/api/crm/import', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      setImportResult(data);
      if (data.ok) window.location.reload();
    } catch (e: any) {
      setImportResult({ ok: false, error: e.message });
    } finally { setImporting(false); }
  }, []);

  const conversionRate = stats.total > 0 ? Math.round((stats.clients / stats.total) * 100) : 0;

  if (loading) {
    return <div className="min-h-screen bg-[#060b18] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#060b18] text-white">
      {/* Header */}
      <div className="bg-[#0c1a3a] border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/assistant" className="text-white/30 hover:text-white/60 transition">{'\u2190'}</a>
            <div>
              <h1 className="text-base font-bold flex items-center gap-2">Mon CRM <span className="text-[9px] bg-gradient-to-r from-purple-600 to-blue-600 px-2 py-0.5 rounded-full font-medium">PRO</span></h1>
              <p className="text-white/30 text-[10px]">{stats.total} prospects | {stats.hot} chauds | {stats.clients} clients | +{stats.thisWeek} cette semaine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {importing ? '...' : '\u{1F4E5} Importer'}
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => handleImport(e.target.files)} />
            <a href="/api/crm/export?format=csv" className="px-3 py-1.5 bg-white/10 text-white text-[10px] font-medium rounded-lg hover:bg-white/20">{'\u{1F4E4}'}</a>
          </div>
        </div>
      </div>

      {importResult && (
        <div className="max-w-7xl mx-auto px-4 py-2 mt-2">
          <div className={`rounded-lg p-3 text-sm ${importResult.ok ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
            {importResult.ok ? `${importResult.imported} importes (${importResult.skipped} doublons)` : `Erreur: ${importResult.error}`}
            <button onClick={() => setImportResult(null)} className="ml-3 text-xs opacity-60">x</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-5">
          {([
            { key: 'dashboard' as const, label: 'Dashboard', icon: '\u{1F4CA}' },
            { key: 'pipeline' as const, label: 'Pipeline', icon: '\u{1F3AF}' },
            { key: 'liste' as const, label: 'Prospects', icon: '\u{1F4CB}' },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${tab === t.key ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg' : 'text-white/50 hover:text-white/70'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ═══ DASHBOARD TAB ═══ */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            {/* KPI row — clickable */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total', value: stats.total, sub: `+${stats.thisWeek} /sem`, color: 'from-slate-600 to-slate-700', click: null },
                { label: 'Chauds', value: stats.hot, sub: `${stats.warm} tiedes`, color: 'from-red-600 to-orange-600', click: 'hot' },
                { label: 'En contact', value: stats.contacte, sub: `${stats.repondu} repondu`, color: 'from-blue-600 to-indigo-600', click: 'contacte' },
                { label: 'Clients', value: stats.clients, sub: `${conversionRate}% conversion`, color: 'from-emerald-600 to-green-600', click: 'client' },
              ].map(kpi => (
                <button key={kpi.label} onClick={() => { if (kpi.click) { setFilterStatus(kpi.click); setTab('liste'); } }} className={`rounded-xl bg-gradient-to-br ${kpi.color} p-4 text-left hover:scale-[1.02] transition-transform`}>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-white/80 font-medium">{kpi.label}</p>
                  <p className="text-[10px] text-white/50 mt-0.5">{kpi.sub}</p>
                </button>
              ))}
            </div>

            {/* Conversion funnel */}
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h3 className="text-sm font-bold mb-3">{'\u{1F3AF}'} Funnel de conversion</h3>
              <div className="space-y-2">
                {[
                  { label: 'Identifies', count: byStatus['identifie'] || 0, color: '#94a3b8' },
                  { label: 'Contactes', count: (byStatus['contacte'] || 0) + (byStatus['relance_1'] || 0) + (byStatus['relance_2'] || 0) + (byStatus['relance_3'] || 0), color: '#3b82f6' },
                  { label: 'Repondu', count: byStatus['repondu'] || 0, color: '#8b5cf6' },
                  { label: 'Clients', count: byStatus['client'] || 0, color: '#10b981' },
                ].map((step, i) => {
                  const maxCount = Math.max(stats.total, 1);
                  const pct = Math.round((step.count / maxCount) * 100);
                  return (
                    <div key={step.label} className="flex items-center gap-3">
                      <span className="text-[10px] text-white/50 w-20 text-right">{step.label}</span>
                      <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden relative">
                        <div className="h-full rounded-lg transition-all flex items-center px-2" style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: step.color }}>
                          <span className="text-[10px] text-white font-bold">{step.count}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-white/30 w-10">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Two columns: Types + Sources */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
                <h3 className="text-sm font-bold mb-3">{'\u{1F3EA}'} Par type</h3>
                {Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => (
                  <button key={type} onClick={() => { setSearchQuery(type); setTab('liste'); }} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 w-full hover:bg-white/5 rounded px-1 transition">
                    <span className="text-xs text-white/70">{type}</span>
                    <span className="text-xs font-bold">{count}</span>
                  </button>
                ))}
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
                <h3 className="text-sm font-bold mb-3">{'\u{1F4E1}'} Par source</h3>
                {Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([src, count]) => (
                  <div key={src} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-white/70">{src.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hot prospects */}
            {stats.hot > 0 && (
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                <h3 className="text-sm font-bold text-red-400 mb-3">{'\u{1F525}'} Prospects chauds a contacter</h3>
                <div className="space-y-1.5">
                  {prospects.filter(p => p.temperature === 'hot').sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5).map(p => (
                    <button key={p.id} onClick={() => setSelectedProspect(p)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition text-left">
                      <div>
                        <span className="text-xs font-medium text-white">{p.company || p.first_name || '?'}</span>
                        <span className="text-[10px] text-white/30 ml-2">{p.type || ''} {p.quartier ? `- ${p.quartier}` : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-amber-400">{'\u2B50'} {p.score}</span>
                        <span className="text-white/20">{'\u203A'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ PIPELINE TAB ═══ */}
        {tab === 'pipeline' && (
          <div className="space-y-3">
            {STATUSES.map(s => {
              const count = byStatus[s.id] || 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              const stProspects = prospects.filter(p => p.status === s.id).sort((a, b) => (b.score || 0) - (a.score || 0));
              return (
                <div key={s.id} className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                  <button onClick={() => setFilterStatus(filterStatus === s.id ? null : s.id)} className="w-full p-3 flex items-center gap-3 hover:bg-white/[0.02] transition">
                    <span className="text-lg">{s.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold">{s.label}</span>
                        <span className="text-xs text-white/50">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.hex }} />
                      </div>
                    </div>
                  </button>
                  {filterStatus === s.id && stProspects.length > 0 && (
                    <div className="border-t border-white/5 px-3 py-2 space-y-1">
                      {stProspects.slice(0, 10).map(p => (
                        <button key={p.id} onClick={() => setSelectedProspect(p)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 transition text-left">
                          <span className="text-[11px] text-white/70">{p.company || p.first_name || '?'}</span>
                          <div className="flex items-center gap-2">
                            {p.temperature && <span className="text-[10px]">{TEMPS.find(t => t.id === p.temperature)?.icon}</span>}
                            <span className="text-[10px] text-white/30">{p.score}</span>
                          </div>
                        </button>
                      ))}
                      {stProspects.length > 10 && <p className="text-[10px] text-white/20 text-center">+{stProspects.length - 10} autres</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ LISTE TAB ═══ */}
        {tab === 'liste' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher entreprise, email, type, quartier..." className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50 flex-1 min-w-[200px]" />
              <select value={filterStatus || ''} onChange={e => setFilterStatus(e.target.value || null)} className="px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white/70">
                <option value="">Tous statuts</option>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label} ({byStatus[s.id] || 0})</option>)}
              </select>
              <select value={filterTemp || ''} onChange={e => setFilterTemp(e.target.value || null)} className="px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white/70">
                <option value="">Toutes temp.</option>
                {TEMPS.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
              <span className="text-[10px] text-white/30">{filtered.length} resultats</span>
            </div>

            <div className="space-y-1">
              {filtered.slice(0, 200).map(p => {
                const statusCfg = STATUSES.find(s => s.id === p.status);
                const tempCfg = TEMPS.find(t => t.id === p.temperature);
                return (
                  <button key={p.id} onClick={() => setSelectedProspect(p)} className="w-full rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/15 hover:bg-white/[0.04] transition px-4 py-3 flex items-center gap-3 text-left">
                    {/* Score circle */}
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: `conic-gradient(${statusCfg?.hex || '#6b7280'} ${(p.score || 0)}%, transparent 0)`, padding: '2px' }}>
                      <div className="w-full h-full rounded-full bg-[#060b18] flex items-center justify-center">{p.score || 0}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white truncate">{p.company || `${p.first_name || ''} ${p.last_name || ''}`}</span>
                        {tempCfg && <span className="text-[10px]">{tempCfg.icon}</span>}
                      </div>
                      <div className="text-[10px] text-white/30 truncate mt-0.5">
                        {p.type || ''}{p.quartier ? ` - ${p.quartier}` : ''}{p.email ? ` | ${p.email}` : ''}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] ${statusCfg?.color || 'bg-white/10'} text-white font-medium flex-shrink-0`}>{statusCfg?.label || p.status}</span>
                    <span className="text-white/15 flex-shrink-0">{'\u203A'}</span>
                  </button>
                );
              })}
            </div>
            {filtered.length > 200 && <p className="text-center text-white/20 text-xs py-2">+ {filtered.length - 200} autres — utilisez la recherche pour affiner</p>}
          </div>
        )}
      </div>

      {/* Prospect detail panel */}
      {selectedProspect && (
        <ProspectPanel
          prospect={selectedProspect}
          activities={activities}
          onClose={() => setSelectedProspect(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
