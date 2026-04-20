'use client';

import { useState, useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/context';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  note_google: number;
  avis_google: number;
  notes: string;
  tags: string[];
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
  date_rappel: string;
  created_by: string;
}

interface CrmDashboardProps {
  data: {
    prospects: Prospect[];
    activities: Activity[];
    pipeline: Record<string, number>;
    stats: {
      total: number;
      hot: number;
      warm: number;
      cold: number;
      converted: number;
      conversionRate: number;
    };
  };
  onAddProspect?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PIPELINE_STAGES: { key: string; label: string; color: string }[] = [
  { key: 'identifie', label: 'Identifie', color: 'bg-slate-500' },
  { key: 'contacte', label: 'Contacte', color: 'bg-blue-500' },
  { key: 'relance_1', label: 'Relance 1', color: 'bg-sky-500' },
  { key: 'relance_2', label: 'Relance 2', color: 'bg-cyan-500' },
  { key: 'relance_3', label: 'Relance 3', color: 'bg-teal-500' },
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

const PRIORITY_CONFIG: Record<string, { bg: string; text: string }> = {
  A: { bg: 'bg-green-500/20',  text: 'text-green-400' },
  B: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  C: { bg: 'bg-gray-500/20',   text: 'text-gray-400' },
};

const ACTIVITY_ICONS: Record<string, string> = {
  appel: '\uD83D\uDCDE',
  message: '\uD83D\uDCAC',
  email: '\uD83D\uDCE7',
  rdv: '\uD83D\uDCC5',
  dm_instagram: '\uD83D\uDCF8',
  visite: '\uD83D\uDEB6',
  relance: '\uD83D\uDD04',
  note: '\uD83D\uDCDD',
};

const STATUS_COLORS: Record<string, string> = {
  identifie: 'bg-slate-500/20 text-slate-300',
  contacte: 'bg-blue-500/20 text-blue-300',
  relance_1: 'bg-sky-500/20 text-sky-300',
  relance_2: 'bg-cyan-500/20 text-cyan-300',
  relance_3: 'bg-teal-500/20 text-teal-300',
  repondu: 'bg-emerald-500/20 text-emerald-300',
  demo: 'bg-violet-500/20 text-violet-300',
  sprint: 'bg-purple-500/20 text-purple-300',
  client: 'bg-green-500/20 text-green-300',
  perdu: 'bg-red-500/20 text-red-300',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `il y a ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `il y a ${days}j`;
  return formatDate(iso);
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function KpiCard({ icon, value, label, color }: {
  icon: React.ReactNode; value: string | number; label: string; color: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3 min-w-0">
      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-white truncate">{value}</div>
        <div className="text-xs text-white/40 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function TemperatureBadge({ temp }: { temp: string }) {
  const cfg = TEMP_CONFIG[temp] || TEMP_CONFIG.cold;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.C;
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      {priority}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || 'bg-white/10 text-white/60';
  const label = PIPELINE_STAGES.find(s => s.key === status)?.label || status;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Pipeline Funnel                                                    */
/* ------------------------------------------------------------------ */

function PipelineFunnel({ pipeline, activeStage, onStageClick }: {
  pipeline: Record<string, number>;
  activeStage: string | null;
  onStageClick: (stage: string | null) => void;
}) {
  const total = PIPELINE_STAGES.reduce((s, st) => s + (pipeline[st.key] || 0), 0);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white/70 mb-3">Pipeline</h3>

      {total === 0 ? (
        <div className="text-white/40 text-sm text-center py-4">Aucun prospect dans le pipeline</div>
      ) : (
        <>
          {/* Desktop: horizontal bar */}
          <div className="hidden sm:flex h-10 rounded-lg overflow-hidden">
            {PIPELINE_STAGES.map(stage => {
              const count = pipeline[stage.key] || 0;
              if (count === 0) return null;
              const pct = Math.max((count / total) * 100, 4);
              const isActive = activeStage === stage.key;
              return (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => onStageClick(isActive ? null : stage.key)}
                  className={`${stage.color} relative flex items-center justify-center text-xs font-semibold text-white transition-all min-h-[44px] ${
                    isActive ? 'ring-2 ring-white ring-inset opacity-100' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ width: `${pct}%` }}
                  title={`${stage.label}: ${count}`}
                >
                  {pct > 8 && <span className="truncate px-1">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Mobile: stacked */}
          <div className="sm:hidden space-y-1.5">
            {PIPELINE_STAGES.map(stage => {
              const count = pipeline[stage.key] || 0;
              if (count === 0) return null;
              const pct = (count / total) * 100;
              const isActive = activeStage === stage.key;
              return (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => onStageClick(isActive ? null : stage.key)}
                  className={`w-full flex items-center gap-2 min-h-[44px] rounded-lg px-3 py-2 transition-all ${
                    isActive ? 'ring-2 ring-purple-400' : ''
                  } bg-white/5`}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${stage.color}`} />
                  <span className="text-xs text-white/70 flex-1 text-left">{stage.label}</span>
                  <span className="text-xs font-bold text-white">{count}</span>
                  <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend (desktop) */}
          <div className="hidden sm:flex flex-wrap gap-3 mt-3">
            {PIPELINE_STAGES.map(stage => {
              const count = pipeline[stage.key] || 0;
              if (count === 0) return null;
              return (
                <div key={stage.key} className="flex items-center gap-1.5 text-xs text-white/50">
                  <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  {stage.label} ({count})
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeStage && (
        <button
          type="button"
          onClick={() => onStageClick(null)}
          className="mt-2 text-xs text-purple-400 hover:text-purple-300 transition-colors min-h-[44px] sm:min-h-0 flex items-center"
        >
          Effacer le filtre
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Activity Timeline                                                  */
/* ------------------------------------------------------------------ */

function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <div className="text-white/40 text-xs py-2">Aucune activite enregistree</div>;
  }

  return (
    <div className="space-y-3 mt-3">
      <div className="text-xs font-semibold text-white/50 uppercase tracking-wider">Activites</div>
      <div className="relative pl-5 space-y-3">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />

        {activities.map(act => {
          const icon = ACTIVITY_ICONS[act.type] || '\uD83D\uDCDD';
          return (
            <div key={act.id} className="relative">
              <div className="absolute -left-5 top-0.5 w-3.5 h-3.5 rounded-full bg-[#0c1a3a] border-2 border-purple-500/50 flex items-center justify-center text-[10px]">
                {icon}
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-white/80 capitalize">{act.type.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-white/40 flex-shrink-0">{formatDateTime(act.date_activite)}</span>
                </div>
                {act.description && (
                  <p className="text-xs text-white/60 leading-relaxed">{act.description}</p>
                )}
                {act.resultat && (
                  <p className="text-xs text-purple-300/80 mt-1">Resultat : {act.resultat}</p>
                )}
                {act.date_rappel && (
                  <p className="text-[10px] text-yellow-400/70 mt-1">Rappel : {formatDate(act.date_rappel)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Prospect Row (Desktop)                                             */
/* ------------------------------------------------------------------ */

function ProspectRow({ prospect, activities, isExpanded, onToggle, lastActivity }: {
  prospect: Prospect;
  activities: Activity[];
  isExpanded: boolean;
  onToggle: () => void;
  lastActivity: Activity | undefined;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <PriorityBadge priority={prospect.priorite} />
            <div>
              <div className="text-sm font-medium text-white">
                {prospect.first_name} {prospect.last_name}
              </div>
              {prospect.email && (
                <div className="text-xs text-white/40 truncate max-w-[180px]">{prospect.email}</div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-white/70 max-w-[140px] truncate">{prospect.company || '-'}</td>
        <td className="px-4 py-3"><StatusPill status={prospect.status} /></td>
        <td className="px-4 py-3"><TemperatureBadge temp={prospect.temperature} /></td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500"
                style={{ width: `${Math.min(prospect.score, 100)}%` }}
              />
            </div>
            <span className="text-xs text-white/50 w-7 text-right">{prospect.score}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-white/50 capitalize">{prospect.source || '-'}</td>
        <td className="px-4 py-3 text-xs text-white/40">{lastActivity ? timeAgo(lastActivity.date_activite) : '-'}</td>
        <td className="px-4 py-3 text-white/30">
          <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={8} className="px-4 py-4 bg-white/[0.02]">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              {prospect.phone && (
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Telephone</div>
                  <div className="text-sm text-white/80">{prospect.phone}</div>
                </div>
              )}
              {prospect.instagram && (
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Instagram</div>
                  <div className="text-sm text-purple-400">@{prospect.instagram}</div>
                </div>
              )}
              {prospect.note_google > 0 && (
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Google</div>
                  <div className="text-sm text-white/80">{prospect.note_google}/5 ({prospect.avis_google} avis)</div>
                </div>
              )}
              {prospect.type && (
                <div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">Type</div>
                  <div className="text-sm text-white/80 capitalize">{prospect.type}</div>
                </div>
              )}
            </div>
            {prospect.notes && (
              <div className="mb-3">
                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Notes</div>
                <p className="text-xs text-white/60 leading-relaxed bg-white/5 rounded-lg p-2">{prospect.notes}</p>
              </div>
            )}
            {prospect.tags && prospect.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {prospect.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-[10px]">{tag}</span>
                ))}
              </div>
            )}
            <ActivityTimeline activities={activities} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Prospect Card (Mobile)                                             */
/* ------------------------------------------------------------------ */

function ProspectCard({ prospect, activities, isExpanded, onToggle, lastActivity }: {
  prospect: Prospect;
  activities: Activity[];
  isExpanded: boolean;
  onToggle: () => void;
  lastActivity: Activity | undefined;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 min-h-[44px] flex items-start gap-3"
      >
        <PriorityBadge priority={prospect.priorite} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-white truncate">
              {prospect.first_name} {prospect.last_name}
            </span>
            <svg className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {prospect.company && (
            <div className="text-xs text-white/40 mt-0.5 truncate">{prospect.company}</div>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusPill status={prospect.status} />
            <TemperatureBadge temp={prospect.temperature} />
            <span className="text-xs text-white/40">Score: {prospect.score}</span>
          </div>
          {lastActivity && (
            <div className="text-[10px] text-white/30 mt-1.5">{timeAgo(lastActivity.date_activite)}</div>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3">
          <div className="grid grid-cols-2 gap-3 mb-3">
            {prospect.email && (
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-wider">Email</div>
                <div className="text-xs text-white/70 truncate">{prospect.email}</div>
              </div>
            )}
            {prospect.phone && (
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-wider">Telephone</div>
                <div className="text-xs text-white/70">{prospect.phone}</div>
              </div>
            )}
            {prospect.instagram && (
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-wider">Instagram</div>
                <div className="text-xs text-purple-400">@{prospect.instagram}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Source</div>
              <div className="text-xs text-white/70 capitalize">{prospect.source || '-'}</div>
            </div>
          </div>
          {prospect.notes && (
            <div className="mb-3">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Notes</div>
              <p className="text-xs text-white/60 bg-white/5 rounded-lg p-2">{prospect.notes}</p>
            </div>
          )}
          {prospect.tags && prospect.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {prospect.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-[10px]">{tag}</span>
              ))}
            </div>
          )}
          <ActivityTimeline activities={activities} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter Bar                                                         */
/* ------------------------------------------------------------------ */

function FilterBar({ search, onSearch, tempFilter, onTempFilter, sourceFilter, onSourceFilter, sources }: {
  search: string;
  onSearch: (v: string) => void;
  tempFilter: string;
  onTempFilter: (v: string) => void;
  sourceFilter: string;
  onSourceFilter: (v: string) => void;
  sources: string[];
}) {
  const { t } = useLanguage();
  const nn = (t as any).notif || {};
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {/* Search */}
      <div className="relative flex-1">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder={nn.crmSearchProspect || 'Rechercher un prospect...'}
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent min-h-[44px]"
        />
      </div>

      {/* Temperature filter */}
      <select
        value={tempFilter}
        onChange={e => onTempFilter(e.target.value)}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 focus:outline-none focus:ring-2 focus:ring-purple-500/50 min-h-[44px] appearance-none cursor-pointer"
      >
        <option value="">Temperature</option>
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="cold">Cold</option>
        <option value="dead">Dead</option>
      </select>

      {/* Source filter */}
      <select
        value={sourceFilter}
        onChange={e => onSourceFilter(e.target.value)}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 focus:outline-none focus:ring-2 focus:ring-purple-500/50 min-h-[44px] appearance-none cursor-pointer"
      >
        <option value="">Source</option>
        {sources.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CrmDashboard({ data, onAddProspect }: CrmDashboardProps) {
  const { t } = useLanguage();
  const nn = (t as any).notif || {};
  const prospects = data?.prospects || [];
  const activities = data?.activities || [];
  const pipeline = data?.pipeline || {};
  const stats = data?.stats || {};

  const [search, setSearch] = useState('');
  const [tempFilter, setTempFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Index activities by prospect
  const activitiesByProspect = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    for (const act of activities) {
      if (!map[act.prospect_id]) map[act.prospect_id] = [];
      map[act.prospect_id].push(act);
    }
    // Sort each list by date desc
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(b.date_activite).getTime() - new Date(a.date_activite).getTime());
    }
    return map;
  }, [activities]);

  // Unique sources
  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const p of prospects) {
      if (p.source) set.add(p.source);
    }
    return Array.from(set).sort();
  }, [prospects]);

  // Filtered prospects
  const filtered = useMemo(() => {
    let list = [...prospects];

    if (stageFilter) {
      list = list.filter(p => p.status === stageFilter);
    }
    if (tempFilter) {
      list = list.filter(p => p.temperature === tempFilter);
    }
    if (sourceFilter) {
      list = list.filter(p => p.source === sourceFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.company && p.company.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.phone && p.phone.includes(q))
      );
    }

    // Sort: hot first, then by score desc
    const tempOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2, dead: 3 };
    list.sort((a, b) => {
      const ta = tempOrder[a.temperature] ?? 2;
      const tb = tempOrder[b.temperature] ?? 2;
      if (ta !== tb) return ta - tb;
      return b.score - a.score;
    });

    return list;
  }, [prospects, stageFilter, tempFilter, sourceFilter, search]);

  // Average score
  const avgScore = prospects.length > 0
    ? Math.round(prospects.reduce((s, p) => s + p.score, 0) / prospects.length)
    : 0;

  // Hot prospects with recommended actions
  const hotProspects = useMemo(() => {
    return prospects
      .filter(p => p.temperature === 'hot' || (p.score >= 60 && p.temperature !== 'dead'))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [prospects]);

  return (
    <div data-tour="agent-dashboard" className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Tableau de bord CRM</h2>
          <p className="text-xs text-white/40 mt-0.5">{prospects.length} prospect{prospects.length !== 1 ? 's' : ''} au total</p>
        </div>
        {onAddProspect && (
          <button
            type="button"
            onClick={onAddProspect}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white text-sm font-medium rounded-lg transition-all min-h-[44px] shadow-lg shadow-purple-500/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Ajouter un prospect</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={
            <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          value={stats.total}
          label="Total Prospects"
          color="bg-purple-500/20"
        />
        <KpiCard
          icon={<span className="text-lg">{'\uD83D\uDD25'}</span>}
          value={stats.hot}
          label="Hot Leads"
          color="bg-red-500/20"
        />
        <KpiCard
          icon={
            <svg className="w-5 h-5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          value={`${stats.conversionRate}%`}
          label="Taux Conversion"
          color="bg-green-500/20"
        />
        <KpiCard
          icon={
            <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
          value={avgScore}
          label="Score Moyen"
          color="bg-blue-500/20"
        />
      </div>

      {/* Hot prospects — priority actions */}
      {hotProspects.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <span>{'\u{1F525}'}</span> Prospects chauds — Actions prioritaires
          </h3>
          <div className="space-y-2">
            {hotProspects.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white">{p.company || `${p.first_name} ${p.last_name}`}</div>
                  <div className="text-[10px] text-white/40">{p.email || p.phone || p.instagram || 'Pas de contact'}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">{p.score}/100</span>
                  {p.email && (
                    <button onClick={() => { window.location.href = '/assistant/agent/email'; }} className="text-[9px] px-2 py-1 bg-cyan-600/20 text-cyan-400 rounded-lg hover:bg-cyan-600/30">{'\u{1F4E7}'} Email</button>
                  )}
                  {p.instagram && (
                    <button onClick={() => { window.location.href = '/assistant/agent/dm_instagram'; }} className="text-[9px] px-2 py-1 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30">{'\u{1F4AC}'} DM</button>
                  )}
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="text-[9px] px-2 py-1 bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30">{'\u{1F4DE}'} Appeler</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline */}
      <PipelineFunnel
        pipeline={pipeline}
        activeStage={stageFilter}
        onStageClick={setStageFilter}
      />

      {/* Filters */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        tempFilter={tempFilter}
        onTempFilter={setTempFilter}
        sourceFilter={sourceFilter}
        onSourceFilter={setSourceFilter}
        sources={sources}
      />

      {/* Results count */}
      {(search || tempFilter || sourceFilter || stageFilter) && (
        <div className="text-xs text-white/40">
          {filtered.length} resultat{filtered.length !== 1 ? 's' : ''}
          {stageFilter && <span> &middot; Filtre : {PIPELINE_STAGES.find(s => s.key === stageFilter)?.label}</span>}
        </div>
      )}

      {/* Prospect List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-2">{'\uD83D\uDCCB'}</div>
          <div className="text-sm text-white/40">Aucun prospect trouve</div>
          {(search || tempFilter || sourceFilter || stageFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setTempFilter(''); setSourceFilter(''); setStageFilter(null); }}
              className="mt-2 text-xs text-purple-400 hover:text-purple-300 transition-colors min-h-[44px] inline-flex items-center"
            >
              Effacer tous les filtres
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Nom</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Entreprise</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Temp.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Activite</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <ProspectRow
                    key={p.id}
                    prospect={p}
                    activities={activitiesByProspect[p.id] || []}
                    isExpanded={expandedId === p.id}
                    onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    lastActivity={(activitiesByProspect[p.id] || [])[0]}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(p => (
              <ProspectCard
                key={p.id}
                prospect={p}
                activities={activitiesByProspect[p.id] || []}
                isExpanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                lastActivity={(activitiesByProspect[p.id] || [])[0]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
