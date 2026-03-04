'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUSES = [
  { value: 'new', label: 'Nouveau', color: 'bg-blue-100 text-blue-700', emoji: '🔵' },
  { value: 'contacted', label: 'Contacté', color: 'bg-purple-100 text-purple-700', emoji: '📞' },
  { value: 'interested', label: 'Intéressé', color: 'bg-yellow-100 text-yellow-700', emoji: '⚡' },
  { value: 'demo', label: 'Démo', color: 'bg-orange-100 text-orange-700', emoji: '🎯' },
  { value: 'negotiation', label: 'Négociation', color: 'bg-cyan-100 text-cyan-700', emoji: '💬' },
  { value: 'converted', label: 'Converti', color: 'bg-green-100 text-green-700', emoji: '🟢' },
  { value: 'lost', label: 'Perdu', color: 'bg-red-100 text-red-700', emoji: '🔴' },
];

const SOURCES = [
  { value: 'site', label: 'Site web' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'referral', label: 'Recommandation' },
  { value: 'event', label: 'Événement' },
  { value: 'cold', label: 'Prospection' },
  { value: 'import', label: 'Import' },
  { value: 'other', label: 'Autre' },
];

type Prospect = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  tags: string[];
  matched_user_id: string | null;
  matched_plan: string | null;
  created_at: string;
  updated_at: string;
};

type ProspectForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  status: string;
  source: string;
  notes: string;
  tags: string;
};

const emptyForm: ProspectForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  company: '',
  status: 'new',
  source: 'site',
  notes: '',
  tags: '',
};

type SortField = 'name' | 'email' | 'company' | 'status' | 'source' | 'plan' | 'created_at';
type SortDir = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatusInfo(value: string) {
  return STATUSES.find(s => s.value === value) || STATUSES[0];
}

function getSourceLabel(value: string | null) {
  if (!value) return '—';
  return SOURCES.find(s => s.value === value)?.label || value;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getPlanBadge(plan: string | null) {
  if (!plan) return null;
  const lower = plan.toLowerCase();
  if (lower === 'free' || lower === 'gratuit') {
    return { label: plan, classes: 'bg-neutral-100 text-neutral-600' };
  }
  return { label: plan, classes: 'bg-green-100 text-green-700' };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminCRMPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Prospects data
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loadingProspects, setLoadingProspects] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Stats
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number> }>({
    total: 0,
    byStatus: {},
  });

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [form, setForm] = useState<ProspectForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Import/Export
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [matching, setMatching] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  // ─── Auth Check ──────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      if (!profile?.is_admin) { router.push('/'); return; }
      setIsAdmin(true);
      setLoading(false);
    };
    init();
  }, [supabase, router]);

  // Load prospects when filters change (after auth)
  useEffect(() => {
    if (!isAdmin) return;
    loadProspects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, search, filterStatus, filterSource]);

  // ─── API Calls ───────────────────────────────────────────────────────────

  const loadProspects = async () => {
    setLoadingProspects(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);
      if (filterSource) params.set('source', filterSource);

      const res = await fetch(`/api/admin/crm?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load prospects');

      const data = await res.json();
      setProspects(data.prospects || []);
      if (data.stats) {
        setStats(data.stats);
      } else {
        // Compute stats client-side if not returned
        const all = data.prospects || [];
        const byStatus: Record<string, number> = {};
        STATUSES.forEach(s => { byStatus[s.value] = 0; });
        all.forEach((p: Prospect) => {
          byStatus[p.status] = (byStatus[p.status] || 0) + 1;
        });
        setStats({ total: all.length, byStatus });
      }
    } catch (e) {
      console.error('[CRM] Load error:', e);
    } finally {
      setLoadingProspects(false);
    }
  };

  const saveProspect = async () => {
    setSaving(true);
    try {
      const body = {
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        status: form.status,
        source: form.source || null,
        notes: form.notes || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };

      let res: Response;
      if (editingProspect) {
        res = await fetch(`/api/admin/crm/${editingProspect.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/admin/crm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) throw new Error('Failed to save prospect');

      closeModal();
      await loadProspects();
    } catch (e) {
      console.error('[CRM] Save error:', e);
      alert('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const deleteProspect = async (id: string) => {
    if (!confirm('Supprimer ce prospect ? Cette action est irréversible.')) return;

    setDeleting(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/crm/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');

      closeModal();
      await loadProspects();
    } catch (e) {
      console.error('[CRM] Delete error:', e);
      alert('Erreur lors de la suppression.');
    } finally {
      setDeleting(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/crm/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Import failed');

      const data = await res.json();
      setImportResult({ imported: data.imported || 0, skipped: data.skipped || 0 });
      await loadProspects();
    } catch (e) {
      console.error('[CRM] Import error:', e);
      alert('Erreur lors de l\'import.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);
      if (filterSource) params.set('source', filterSource);

      const res = await fetch(`/api/admin/crm/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-prospects-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[CRM] Export error:', e);
      alert('Erreur lors de l\'export.');
    }
  };

  const handleMatch = async () => {
    if (!confirm('Matcher les prospects avec les utilisateurs Keiro existants ? Cela met à jour le champ "Plan".')) return;
    setMatching(true);
    try {
      const res = await fetch('/api/admin/crm/match', { method: 'POST' });
      if (!res.ok) throw new Error('Match failed');

      const data = await res.json();
      alert(`Matching terminé : ${data.matched || 0} prospect(s) associé(s).`);
      await loadProspects();
    } catch (e) {
      console.error('[CRM] Match error:', e);
      alert('Erreur lors du matching.');
    } finally {
      setMatching(false);
    }
  };

  // ─── Modal Helpers ───────────────────────────────────────────────────────

  const openNewModal = () => {
    setEditingProspect(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (prospect: Prospect) => {
    setEditingProspect(prospect);
    setForm({
      first_name: prospect.first_name || '',
      last_name: prospect.last_name || '',
      email: prospect.email || '',
      phone: prospect.phone || '',
      company: prospect.company || '',
      status: prospect.status || 'new',
      source: prospect.source || 'site',
      notes: prospect.notes || '',
      tags: (prospect.tags || []).join(', '),
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProspect(null);
    setForm(emptyForm);
  };

  // ─── Sorting ─────────────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedProspects = useMemo(() => {
    const copy = [...prospects];
    copy.sort((a, b) => {
      let valA: string = '';
      let valB: string = '';

      switch (sortField) {
        case 'name':
          valA = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
          valB = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
          break;
        case 'email':
          valA = (a.email || '').toLowerCase();
          valB = (b.email || '').toLowerCase();
          break;
        case 'company':
          valA = (a.company || '').toLowerCase();
          valB = (b.company || '').toLowerCase();
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'source':
          valA = a.source || '';
          valB = b.source || '';
          break;
        case 'plan':
          valA = a.matched_plan || '';
          valB = b.matched_plan || '';
          break;
        case 'created_at':
          valA = a.created_at;
          valB = b.created_at;
          break;
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return copy;
  }, [prospects, sortField, sortDir]);

  // ─── Sort Column Header ──────────────────────────────────────────────────

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-neutral-800 transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && (
          <svg className={`w-3 h-3 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        )}
      </span>
    </th>
  );

  // ─── Loading Screen ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-500 mb-1">
              <Link href="/mon-compte" className="hover:text-neutral-700 transition-colors">Mon compte</Link>
              <span>/</span>
              <span className="text-purple-600 font-medium">CRM Prospects</span>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">CRM Prospects</h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleMatch}
              disabled={matching}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              {matching ? (
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              )}
              Matcher emails
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              {importing ? (
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              {importing ? 'Import...' : 'Importer'}
            </button>

            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exporter
            </button>

            <Link
              href="/mon-compte"
              className="inline-flex items-center px-3 py-2 text-sm text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Retour
            </Link>
          </div>
        </div>

        {/* ── Import Result Banner ──────────────────────────────────────── */}
        {importResult && (
          <div className="mb-4 flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-green-800">
                {importResult.imported} importé{importResult.imported > 1 ? 's' : ''}, {importResult.skipped} ignoré{importResult.skipped > 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="text-green-600 hover:text-green-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Stats Bar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilterStatus('')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filterStatus === '' ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Tous
            <span className="font-bold">{stats.total}</span>
          </button>
          {STATUSES.map(s => {
            const count = stats.byStatus[s.value] || 0;
            const isActive = filterStatus === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setFilterStatus(isActive ? '' : s.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  isActive ? 'ring-2 ring-offset-1 ring-neutral-400 ' + s.color : s.color + ' hover:opacity-80'
                }`}
              >
                <span>{s.emoji}</span>
                {s.label}
                <span className="font-bold">{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Filters Row ───────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, email, entreprise..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white transition-all"
          >
            <option value="">Tous les statuts</option>
            {STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>
            ))}
          </select>

          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="px-3 py-2.5 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white transition-all"
          >
            <option value="">Toutes les sources</option>
            {SOURCES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <button
            onClick={openNewModal}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-sm whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau prospect
          </button>
        </div>

        {/* ── Prospects Table ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          {loadingProspects ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-neutral-500">Chargement...</span>
            </div>
          ) : sortedProspects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
              <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm font-medium">Aucun prospect trouvé</p>
              <p className="text-xs mt-1">Ajoutez un prospect ou modifiez vos filtres</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    <SortHeader field="name" label="Nom" />
                    <SortHeader field="email" label="Email" />
                    <th className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Tél</th>
                    <SortHeader field="company" label="Entreprise" />
                    <SortHeader field="status" label="Statut" />
                    <SortHeader field="source" label="Source" />
                    <SortHeader field="plan" label="Plan" />
                    <SortHeader field="created_at" label="Date" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {sortedProspects.map(prospect => {
                    const statusInfo = getStatusInfo(prospect.status);
                    const planBadge = getPlanBadge(prospect.matched_plan);
                    const isDeleting = deleting.has(prospect.id);

                    return (
                      <tr
                        key={prospect.id}
                        onClick={() => openEditModal(prospect)}
                        className={`hover:bg-neutral-50 cursor-pointer transition-colors ${isDeleting ? 'opacity-40' : ''}`}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center text-xs font-bold text-purple-700 flex-shrink-0">
                              {(prospect.first_name?.[0] || '').toUpperCase()}{(prospect.last_name?.[0] || '').toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-neutral-900 truncate">
                                {[prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || '—'}
                              </p>
                              {prospect.tags && prospect.tags.length > 0 && (
                                <div className="flex gap-1 mt-0.5">
                                  {prospect.tags.slice(0, 2).map(tag => (
                                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded">
                                      {tag}
                                    </span>
                                  ))}
                                  {prospect.tags.length > 2 && (
                                    <span className="text-[10px] text-neutral-400">+{prospect.tags.length - 2}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-neutral-600 truncate max-w-[200px]">{prospect.email || '—'}</td>
                        <td className="px-3 py-3 text-neutral-600 whitespace-nowrap">{prospect.phone || '—'}</td>
                        <td className="px-3 py-3 text-neutral-600 truncate max-w-[150px]">{prospect.company || '—'}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                            <span>{statusInfo.emoji}</span>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-neutral-600 text-xs">{getSourceLabel(prospect.source)}</td>
                        <td className="px-3 py-3">
                          {planBadge ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${planBadge.classes}`}>
                              {planBadge.label}
                            </span>
                          ) : (
                            <span className="text-neutral-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-neutral-500 text-xs whitespace-nowrap">{formatDate(prospect.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Table footer with count */}
          {sortedProspects.length > 0 && (
            <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                {sortedProspects.length} prospect{sortedProspects.length > 1 ? 's' : ''} affiché{sortedProspects.length > 1 ? 's' : ''}
              </span>
              <button
                onClick={loadProspects}
                className="text-xs text-purple-600 hover:underline transition-colors"
              >
                Actualiser
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── Prospect Modal (Add / Edit) ───────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Modal */}
          <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-neutral-200">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 rounded-t-2xl flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-neutral-900">
                {editingProspect ? 'Modifier prospect' : 'Nouveau prospect'}
              </h2>
              <button
                onClick={closeModal}
                className="text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Matched plan badge */}
              {editingProspect?.matched_plan && (
                <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="text-sm text-purple-700">
                    Plan Keiro : <span className="font-semibold">{editingProspect.matched_plan}</span>
                  </span>
                </div>
              )}

              {/* Row 1: Prénom + Nom */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Prénom</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))}
                    placeholder="Jean"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Nom</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))}
                    placeholder="Dupont"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Row 2: Email + Téléphone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="jean@entreprise.com"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+33 6 12 34 56 78"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Row 3: Entreprise + Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Entreprise</label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="ACME Corp"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Source</label>
                  <select
                    value={form.source}
                    onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white transition-all"
                  >
                    {SOURCES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Statut */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-2">Statut</label>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: s.value }))}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        form.status === s.value
                          ? s.color + ' ring-2 ring-offset-1 ring-neutral-400'
                          : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
                      }`}
                    >
                      <span>{s.emoji}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={4}
                  placeholder="Notes internes sur ce prospect..."
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Tags <span className="text-neutral-400 font-normal">(séparés par des virgules)</span></label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="immobilier, premium, urgent"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                {form.tags && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-neutral-100 px-6 py-4 rounded-b-2xl flex items-center justify-between gap-3">
              <div>
                {editingProspect && (
                  <button
                    onClick={() => deleteProspect(editingProspect.id)}
                    disabled={deleting.has(editingProspect.id)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deleting.has(editingProspect.id) ? (
                      <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                    Supprimer
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={saveProspect}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-sm disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
