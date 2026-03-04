'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

// ─── Constants ───────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { id: 'identifie', label: 'Identifie', color: 'bg-slate-400', textColor: 'text-slate-700', borderColor: 'border-slate-400', hex: '#94A3B8', icon: '🔍' },
  { id: 'contacte', label: 'Contacte', color: 'bg-blue-500', textColor: 'text-blue-700', borderColor: 'border-blue-500', hex: '#3B82F6', icon: '📨' },
  { id: 'repondu', label: 'Repondu', color: 'bg-violet-500', textColor: 'text-violet-700', borderColor: 'border-violet-500', hex: '#8B5CF6', icon: '💬' },
  { id: 'demo', label: 'Demo', color: 'bg-amber-500', textColor: 'text-amber-700', borderColor: 'border-amber-500', hex: '#F59E0B', icon: '🎯' },
  { id: 'sprint', label: 'Sprint', color: 'bg-orange-500', textColor: 'text-orange-700', borderColor: 'border-orange-500', hex: '#F97316', icon: '⚡' },
  { id: 'client', label: 'Client', color: 'bg-emerald-500', textColor: 'text-emerald-700', borderColor: 'border-emerald-500', hex: '#10B981', icon: '✅' },
  { id: 'perdu', label: 'Perdu', color: 'bg-red-500', textColor: 'text-red-700', borderColor: 'border-red-500', hex: '#EF4444', icon: '✗' },
];

const CHANNELS = [
  { id: 'dm_instagram', label: 'DM Instagram', icon: '📷', color: '#E1306C', bg: 'bg-pink-50', border: 'border-pink-300' },
  { id: 'email', label: 'Email', icon: '✉️', color: '#3B82F6', bg: 'bg-blue-50', border: 'border-blue-300' },
  { id: 'telephone', label: 'Telephone', icon: '📞', color: '#10B981', bg: 'bg-emerald-50', border: 'border-emerald-300' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#0A66C2', bg: 'bg-sky-50', border: 'border-sky-300' },
  { id: 'terrain', label: 'Terrain', icon: '🚶', color: '#F59E0B', bg: 'bg-amber-50', border: 'border-amber-300' },
  { id: 'facebook', label: 'Facebook', icon: '👥', color: '#1877F2', bg: 'bg-blue-50', border: 'border-blue-300' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', color: '#000000', bg: 'bg-neutral-50', border: 'border-neutral-300' },
  { id: 'recommandation', label: 'Recommandation', icon: '🤝', color: '#8B5CF6', bg: 'bg-violet-50', border: 'border-violet-300' },
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
  type: string | null;
  quartier: string | null;
  instagram: string | null;
  abonnes: number | null;
  note_google: number | null;
  avis_google: number | null;
  priorite: string;
  score: number;
  freq_posts: string | null;
  qualite_visuelle: string | null;
  date_contact: string | null;
  angle_approche: string | null;
  created_at: string;
  updated_at: string;
};

type ProspectForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  type: string;
  quartier: string;
  instagram: string;
  abonnes: string;
  note_google: string;
  avis_google: string;
  priorite: string;
  score: string;
  status: string;
  source: string;
  freq_posts: string;
  qualite_visuelle: string;
  date_contact: string;
  angle_approche: string;
  notes: string;
  tags: string;
};

const emptyForm: ProspectForm = {
  first_name: '', last_name: '', email: '', phone: '',
  company: '', type: '', quartier: '',
  instagram: '', abonnes: '',
  note_google: '', avis_google: '',
  priorite: 'B', score: '0',
  status: 'identifie', source: '',
  freq_posts: '', qualite_visuelle: '',
  date_contact: '', angle_approche: '',
  notes: '', tags: '',
};

type Activity = {
  id: string;
  prospect_id: string;
  type: string;
  description: string | null;
  resultat: string | null;
  date_activite: string;
  date_rappel: string | null;
  heure_rappel: string | null;
  rappel_fait: boolean;
  created_at: string;
  // Joined from reminder query
  crm_prospects?: { id: string; first_name: string | null; last_name: string | null; company: string | null; instagram: string | null };
};

const ACTIVITY_TYPES = [
  { id: 'appel', label: 'Appel', icon: '📞' },
  { id: 'appel_manque', label: 'Appel manqué', icon: '📵' },
  { id: 'message', label: 'Message', icon: '💬' },
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'dm_instagram', label: 'DM Instagram', icon: '📷' },
  { id: 'rdv', label: 'RDV', icon: '📅' },
  { id: 'visite', label: 'Visite', icon: '🚶' },
  { id: 'relance', label: 'Relance', icon: '🔄' },
  { id: 'note', label: 'Note', icon: '📝' },
  { id: 'autre', label: 'Autre', icon: '•' },
];

const QUICK_RESULTS = [
  { id: 'pas_de_reponse', label: 'Pas de réponse' },
  { id: 'interesse', label: 'Intéressé' },
  { id: 'rappeler', label: 'Rappeler plus tard' },
  { id: 'rdv_pris', label: 'RDV pris' },
  { id: 'demande_infos', label: 'Demande infos' },
  { id: 'pas_interesse', label: 'Pas intéressé' },
  { id: 'mauvais_moment', label: 'Mauvais moment' },
  { id: 'numero_incorrect', label: 'Numéro incorrect' },
];

type ViewType = 'pipeline' | 'canaux' | 'liste' | 'dashboard';
type SortField = 'name' | 'type' | 'quartier' | 'instagram' | 'score' | 'priorite' | 'status' | 'source' | 'date_contact';
type SortDir = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStageInfo(id: string) {
  return PIPELINE_STAGES.find(s => s.id === id) || PIPELINE_STAGES[0];
}

function getChannelInfo(id: string | null) {
  if (!id) return null;
  return CHANNELS.find(c => c.id === id) || null;
}

function formatDate(iso: string | null) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateRelative(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function prospectName(p: Prospect) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.company || '--';
}

function prospectInitials(p: Prospect) {
  const f = (p.first_name?.[0] || '').toUpperCase();
  const l = (p.last_name?.[0] || '').toUpperCase();
  return f + l || '?';
}

function getPriorityBadge(prio: string) {
  switch (prio) {
    case 'A': return { label: '🔥 CHAUD', classes: 'bg-red-100 text-red-700' };
    case 'C': return { label: '❄️ FROID', classes: 'bg-blue-100 text-blue-700' };
    default: return { label: '⭐ TIEDE', classes: 'bg-yellow-100 text-yellow-700' };
  }
}

function getPlanBadge(plan: string | null) {
  if (!plan) return null;
  const lower = plan.toLowerCase();
  if (lower === 'free' || lower === 'gratuit') return { label: plan, classes: 'bg-neutral-100 text-neutral-600' };
  return { label: plan, classes: 'bg-emerald-100 text-emerald-700' };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminCRMPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // View
  const [view, setView] = useState<ViewType>('pipeline');
  const [selected, setSelected] = useState<Prospect | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterPrio, setFilterPrio] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [filterStatus, setFilterStatus] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [form, setForm] = useState<ProspectForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Import/Export
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; errors: string[]; debug?: { headersDetected: string[]; columnMapping: Record<string, string>; unmappedHeaders: string[] } } | null>(null);
  const [matching, setMatching] = useState(false);

  // Sort (list view)
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Activities
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pendingReminders, setPendingReminders] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Rappels filter
  const [filterRappels, setFilterRappels] = useState(false);

  // Suivi filter
  const [filterSuivi, setFilterSuivi] = useState<'none' | 'jour' | 'semaine'>('none');
  const [weeklyReminders, setWeeklyReminders] = useState<Activity[]>([]);

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

  useEffect(() => {
    if (!isAdmin) return;
    loadProspects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Load reminders on mount + refresh every 5min
  useEffect(() => {
    if (!isAdmin) return;
    loadReminders();
    loadWeeklyReminders();
    const interval = setInterval(() => { loadReminders(); loadWeeklyReminders(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Load activities when prospect selected
  useEffect(() => {
    if (selected) {
      loadActivities(selected.id);
    } else {
      setActivities([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // ─── API Calls ─────────────────────────────────────────────────────────

  const loadProspects = async () => {
    setLoadingData(true);
    try {
      const res = await fetch('/api/admin/crm');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setProspects(data.prospects || []);
    } catch (e) {
      console.error('[CRM] Load error:', e);
    } finally {
      setLoadingData(false);
    }
  };

  const saveProspect = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        type: form.type || null,
        quartier: form.quartier || null,
        instagram: form.instagram || null,
        abonnes: form.abonnes ? Number(form.abonnes) : null,
        note_google: form.note_google ? Number(form.note_google) : null,
        avis_google: form.avis_google ? Number(form.avis_google) : null,
        priorite: form.priorite || 'B',
        score: form.score ? Number(form.score) : 0,
        status: form.status || 'identifie',
        source: form.source || null,
        freq_posts: form.freq_posts || null,
        qualite_visuelle: form.qualite_visuelle || null,
        date_contact: form.date_contact || null,
        angle_approche: form.angle_approche || null,
        notes: form.notes || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };

      const url = editingProspect ? `/api/admin/crm/${editingProspect.id}` : '/api/admin/crm';
      const method = editingProspect ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
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
    if (!confirm('Supprimer ce prospect ? Cette action est irreversible.')) return;
    try {
      const res = await fetch(`/api/admin/crm/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      if (selected?.id === id) setSelected(null);
      closeModal();
      await loadProspects();
    } catch (e) {
      console.error('[CRM] Delete error:', e);
      alert('Erreur lors de la suppression.');
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/crm/import', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      setImportResult({ created: data.created || 0, updated: data.updated || 0, skipped: data.skipped || 0, errors: data.errors || [], debug: data.debug });
      await loadProspects();
    } catch (e) {
      console.error('[CRM] Import error:', e);
      alert("Erreur lors de l'import.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/admin/crm/export');
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
      alert("Erreur lors de l'export.");
    }
  };

  const handleMatch = async () => {
    if (!confirm('Matcher les prospects avec les utilisateurs Keiro existants ?')) return;
    setMatching(true);
    try {
      const res = await fetch('/api/admin/crm/match', { method: 'POST' });
      if (!res.ok) throw new Error('Match failed');
      const data = await res.json();
      alert(`Matching termine : ${data.matched || 0} prospect(s) associe(s).`);
      await loadProspects();
    } catch (e) {
      console.error('[CRM] Match error:', e);
      alert('Erreur lors du matching.');
    } finally {
      setMatching(false);
    }
  };

  // ─── Activity API Calls ────────────────────────────────────────────────

  const loadReminders = async () => {
    try {
      const res = await fetch('/api/admin/crm/activities?rappels=true');
      if (!res.ok) return;
      const data = await res.json();
      setPendingReminders(data.reminders || []);
    } catch (e) { console.error('[CRM] Reminders error:', e); }
  };

  const loadWeeklyReminders = async () => {
    try {
      const res = await fetch('/api/admin/crm/activities?rappels=semaine');
      if (!res.ok) return;
      const data = await res.json();
      setWeeklyReminders(data.reminders || []);
    } catch (e) { console.error('[CRM] Weekly reminders error:', e); }
  };

  const loadActivities = async (prospectId: string) => {
    setLoadingActivities(true);
    try {
      const res = await fetch(`/api/admin/crm/activities?prospect_id=${prospectId}`);
      if (!res.ok) return;
      const data = await res.json();
      setActivities(data.activities || []);
    } catch (e) { console.error('[CRM] Activities error:', e); }
    finally { setLoadingActivities(false); }
  };

  const addActivity = async (data: { prospect_id: string; type: string; description?: string; resultat?: string; date_rappel?: string; heure_rappel?: string }) => {
    try {
      const res = await fetch('/api/admin/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed');
      await loadActivities(data.prospect_id);
      await loadReminders();
    } catch (e) {
      console.error('[CRM] Add activity error:', e);
      alert("Erreur lors de l'ajout.");
    }
  };

  const markReminderDone = async (activityId: string, prospectId: string) => {
    try {
      const res = await fetch(`/api/admin/crm/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rappel_fait: true }),
      });
      if (!res.ok) throw new Error('Failed');
      await loadReminders();
      if (selected?.id === prospectId) await loadActivities(prospectId);
    } catch (e) { console.error('[CRM] Mark done error:', e); }
  };

  const exportReminders = async () => {
    // Export today's reminders as a simple list
    if (pendingReminders.length === 0) { alert('Aucun rappel en attente.'); return; }
    const lines = ['Prospect,Type,Heure,Téléphone,Instagram,Description'];
    for (const r of pendingReminders) {
      const p = r.crm_prospects;
      const name = p ? (p.company || [p.first_name, p.last_name].filter(Boolean).join(' ')) : '?';
      const actType = ACTIVITY_TYPES.find(t => t.id === r.type);
      lines.push([name, actType?.label || r.type, r.heure_rappel || '', '', p?.instagram || '', r.description || ''].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rappels-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // ─── Modal Helpers ─────────────────────────────────────────────────────

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
      type: prospect.type || '',
      quartier: prospect.quartier || '',
      instagram: prospect.instagram || '',
      abonnes: prospect.abonnes != null ? String(prospect.abonnes) : '',
      note_google: prospect.note_google != null ? String(prospect.note_google) : '',
      avis_google: prospect.avis_google != null ? String(prospect.avis_google) : '',
      priorite: prospect.priorite || 'B',
      score: String(prospect.score ?? 0),
      status: prospect.status || 'identifie',
      source: prospect.source || '',
      freq_posts: prospect.freq_posts || '',
      qualite_visuelle: prospect.qualite_visuelle || '',
      date_contact: prospect.date_contact || '',
      angle_approche: prospect.angle_approche || '',
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

  // ─── Filtered + Sorted prospects ──────────────────────────────────────

  const prospectIdsWithReminders = useMemo(() =>
    new Set(pendingReminders.map(r => r.prospect_id)),
    [pendingReminders]
  );

  const filtered = useMemo(() => {
    let list = [...prospects];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p =>
        (p.first_name || '').toLowerCase().includes(s) ||
        (p.last_name || '').toLowerCase().includes(s) ||
        (p.company || '').toLowerCase().includes(s) ||
        (p.email || '').toLowerCase().includes(s) ||
        (p.instagram || '').toLowerCase().includes(s) ||
        (p.quartier || '').toLowerCase().includes(s)
      );
    }
    if (filterPrio !== 'all') {
      list = list.filter(p => p.priorite === filterPrio);
    }
    if (filterStatus) {
      list = list.filter(p => p.status === filterStatus);
    }
    if (filterRappels) {
      list = list.filter(p => prospectIdsWithReminders.has(p.id));
    }
    if (filterSuivi === 'jour') {
      const dayIds = new Set(pendingReminders.map(r => r.prospect_id));
      list = list.filter(p => dayIds.has(p.id));
    }
    if (filterSuivi === 'semaine') {
      const weekIds = new Set(weeklyReminders.map(r => r.prospect_id));
      list = list.filter(p => weekIds.has(p.id));
    }
    return list;
  }, [prospects, search, filterPrio, filterStatus, filterRappels, prospectIdsWithReminders, filterSuivi, weeklyReminders, pendingReminders]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let vA = '';
      let vB = '';
      switch (sortField) {
        case 'name':
          vA = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
          vB = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
          break;
        case 'type': vA = (a.type || '').toLowerCase(); vB = (b.type || '').toLowerCase(); break;
        case 'quartier': vA = (a.quartier || '').toLowerCase(); vB = (b.quartier || '').toLowerCase(); break;
        case 'instagram': vA = (a.instagram || '').toLowerCase(); vB = (b.instagram || '').toLowerCase(); break;
        case 'score': return sortDir === 'asc' ? (a.score - b.score) : (b.score - a.score);
        case 'priorite': vA = a.priorite; vB = b.priorite; break;
        case 'status': vA = a.status; vB = b.status; break;
        case 'source': vA = a.source || ''; vB = b.source || ''; break;
        case 'date_contact': vA = a.date_contact || ''; vB = b.date_contact || ''; break;
      }
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // ─── Stats ────────────────────────────────────────────────────────────

  const stageStats = useMemo(() => {
    const counts: Record<string, number> = {};
    PIPELINE_STAGES.forEach(s => { counts[s.id] = 0; });
    prospects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [prospects]);

  const channelStats = useMemo(() => {
    const stats: Record<string, { total: number; clients: number }> = {};
    CHANNELS.forEach(c => { stats[c.id] = { total: 0, clients: 0 }; });
    prospects.forEach(p => {
      if (p.source && stats[p.source]) {
        stats[p.source].total += 1;
        if (p.status === 'client') stats[p.source].clients += 1;
      }
    });
    return stats;
  }, [prospects]);

  // ─── Loading ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Sub-components ───────────────────────────────────────────────────

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-3 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-neutral-900 transition-colors select-none"
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

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 text-neutral-900">
      {/* ── Header Bar ─────────────────────────────────────────────────── */}
      <header className="border-b border-neutral-200 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              KeiroAI CRM
            </h1>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('pipeline')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'pipeline' ? 'bg-purple-600 text-white shadow' : 'text-neutral-500 hover:text-neutral-900'}`}
              >
                🔀 Pipeline
              </button>
              <button
                onClick={() => setView('canaux')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'canaux' ? 'bg-purple-600 text-white shadow' : 'text-neutral-500 hover:text-neutral-900'}`}
              >
                📡 Canaux
              </button>
              <button
                onClick={() => setView('liste')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'liste' ? 'bg-purple-600 text-white shadow' : 'text-neutral-500 hover:text-neutral-900'}`}
              >
                📋 Liste
              </button>
              <button
                onClick={() => setView('dashboard')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'dashboard' ? 'bg-purple-600 text-white shadow' : 'text-neutral-500 hover:text-neutral-900'}`}
              >
                📊 Dashboard
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleMatch}
              disabled={matching}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 border border-neutral-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {matching ? '...' : '🔀 Matcher'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 border border-neutral-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {importing ? '...' : '📥 Importer'}
            </button>

            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 border border-neutral-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              📤 Exporter
            </button>

            <button
              onClick={openNewModal}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow"
            >
              + Nouveau
            </button>
          </div>
        </div>
      </header>

      {/* ── Import Result Banner ───────────────────────────────────────── */}
      {importResult && (
        <div className="max-w-[1600px] mx-auto px-4 pt-3 space-y-2">
          <div className={`rounded-lg px-4 py-2.5 border ${(importResult.created > 0 || importResult.updated > 0) ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${(importResult.created > 0 || importResult.updated > 0) ? 'text-emerald-700' : 'text-amber-700'}`}>
                {(importResult.created > 0 || importResult.updated > 0) ? '✅' : '⚠️'}{' '}
                {importResult.created > 0 && <>{importResult.created} créé{importResult.created > 1 ? 's' : ''}</>}
                {importResult.created > 0 && importResult.updated > 0 && ', '}
                {importResult.updated > 0 && <>{importResult.updated} mis à jour</>}
                {(importResult.created > 0 || importResult.updated > 0) && importResult.skipped > 0 && ', '}
                {importResult.skipped > 0 && <>{importResult.skipped} ignoré{importResult.skipped > 1 ? 's' : ''}</>}
                {importResult.created === 0 && importResult.updated === 0 && importResult.skipped === 0 && 'Aucun changement'}
                {importResult.errors.length > 0 && `, ${importResult.errors.length} erreur${importResult.errors.length > 1 ? 's' : ''}`}
              </span>
              <button onClick={() => setImportResult(null)} className="text-neutral-400 hover:text-neutral-700 transition-colors text-lg leading-none">&times;</button>
            </div>
            {importResult.debug && (
              <div className="mt-2 text-xs text-neutral-500 space-y-1">
                <p><span className="font-medium">Colonnes détectées :</span> {Object.entries(importResult.debug.columnMapping).map(([h, f]) => `${h} → ${f}`).join(', ') || 'aucune'}</p>
                {importResult.debug.unmappedHeaders.length > 0 && (
                  <p><span className="font-medium">Non reconnues :</span> {importResult.debug.unmappedHeaders.join(', ')}</p>
                )}
              </div>
            )}
            {importResult.errors.length > 0 && (
              <div className="mt-2 text-xs text-red-600 max-h-24 overflow-y-auto">
                {importResult.errors.slice(0, 10).map((e, i) => <p key={i}>{e}</p>)}
                {importResult.errors.length > 10 && <p>... et {importResult.errors.length - 10} autres erreurs</p>}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto px-4 py-4">
        {/* ── Reminders Banner ──────────────────────────────────────── */}
        {pendingReminders.length > 0 && (
          <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-orange-800">🔔 {pendingReminders.length} rappel{pendingReminders.length > 1 ? 's' : ''} en attente</span>
              <button onClick={exportReminders} className="text-xs text-orange-600 hover:text-orange-800 transition-colors">📤 Exporter CSV</button>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {pendingReminders.map(r => {
                const p = r.crm_prospects;
                const name = p ? (p.company || [p.first_name, p.last_name].filter(Boolean).join(' ')) : '?';
                const actType = ACTIVITY_TYPES.find(t => t.id === r.type);
                const isOverdue = r.date_rappel && new Date(r.date_rappel) < new Date(new Date().toDateString());
                return (
                  <div key={r.id} className={`flex items-center gap-2 text-xs ${isOverdue ? 'text-red-700' : 'text-orange-700'}`}>
                    <span>{actType?.icon || '🔔'}</span>
                    <button onClick={() => { const prospect = prospects.find(pp => pp.id === r.prospect_id); if (prospect) setSelected(prospect); }} className="font-semibold hover:underline truncate max-w-[200px]">{name}</button>
                    <span className="text-neutral-400">—</span>
                    <span className="truncate flex-1">{r.description || actType?.label || 'Rappel'}</span>
                    {r.heure_rappel && <span className="text-neutral-500 whitespace-nowrap">{r.heure_rappel}</span>}
                    {isOverdue && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-medium whitespace-nowrap">En retard</span>}
                    <button onClick={() => markReminderDone(r.id, r.prospect_id)} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-medium hover:bg-emerald-200 transition-colors whitespace-nowrap">✓ Fait</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── KPI Bar ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {PIPELINE_STAGES.filter(s => s.id !== 'perdu').map(stage => (
            <div
              key={stage.id}
              className={`bg-white rounded-xl border-t-2 ${stage.borderColor} p-3 cursor-pointer hover:bg-gray-100 transition-colors shadow-sm`}
              onClick={() => { setFilterStatus(filterStatus === stage.id ? '' : stage.id); }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-500">{stage.icon} {stage.label}</span>
                {filterStatus === stage.id && <span className="w-2 h-2 rounded-full bg-purple-500" />}
              </div>
              <p className="text-2xl font-bold text-neutral-900">{stageStats[stage.id] || 0}</p>
            </div>
          ))}
        </div>

        {/* ── Filter Row ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 bg-white rounded-lg p-1">
            {([
              { key: 'all' as const, label: 'Tous' },
              { key: 'A' as const, label: '🔥 Chaud' },
              { key: 'B' as const, label: '⭐ Tiede' },
              { key: 'C' as const, label: '❄️ Froid' },
            ]).map(p => (
              <button
                key={p.key}
                onClick={() => setFilterPrio(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterPrio === p.key ? 'bg-gray-200 text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
              >
                {p.label}
              </button>
            ))}
            <div className="h-4 w-px bg-neutral-300 mx-1" />
            <button
              onClick={() => { setFilterRappels(!filterRappels); setFilterSuivi('none'); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterRappels ? 'bg-orange-500 text-white' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              🔔 Rappels
            </button>
            <button
              onClick={() => { setFilterSuivi(filterSuivi === 'jour' ? 'none' : 'jour'); setFilterRappels(false); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterSuivi === 'jour' ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              📋 Suivi jour
            </button>
            <button
              onClick={() => { setFilterSuivi(filterSuivi === 'semaine' ? 'none' : 'semaine'); setFilterRappels(false); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${filterSuivi === 'semaine' ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              📅 Suivi semaine
            </button>
          </div>

          <div className="relative flex-1 w-full sm:w-auto">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher nom, entreprise, instagram..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder-neutral-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 transition-colors text-lg leading-none">&times;</button>
            )}
          </div>

          <span className="text-xs text-neutral-400">{filtered.length} prospect{filtered.length > 1 ? 's' : ''}</span>
        </div>

        {/* ── Main Content Area ───────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: View content */}
          <div className={`flex-1 min-w-0 ${selected ? 'lg:w-[calc(100%-416px)]' : 'w-full'}`}>
            {loadingData ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-sm text-neutral-500">Chargement...</span>
              </div>
            ) : view === 'pipeline' ? (
              /* ── Pipeline Kanban ──────────────────────────────────────── */
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-3" >
                  {PIPELINE_STAGES.map(stage => {
                    const stageProspects = filtered.filter(p => p.status === stage.id);
                    return (
                      <div key={stage.id} className="flex-shrink-0 w-64">
                        <div className={`rounded-t-lg px-3 py-2 ${stage.color}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-white">{stage.icon} {stage.label}</span>
                            <span className="text-xs font-bold text-white/80 bg-white/20 px-2 py-0.5 rounded-full">{stageProspects.length}</span>
                          </div>
                        </div>
                        <div className="bg-white rounded-b-lg border border-neutral-200 border-t-0 min-h-[200px] max-h-[calc(100vh-350px)] overflow-y-auto p-2 space-y-2">
                          {stageProspects.length === 0 ? (
                            <p className="text-xs text-neutral-400 text-center py-8">Aucun prospect</p>
                          ) : stageProspects.map(p => {
                            const prioBadge = getPriorityBadge(p.priorite);
                            const channel = getChannelInfo(p.source);
                            const isSelected = selected?.id === p.id;
                            return (
                              <div
                                key={p.id}
                                onClick={() => setSelected(isSelected ? null : p)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'border-purple-500 bg-purple-50' : 'border-neutral-200 bg-gray-50 hover:border-neutral-300'}`}
                              >
                                <p className="text-sm font-semibold text-neutral-900 truncate">{prospectName(p)}</p>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {p.type && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-neutral-600 rounded">{p.type}</span>}
                                  {p.quartier && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-neutral-600 rounded">{p.quartier}</span>}
                                </div>
                                {p.instagram && (
                                  <p className="text-xs text-purple-600 mt-1 truncate">@{p.instagram.replace('@', '')}</p>
                                )}
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${prioBadge.classes}`}>{prioBadge.label}</span>
                                  {p.matched_plan && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getPlanBadge(p.matched_plan)?.classes}`}>{p.matched_plan}</span>
                                  )}
                                  {channel && (
                                    <span className="text-[10px] text-neutral-400">{channel.icon}</span>
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
              </div>
            ) : view === 'canaux' ? (
              /* ── Channels View ──────────────────────────────────────── */
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  {CHANNELS.map(ch => {
                    const s = channelStats[ch.id] || { total: 0, clients: 0 };
                    const rate = s.total > 0 ? Math.round((s.clients / s.total) * 100) : 0;
                    return (
                      <div key={ch.id} className={`rounded-xl border ${ch.border} ${ch.bg} p-4`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{ch.icon}</span>
                          <span className="text-sm font-semibold text-neutral-800">{ch.label}</span>
                        </div>
                        <div className="flex items-baseline gap-3 mb-2">
                          <div>
                            <p className="text-2xl font-bold text-neutral-900">{s.total}</p>
                            <p className="text-[10px] text-neutral-400 uppercase">Prospects</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-emerald-600">{s.clients}</p>
                            <p className="text-[10px] text-neutral-400 uppercase">Clients</p>
                          </div>
                          <div className="ml-auto">
                            <p className="text-lg font-bold text-neutral-700">{rate}%</p>
                            <p className="text-[10px] text-neutral-400 uppercase">Conv.</p>
                          </div>
                        </div>
                        <ProgressBar value={rate} />
                      </div>
                    );
                  })}
                </div>

                {/* Prospects list below channels */}
                <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-neutral-200">
                    <h3 className="text-sm font-semibold text-neutral-900">Tous les prospects par canal</h3>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-8">Aucun prospect</p>
                  ) : (
                    <div className="divide-y divide-neutral-200">
                      {filtered.map(p => {
                        const channel = getChannelInfo(p.source);
                        const stg = getStageInfo(p.status);
                        const isSelected = selected?.id === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelected(isSelected ? null : p)}
                            className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-700 to-blue-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                              {prospectInitials(p)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-neutral-900 truncate">{prospectName(p)}</p>
                              <p className="text-xs text-neutral-400 truncate">{p.company || p.instagram || '--'}</p>
                            </div>
                            {channel && <span className="text-sm flex-shrink-0" title={channel.label}>{channel.icon}</span>}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${stg.color} text-white flex-shrink-0`}>{stg.label}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${getPriorityBadge(p.priorite).classes}`}>{getPriorityBadge(p.priorite).label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : view === 'dashboard' ? (
              /* ── Dashboard View ──────────────────────────────────────── */
              <div className="space-y-6">
                {/* KPI Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                    <p className="text-xs text-neutral-500 mb-1">Total prospects</p>
                    <p className="text-3xl font-bold text-neutral-900">{prospects.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                    <p className="text-xs text-neutral-500 mb-1">🔥 Chauds (A)</p>
                    <p className="text-3xl font-bold text-red-600">{prospects.filter(p => p.priorite === 'A').length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                    <p className="text-xs text-neutral-500 mb-1">✅ Clients</p>
                    <p className="text-3xl font-bold text-emerald-600">{prospects.filter(p => p.status === 'client').length}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Taux: {prospects.length > 0 ? Math.round((prospects.filter(p => p.status === 'client').length / prospects.length) * 100) : 0}%
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                    <p className="text-xs text-neutral-500 mb-1">🔔 Rappels en attente</p>
                    <p className="text-3xl font-bold text-orange-600">{pendingReminders.length}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{weeklyReminders.length} cette semaine</p>
                  </div>
                </div>

                {/* Pipeline Funnel */}
                <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-neutral-900 mb-4">Pipeline</h3>
                  <div className="space-y-2.5">
                    {PIPELINE_STAGES.map(stage => {
                      const count = stageStats[stage.id] || 0;
                      const maxCount = Math.max(...Object.values(stageStats), 1);
                      const pct = Math.round((count / maxCount) * 100);
                      return (
                        <div key={stage.id} className="flex items-center gap-3">
                          <span className="text-xs w-20 text-neutral-600 flex-shrink-0">{stage.icon} {stage.label}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                            <div
                              className={`h-6 rounded-full ${stage.color} flex items-center justify-end px-2 transition-all`}
                              ref={(el) => { if (el) el.style.width = `${Math.max(pct, 4)}%`; }}
                            >
                              <span className="text-[10px] font-bold text-white">{count}</span>
                            </div>
                          </div>
                          <span className="text-xs text-neutral-400 w-10 text-right">{prospects.length > 0 ? Math.round((count / prospects.length) * 100) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Priority Distribution */}
                  <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-neutral-900 mb-4">Répartition par priorité</h3>
                    <div className="space-y-3">
                      {[
                        { key: 'A', label: '🔥 Chaud', color: 'bg-red-500', bgLight: 'bg-red-50 text-red-700' },
                        { key: 'B', label: '⭐ Tiède', color: 'bg-yellow-500', bgLight: 'bg-yellow-50 text-yellow-700' },
                        { key: 'C', label: '❄️ Froid', color: 'bg-blue-500', bgLight: 'bg-blue-50 text-blue-700' },
                      ].map(p => {
                        const count = prospects.filter(pr => pr.priorite === p.key).length;
                        const pct = prospects.length > 0 ? Math.round((count / prospects.length) * 100) : 0;
                        return (
                          <div key={p.key} className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.bgLight} w-24 text-center`}>{p.label}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                              <div
                                className={`h-4 rounded-full ${p.color} transition-all`}
                                ref={(el) => { if (el) el.style.width = `${pct}%`; }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-neutral-700 w-8 text-right">{count}</span>
                            <span className="text-xs text-neutral-400 w-10 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Channel Performance */}
                  <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-neutral-900 mb-4">Performance par canal</h3>
                    <div className="space-y-2.5">
                      {CHANNELS.filter(ch => (channelStats[ch.id]?.total || 0) > 0).sort((a, b) => (channelStats[b.id]?.total || 0) - (channelStats[a.id]?.total || 0)).map(ch => {
                        const s = channelStats[ch.id] || { total: 0, clients: 0 };
                        const rate = s.total > 0 ? Math.round((s.clients / s.total) * 100) : 0;
                        return (
                          <div key={ch.id} className="flex items-center gap-2">
                            <span className="text-sm w-6 text-center flex-shrink-0">{ch.icon}</span>
                            <span className="text-xs text-neutral-600 w-28 flex-shrink-0 truncate">{ch.label}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                              <div
                                className="h-4 rounded-full bg-purple-500 transition-all"
                                ref={(el) => { if (el) el.style.width = `${Math.max(Math.round((s.total / Math.max(...Object.values(channelStats).map(x => x.total), 1)) * 100), 4)}%`; }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-neutral-700 w-8 text-right">{s.total}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${rate > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-neutral-400'} w-12 text-center flex-shrink-0`}>{rate}% conv</span>
                          </div>
                        );
                      })}
                      {CHANNELS.every(ch => (channelStats[ch.id]?.total || 0) === 0) && (
                        <p className="text-xs text-neutral-400 text-center py-4">Aucune donnée de canal</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Suivi du jour - Today's action list */}
                <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-neutral-900">📋 Suivi du jour</h3>
                    <button onClick={exportReminders} className="text-xs text-purple-600 hover:text-purple-700 transition-colors">📤 Exporter CSV</button>
                  </div>
                  {pendingReminders.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-4">Aucun rappel pour aujourd&apos;hui</p>
                  ) : (
                    <div className="space-y-2">
                      {pendingReminders.map(r => {
                        const p = r.crm_prospects;
                        const name = p ? (p.company || [p.first_name, p.last_name].filter(Boolean).join(' ')) : '?';
                        const actType = ACTIVITY_TYPES.find(t => t.id === r.type);
                        const isOverdue = r.date_rappel && new Date(r.date_rappel) < new Date(new Date().toDateString());
                        return (
                          <div key={r.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isOverdue ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
                            <span className="text-sm">{actType?.icon || '🔔'}</span>
                            <button onClick={() => { const prospect = prospects.find(pp => pp.id === r.prospect_id); if (prospect) { setSelected(prospect); setView('liste'); } }} className="text-xs font-semibold text-neutral-900 hover:underline truncate max-w-[200px]">{name}</button>
                            <span className="text-xs text-neutral-500 flex-1 truncate">{r.description || actType?.label || 'Rappel'}</span>
                            {r.heure_rappel && <span className="text-xs text-neutral-500 whitespace-nowrap">{r.heure_rappel}</span>}
                            {isOverdue && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-medium">En retard</span>}
                            <button onClick={() => markReminderDone(r.id, r.prospect_id)} className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200 transition-colors whitespace-nowrap">✓ Fait</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Suivi de la semaine */}
                {weeklyReminders.filter(r => !pendingReminders.some(pr => pr.id === r.id)).length > 0 && (
                  <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-neutral-900 mb-4">📅 Reste de la semaine</h3>
                    <div className="space-y-2">
                      {weeklyReminders.filter(r => !pendingReminders.some(pr => pr.id === r.id)).map(r => {
                        const p = r.crm_prospects;
                        const name = p ? (p.company || [p.first_name, p.last_name].filter(Boolean).join(' ')) : '?';
                        const actType = ACTIVITY_TYPES.find(t => t.id === r.type);
                        return (
                          <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
                            <span className="text-sm">{actType?.icon || '🔔'}</span>
                            <button onClick={() => { const prospect = prospects.find(pp => pp.id === r.prospect_id); if (prospect) { setSelected(prospect); setView('liste'); } }} className="text-xs font-semibold text-neutral-900 hover:underline truncate max-w-[200px]">{name}</button>
                            <span className="text-xs text-neutral-500 flex-1 truncate">{r.description || actType?.label}</span>
                            <span className="text-xs text-indigo-600 whitespace-nowrap">{formatDate(r.date_rappel)}</span>
                            {r.heure_rappel && <span className="text-xs text-neutral-500">{r.heure_rappel}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top Prospects to Contact */}
                <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-neutral-900 mb-4">🎯 Prospects prioritaires à contacter</h3>
                  <div className="space-y-2">
                    {prospects
                      .filter(p => p.priorite === 'A' && ['identifie', 'contacte', 'repondu', 'demo'].includes(p.status))
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 10)
                      .map(p => {
                        const stg = getStageInfo(p.status);
                        return (
                          <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => { setSelected(p); setView('liste'); }}>
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                              {prospectInitials(p)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-neutral-900 truncate">{prospectName(p)}</p>
                              <p className="text-[10px] text-neutral-400 truncate">{p.company || p.instagram || p.type || ''}</p>
                            </div>
                            <span className="text-xs font-bold text-neutral-900">{p.score} pts</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${stg.color} text-white`}>{stg.label}</span>
                          </div>
                        );
                      })}
                    {prospects.filter(p => p.priorite === 'A' && ['identifie', 'contacte', 'repondu', 'demo'].includes(p.status)).length === 0 && (
                      <p className="text-xs text-neutral-400 text-center py-4">Aucun prospect chaud en attente</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* ── List View ──────────────────────────────────────────── */
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
                    <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-sm font-medium">Aucun prospect trouve</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-neutral-300">
                        <tr>
                          <SortHeader field="name" label="Nom" />
                          <SortHeader field="type" label="Type" />
                          <SortHeader field="quartier" label="Quartier" />
                          <SortHeader field="instagram" label="Instagram" />
                          <SortHeader field="score" label="Score" />
                          <SortHeader field="priorite" label="Priorite" />
                          <SortHeader field="status" label="Statut" />
                          <SortHeader field="source" label="Canal" />
                          <SortHeader field="date_contact" label="Date Contact" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {sorted.map((p, idx) => {
                          const stg = getStageInfo(p.status);
                          const prioBadge = getPriorityBadge(p.priorite);
                          const channel = getChannelInfo(p.source);
                          const isSelected = selected?.id === p.id;
                          return (
                            <tr
                              key={p.id}
                              onClick={() => setSelected(isSelected ? null : p)}
                              className={`cursor-pointer transition-colors ${isSelected ? 'bg-purple-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100`}
                            >
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-700 to-blue-700 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                                    {prospectInitials(p)}
                                  </div>
                                  <span className="font-medium text-neutral-900 truncate max-w-[140px]">{prospectName(p)}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-neutral-500 text-xs">{p.type || '--'}</td>
                              <td className="px-3 py-3 text-neutral-500 text-xs">{p.quartier || '--'}</td>
                              <td className="px-3 py-3 text-purple-600 text-xs truncate max-w-[120px]">{p.instagram ? `@${p.instagram.replace('@', '')}` : '--'}</td>
                              <td className="px-3 py-3">
                                <span className="text-sm font-bold text-neutral-900">{p.score}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${prioBadge.classes}`}>{prioBadge.label}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${stg.color} text-white`}>{stg.icon} {stg.label}</span>
                              </td>
                              <td className="px-3 py-3 text-xs text-neutral-500">{channel ? `${channel.icon} ${channel.label}` : '--'}</td>
                              <td className="px-3 py-3 text-xs text-neutral-400 whitespace-nowrap">{formatDate(p.date_contact)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {filtered.length > 0 && (
                  <div className="px-4 py-2.5 bg-gray-100 border-t border-neutral-300 flex items-center justify-between">
                    <span className="text-xs text-neutral-400">{filtered.length} prospect{filtered.length > 1 ? 's' : ''}</span>
                    <button onClick={loadProspects} className="text-xs text-purple-600 hover:text-purple-700 transition-colors">Actualiser</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Detail Panel */}
          {selected && (
            <DetailPanel
              prospect={selected}
              onClose={() => setSelected(null)}
              onEdit={() => openEditModal(selected)}
              onDelete={() => deleteProspect(selected.id)}
              activities={activities}
              loadingActivities={loadingActivities}
              onAddActivity={addActivity}
              onMarkReminder={markReminderDone}
            />
          )}
        </div>
      </main>

      {/* ── Add/Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-neutral-200">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 rounded-t-2xl flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-neutral-900">
                {editingProspect ? 'Modifier prospect' : 'Nouveau prospect'}
              </h2>
              <button onClick={closeModal} className="text-neutral-500 hover:text-neutral-900 transition-colors text-xl leading-none">&times;</button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {editingProspect?.matched_plan && (
                <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <span className="text-sm text-purple-700">Plan Keiro : <span className="font-semibold">{editingProspect.matched_plan}</span></span>
                </div>
              )}

              {/* Prenom + Nom */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalField label="Prenom" value={form.first_name} onChange={v => setForm(f => ({ ...f, first_name: v }))} placeholder="Jean" />
                <ModalField label="Nom" value={form.last_name} onChange={v => setForm(f => ({ ...f, last_name: v }))} placeholder="Dupont" />
              </div>

              {/* Email + Telephone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalField label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="jean@entreprise.com" />
                <ModalField label="Telephone" type="tel" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+33 6 12 34 56 78" />
              </div>

              {/* Entreprise + Type + Quartier */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ModalField label="Entreprise" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="ACME Corp" />
                <ModalField label="Type" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} placeholder="Restaurant, Salon..." />
                <ModalField label="Quartier" value={form.quartier} onChange={v => setForm(f => ({ ...f, quartier: v }))} placeholder="Marais, Bastille..." />
              </div>

              {/* Instagram + Abonnes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalField label="Instagram" value={form.instagram} onChange={v => setForm(f => ({ ...f, instagram: v }))} placeholder="@moncompte" />
                <ModalField label="Abonnes" type="number" value={form.abonnes} onChange={v => setForm(f => ({ ...f, abonnes: v }))} placeholder="1500" />
              </div>

              {/* Note Google + Avis Google */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalField label="Note Google" type="number" value={form.note_google} onChange={v => setForm(f => ({ ...f, note_google: v }))} placeholder="4.5" />
                <ModalField label="Avis Google" type="number" value={form.avis_google} onChange={v => setForm(f => ({ ...f, avis_google: v }))} placeholder="120" />
              </div>

              {/* Priorite pills */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-2">Priorite</label>
                <div className="flex gap-2">
                  {(['A', 'B', 'C'] as const).map(p => {
                    const badge = getPriorityBadge(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, priorite: p }))}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${form.priorite === p ? badge.classes + ' ring-2 ring-offset-1 ring-offset-white ring-purple-500' : 'bg-gray-100 text-neutral-400 hover:text-neutral-600'}`}
                      >
                        {badge.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Score */}
              <ModalField label="Score" type="number" value={form.score} onChange={v => setForm(f => ({ ...f, score: v }))} placeholder="0" />

              {/* Statut pills */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-2">Statut</label>
                <div className="flex flex-wrap gap-2">
                  {PIPELINE_STAGES.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: s.id }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${form.status === s.id ? s.color + ' text-white ring-2 ring-offset-1 ring-offset-white ring-purple-500' : 'bg-gray-100 text-neutral-400 hover:text-neutral-600'}`}
                    >
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Canal pills */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-2">Canal</label>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, source: f.source === c.id ? '' : c.id }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${form.source === c.id ? 'bg-purple-600 text-white ring-2 ring-offset-1 ring-offset-white ring-purple-500' : 'bg-gray-100 text-neutral-400 hover:text-neutral-600'}`}
                    >
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Freq posts + Qualite */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalField label="Frequence posts" value={form.freq_posts} onChange={v => setForm(f => ({ ...f, freq_posts: v }))} placeholder="3/semaine" />
                <ModalField label="Qualite visuelle" value={form.qualite_visuelle} onChange={v => setForm(f => ({ ...f, qualite_visuelle: v }))} placeholder="Bonne, Moyenne..." />
              </div>

              {/* Date contact + Angle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalField label="Date contact" type="date" value={form.date_contact} onChange={v => setForm(f => ({ ...f, date_contact: v }))} />
                <ModalField label="Angle d'approche" value={form.angle_approche} onChange={v => setForm(f => ({ ...f, angle_approche: v }))} placeholder="Sprint gratuit, demo..." />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Notes internes..."
                  className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder-neutral-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Tags <span className="text-neutral-400 font-normal">(separes par des virgules)</span></label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="immobilier, premium, urgent"
                  className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder-neutral-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                {form.tags && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4 rounded-b-2xl flex items-center justify-between gap-3">
              <div>
                {editingProspect && (
                  <button
                    onClick={() => deleteProspect(editingProspect.id)}
                    className="px-3 py-2 text-sm font-medium text-red-500 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Supprimer
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-neutral-500 border border-neutral-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={saveProspect}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow disabled:opacity-50"
                >
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

// ─── Progress Bar Component ────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  const clampedWidth = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-1.5 rounded-full bg-emerald-500 transition-all"
        role="progressbar"
        aria-valuenow={clampedWidth}
        aria-valuemin={0}
        aria-valuemax={100}
        ref={(el) => { if (el) el.style.width = `${clampedWidth}%`; }}
      />
    </div>
  );
}

// ─── Modal Field Component ─────────────────────────────────────────────────

function ModalField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder-neutral-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
      />
    </div>
  );
}

// ─── Detail Panel Component ────────────────────────────────────────────────

function DetailPanel({ prospect, onClose, onEdit, onDelete, activities, loadingActivities, onAddActivity, onMarkReminder }: {
  prospect: Prospect; onClose: () => void; onEdit: () => void; onDelete: () => void;
  activities: Activity[]; loadingActivities: boolean;
  onAddActivity: (data: { prospect_id: string; type: string; description?: string; resultat?: string; date_rappel?: string; heure_rappel?: string }) => void;
  onMarkReminder: (activityId: string, prospectId: string) => void;
}) {
  const prioBadge = getPriorityBadge(prospect.priorite);
  const currentStageIdx = PIPELINE_STAGES.findIndex(s => s.id === prospect.status);

  return (
    <div className="w-full lg:w-[400px] flex-shrink-0 bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden self-start lg:sticky lg:top-20">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
              {prospectInitials(prospect)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">{prospectName(prospect)}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                {prospect.type && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-neutral-500 rounded">{prospect.type}</span>}
                {prospect.quartier && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-neutral-500 rounded">{prospect.quartier}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 transition-colors text-lg leading-none">&times;</button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xl font-bold text-neutral-900">{prospect.score}</span>
          <span className="text-xs text-neutral-400">pts</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ml-auto ${prioBadge.classes}`}>{prioBadge.label}</span>
          {prospect.matched_plan && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getPlanBadge(prospect.matched_plan)?.classes}`}>{prospect.matched_plan}</span>
          )}
        </div>
      </div>

      {/* Pipeline visual */}
      <div className="px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-1">
          {PIPELINE_STAGES.filter(s => s.id !== 'perdu').map((s, idx) => {
            const isActive = idx <= currentStageIdx && prospect.status !== 'perdu';
            const isCurrent = s.id === prospect.status;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 transition-all ${isCurrent ? s.color + ' text-white ring-2 ring-offset-1 ring-offset-white ring-neutral-300' : isActive ? s.color + ' text-white' : 'bg-gray-100 text-neutral-400'}`}>
                  {s.icon}
                </div>
                {idx < 5 && (
                  <div className={`flex-1 h-0.5 ${isActive && idx < currentStageIdx ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
        {prospect.status === 'perdu' && (
          <div className="mt-2 text-center">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500 text-white font-medium">✗ Perdu</span>
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="px-4 py-3 border-b border-neutral-200 space-y-2.5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {/* Left column */}
          <div className="space-y-2">
            {prospect.instagram && (
              <div>
                <p className="text-[10px] text-neutral-400 uppercase">Instagram</p>
                <p className="text-xs text-purple-600">@{prospect.instagram.replace('@', '')}</p>
                {prospect.abonnes != null && <p className="text-[10px] text-neutral-400">{prospect.abonnes.toLocaleString('fr-FR')} abonnes</p>}
              </div>
            )}
            {prospect.phone && (
              <div>
                <p className="text-[10px] text-neutral-400 uppercase">Telephone</p>
                <p className="text-xs text-neutral-900">{prospect.phone}</p>
              </div>
            )}
            {prospect.email && (
              <div>
                <p className="text-[10px] text-neutral-400 uppercase">Email</p>
                <p className="text-xs text-neutral-900 truncate">{prospect.email}</p>
              </div>
            )}
            {prospect.note_google != null && (
              <div>
                <p className="text-[10px] text-neutral-400 uppercase">Google</p>
                <p className="text-xs text-neutral-900">{prospect.note_google}/5 ({prospect.avis_google || 0} avis)</p>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-2">
            {prospect.freq_posts && (
              <div>
                <p className="text-[10px] text-neutral-400 uppercase">Freq. posts</p>
                <p className="text-xs text-neutral-900">{prospect.freq_posts}</p>
              </div>
            )}
            {prospect.qualite_visuelle && (
              <div>
                <p className="text-[10px] text-neutral-400 uppercase">Qualite visuelle</p>
                <p className="text-xs text-neutral-900">{prospect.qualite_visuelle}</p>
              </div>
            )}
            {prospect.date_contact && (
              <div>
                <p className="text-[10px] text-neutral-400 uppercase">Date contact</p>
                <p className="text-xs text-neutral-900">{formatDate(prospect.date_contact)}</p>
              </div>
            )}
            {prospect.angle_approche && (
              <div>
                <p className="text-[10px] text-neutral-400 uppercase">Angle</p>
                <p className="text-xs text-neutral-900">{prospect.angle_approche}</p>
              </div>
            )}
          </div>
        </div>

        {/* Active channel */}
        <div>
          <p className="text-[10px] text-neutral-400 uppercase mb-1.5">Canal</p>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map(c => {
              const isActive = prospect.source === c.id;
              return (
                <span
                  key={c.id}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-all ${isActive ? 'bg-purple-600 text-white font-semibold' : 'bg-gray-100 text-neutral-400'}`}
                >
                  {c.icon} {c.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notes */}
      {prospect.notes && (
        <div className="px-4 py-3 border-b border-neutral-200">
          <p className="text-[10px] text-neutral-400 uppercase mb-1">Notes</p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
            <p className="text-xs text-yellow-800 whitespace-pre-wrap">{prospect.notes}</p>
          </div>
        </div>
      )}

      {/* Tags */}
      {prospect.tags && prospect.tags.length > 0 && (
        <div className="px-4 py-3 border-b border-neutral-200">
          <div className="flex flex-wrap gap-1">
            {prospect.tags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Activity History */}
      <div className="px-4 py-3 border-b border-neutral-200">
        <p className="text-[10px] text-neutral-500 uppercase mb-2">Historique</p>
        {loadingActivities ? (
          <p className="text-xs text-neutral-400 py-2">Chargement...</p>
        ) : activities.length === 0 ? (
          <p className="text-xs text-neutral-400 py-2">Aucune activité</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {activities.slice(0, 10).map(a => {
              const actType = ACTIVITY_TYPES.find(t => t.id === a.type);
              const resultLabel = QUICK_RESULTS.find(r => r.id === a.resultat)?.label || a.resultat;
              return (
                <div key={a.id} className="flex gap-2 text-xs">
                  <span className="flex-shrink-0 mt-0.5">{actType?.icon || '•'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-500">{formatDateRelative(a.date_activite)}</span>
                      <span className="font-medium text-neutral-700">{actType?.label || a.type}</span>
                    </div>
                    {(a.description || resultLabel) && (
                      <p className="text-neutral-500 mt-0.5 truncate">{[resultLabel, a.description].filter(Boolean).join(' — ')}</p>
                    )}
                    {a.date_rappel && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[10px] ${a.rappel_fait ? 'text-emerald-600' : 'text-orange-600'}`}>
                          🔔 {formatDate(a.date_rappel)}{a.heure_rappel ? ` ${a.heure_rappel}` : ''}
                          {a.rappel_fait ? ' ✓' : ''}
                        </span>
                        {!a.rappel_fait && (
                          <button onClick={() => onMarkReminder(a.id, prospect.id)} className="text-[10px] px-1 py-0.5 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100">✓</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {activities.length > 10 && (
              <p className="text-[10px] text-neutral-400 text-center">+{activities.length - 10} autres</p>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <button className="px-2 py-2 text-[10px] font-semibold text-white bg-gradient-to-r from-pink-600 to-purple-600 rounded-lg hover:from-pink-700 hover:to-purple-700 transition-all text-center">
            Envoyer DM
          </button>
          <button className="px-2 py-2 text-[10px] font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all text-center">
            Generer visuel
          </button>
          <button className="px-2 py-2 text-[10px] font-semibold text-white bg-gradient-to-r from-orange-600 to-amber-600 rounded-lg hover:from-orange-700 hover:to-amber-700 transition-all text-center">
            Proposer Sprint
          </button>
        </div>
        <div className="flex items-center justify-between pt-1">
          <button onClick={onEdit} className="text-[10px] text-purple-600 hover:text-purple-700 transition-colors">Modifier</button>
          <button onClick={onDelete} className="text-[10px] text-red-500 hover:text-red-600 transition-colors">Supprimer</button>
        </div>
      </div>

      {/* Quick Add Activity */}
      <div className="px-4 py-3 border-t border-neutral-200">
        <QuickActivityForm prospectId={prospect.id} onAdd={onAddActivity} />
      </div>
    </div>
  );
}

// ─── Quick Activity Form Component ──────────────────────────────────────────

function QuickActivityForm({ prospectId, onAdd }: {
  prospectId: string;
  onAdd: (data: { prospect_id: string; type: string; description?: string; resultat?: string; date_rappel?: string; heure_rappel?: string }) => void;
}) {
  const [type, setType] = useState('appel');
  const [resultat, setResultat] = useState('');
  const [description, setDescription] = useState('');
  const [showRappel, setShowRappel] = useState(false);
  const [dateRappel, setDateRappel] = useState('');
  const [heureRappel, setHeureRappel] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    setAdding(true);
    await onAdd({
      prospect_id: prospectId,
      type,
      description: description || undefined,
      resultat: resultat || undefined,
      date_rappel: dateRappel ? new Date(dateRappel + 'T' + (heureRappel || '09:00')).toISOString() : undefined,
      heure_rappel: heureRappel || undefined,
    });
    // Reset form
    setDescription('');
    setResultat('');
    setShowRappel(false);
    setDateRappel('');
    setHeureRappel('');
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-neutral-500 uppercase">+ Activité</p>
      <div className="flex gap-1.5">
        <select value={type} onChange={e => setType(e.target.value)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg text-neutral-900">
          {ACTIVITY_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
        </select>
        <select value={resultat} onChange={e => setResultat(e.target.value)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg text-neutral-900">
          <option value="">Résultat...</option>
          {QUICK_RESULTS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      <input
        type="text"
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Note rapide..."
        className="w-full px-2 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder-neutral-400"
      />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer">
          <input type="checkbox" checked={showRappel} onChange={e => setShowRappel(e.target.checked)} className="rounded" />
          🔔 Rappel
        </label>
        {showRappel && (
          <>
            <input type="date" value={dateRappel} onChange={e => setDateRappel(e.target.value)} className="px-2 py-1 text-xs bg-white border border-neutral-300 rounded text-neutral-900" />
            <input type="time" value={heureRappel} onChange={e => setHeureRappel(e.target.value)} className="px-2 py-1 text-xs bg-white border border-neutral-300 rounded text-neutral-900 w-20" />
          </>
        )}
      </div>
      <button
        onClick={handleAdd}
        disabled={adding}
        className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50"
      >
        {adding ? '...' : '+ Ajouter'}
      </button>
    </div>
  );
}
