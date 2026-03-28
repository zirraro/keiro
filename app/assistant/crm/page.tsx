'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Prospect = {
  id: string; first_name: string | null; last_name: string | null; email: string | null;
  phone: string | null; company: string | null; status: string; temperature: string | null;
  type: string | null; quartier: string | null; instagram: string | null; score: number;
  source: string | null; notes: string | null; created_at: string; updated_at: string;
};

type Tab = 'stats' | 'pipeline' | 'canaux' | 'liste';

const STATUSES = [
  { id: 'identifie', label: 'Identifie', color: 'bg-slate-400', icon: '\u{1F50D}' },
  { id: 'contacte', label: 'Contacte', color: 'bg-blue-500', icon: '\u{1F4E8}' },
  { id: 'relance_1', label: 'Relance 1', color: 'bg-sky-400', icon: '\u{1F504}' },
  { id: 'relance_2', label: 'Relance 2', color: 'bg-indigo-400', icon: '\u{1F504}' },
  { id: 'relance_3', label: 'Relance 3', color: 'bg-purple-400', icon: '\u23F0' },
  { id: 'repondu', label: 'Repondu', color: 'bg-violet-500', icon: '\u{1F4AC}' },
  { id: 'client', label: 'Client', color: 'bg-emerald-500', icon: '\u2705' },
  { id: 'perdu', label: 'Perdu', color: 'bg-red-500', icon: '\u274C' },
];

const TEMPS = [
  { id: 'hot', label: 'Chaud', color: 'text-red-500', icon: '\u{1F525}' },
  { id: 'warm', label: 'Tiede', color: 'text-amber-500', icon: '\u2600\uFE0F' },
  { id: 'cold', label: 'Froid', color: 'text-blue-400', icon: '\u2744\uFE0F' },
  { id: 'dead', label: 'Perdu', color: 'text-neutral-400', icon: '\u{1F480}' },
];

const SOURCES = ['email', 'dm_instagram', 'telephone', 'linkedin', 'terrain', 'widget_chatbot', 'widget_form', 'import_excel'];

export default function ClientCRM() {
  const [tab, setTab] = useState<Tab>('stats');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterTemp, setFilterTemp] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load prospects
  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('crm_prospects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);

      setProspects(data || []);
      setLoading(false);
    })();
  }, []);

  // Stats
  const stats = {
    total: prospects.length,
    hot: prospects.filter(p => p.temperature === 'hot').length,
    warm: prospects.filter(p => p.temperature === 'warm').length,
    cold: prospects.filter(p => p.temperature === 'cold').length,
    clients: prospects.filter(p => p.status === 'client').length,
    repondu: prospects.filter(p => p.status === 'repondu').length,
  };

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byType: Record<string, number> = {};
  prospects.forEach(p => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    if (p.source) bySource[p.source] = (bySource[p.source] || 0) + 1;
    if (p.type) byType[p.type] = (byType[p.type] || 0) + 1;
  });

  // Filtered list
  const filtered = prospects.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterTemp && p.temperature !== filterTemp) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (p.company || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.first_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Import
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
      if (data.ok) {
        // Reload prospects
        const supabase = supabaseBrowser();
        const { data: fresh } = await supabase.from('crm_prospects').select('*').order('created_at', { ascending: false }).limit(2000);
        if (fresh) setProspects(fresh);
      }
    } catch (e: any) {
      setImportResult({ ok: false, error: e.message });
    } finally { setImporting(false); }
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-[#060b18] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#060b18] text-white">
      {/* Header */}
      <div className="bg-[#0c1a3a] border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Mon CRM</h1>
            <p className="text-white/40 text-xs">{stats.total} prospects | {stats.hot} chauds | {stats.clients} clients</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {importing ? 'Import...' : '\u{1F4E5} Importer Excel'}
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => handleImport(e.target.files)} />
            <a href="/api/crm/export?format=csv" className="px-3 py-1.5 bg-white/10 text-white text-xs font-medium rounded-lg hover:bg-white/20">
              {'\u{1F4E4}'} Exporter CSV
            </a>
            <a href="/assistant" className="text-xs text-purple-400 hover:text-purple-300">{'\u2190'} Retour</a>
          </div>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className={`max-w-7xl mx-auto px-4 py-2 mt-2`}>
          <div className={`rounded-lg p-3 text-sm ${importResult.ok ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
            {importResult.ok
              ? `${importResult.imported} prospects importes (${importResult.skipped} ignores/doublons)`
              : `Erreur: ${importResult.error}`}
            <button onClick={() => setImportResult(null)} className="ml-3 text-xs opacity-60">Fermer</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6">
          {([
            { key: 'stats' as Tab, label: 'Stats', icon: '\u{1F4CA}' },
            { key: 'pipeline' as Tab, label: 'Pipeline', icon: '\u{1F3AF}' },
            { key: 'canaux' as Tab, label: 'Canaux', icon: '\u{1F4E1}' },
            { key: 'liste' as Tab, label: 'Liste', icon: '\u{1F4CB}' },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${tab === t.key ? 'bg-purple-600 text-white' : 'text-white/50 hover:text-white/70'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* STATS TAB */}
        {tab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total', value: stats.total, color: 'from-slate-600 to-slate-700' },
                { label: 'Chauds', value: stats.hot, color: 'from-red-600 to-orange-600' },
                { label: 'Tiedes', value: stats.warm, color: 'from-amber-600 to-yellow-600' },
                { label: 'Froids', value: stats.cold, color: 'from-blue-600 to-cyan-600' },
                { label: 'Repondu', value: stats.repondu, color: 'from-violet-600 to-purple-600' },
                { label: 'Clients', value: stats.clients, color: 'from-emerald-600 to-green-600' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl bg-gradient-to-br ${s.color} p-4 text-center`}>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-white/70">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
                <h3 className="text-sm font-bold mb-3">Par type de commerce</h3>
                {Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-white/70">{type}</span>
                    <span className="text-xs font-bold">{count}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
                <h3 className="text-sm font-bold mb-3">Par source</h3>
                {Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([src, count]) => (
                  <div key={src} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-white/70">{src}</span>
                    <span className="text-xs font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PIPELINE TAB */}
        {tab === 'pipeline' && (
          <div className="space-y-3">
            {STATUSES.map(s => {
              const count = byStatus[s.id] || 0;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={s.id} className="rounded-xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3">
                  <span className="text-lg">{s.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">{s.label}</span>
                      <span className="text-xs text-white/50">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${s.color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CANAUX TAB */}
        {tab === 'canaux' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SOURCES.map(src => {
              const count = bySource[src] || 0;
              return (
                <div key={src} className="rounded-xl bg-white/[0.03] border border-white/10 p-4 text-center">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-white/50 mt-1">{src.replace(/_/g, ' ')}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* LISTE TAB */}
        {tab === 'liste' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher..." className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50 w-48" />
              <select value={filterStatus || ''} onChange={e => setFilterStatus(e.target.value || null)} className="px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white/70">
                <option value="">Tous statuts</option>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select value={filterTemp || ''} onChange={e => setFilterTemp(e.target.value || null)} className="px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white/70">
                <option value="">Toutes temp.</option>
                {TEMPS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <span className="text-xs text-white/30 ml-auto">{filtered.length} resultats</span>
            </div>

            {/* Table */}
            <div className="rounded-xl bg-white/[0.02] border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      <th className="text-left px-3 py-2 font-semibold text-white/60">Entreprise</th>
                      <th className="text-left px-3 py-2 font-semibold text-white/60">Contact</th>
                      <th className="text-left px-3 py-2 font-semibold text-white/60">Type</th>
                      <th className="text-left px-3 py-2 font-semibold text-white/60">Statut</th>
                      <th className="text-left px-3 py-2 font-semibold text-white/60">Temp.</th>
                      <th className="text-left px-3 py-2 font-semibold text-white/60">Source</th>
                      <th className="text-left px-3 py-2 font-semibold text-white/60">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 100).map(p => {
                      const statusCfg = STATUSES.find(s => s.id === p.status);
                      const tempCfg = TEMPS.find(t => t.id === p.temperature);
                      return (
                        <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                          <td className="px-3 py-2 font-medium text-white">{p.company || '-'}</td>
                          <td className="px-3 py-2 text-white/60">{p.first_name || ''} {p.email ? `(${p.email.substring(0, 25)})` : ''}</td>
                          <td className="px-3 py-2 text-white/50">{p.type || '-'}</td>
                          <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${statusCfg?.color || 'bg-white/10'} text-white`}>{statusCfg?.label || p.status}</span></td>
                          <td className="px-3 py-2"><span className={tempCfg?.color || ''}>{tempCfg?.icon || ''} {tempCfg?.label || p.temperature || '-'}</span></td>
                          <td className="px-3 py-2 text-white/40">{p.source?.replace(/_/g, ' ') || '-'}</td>
                          <td className="px-3 py-2 text-white/30">{new Date(p.created_at).toLocaleDateString('fr-FR')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length > 100 && <p className="text-center text-white/30 text-xs py-2">+ {filtered.length - 100} autres...</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
