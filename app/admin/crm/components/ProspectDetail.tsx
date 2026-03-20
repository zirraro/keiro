'use client';

import { useState, useCallback } from 'react';
import ActivityTimeline from './ActivityTimeline';
import type { TimelineActivity } from './ActivityTimeline';

type Props = {
  prospect: any;
  activities: TimelineActivity[];
  activitiesLoading: boolean;
  onClose: () => void;
  onLoadMoreActivities: () => void;
  hasMoreActivities: boolean;
  onLogActivity: (type: string, description: string) => void;
  onActivityClick?: (activity: any) => void;
};

const TEMP_CONFIG: Record<string, { label: string; color: string }> = {
  hot:  { label: 'Chaud', color: 'bg-red-100 text-red-700' },
  warm: { label: 'Tiede', color: 'bg-orange-100 text-orange-700' },
  cold: { label: 'Froid', color: 'bg-blue-100 text-blue-700' },
  dead: { label: 'Mort',  color: 'bg-neutral-100 text-neutral-500' },
};

const QUICK_ACTIONS = [
  { type: 'appel', icon: '\uD83D\uDCDE', label: 'Appel' },
  { type: 'note', icon: '\uD83D\uDCDD', label: 'Note' },
  { type: 'rdv', icon: '\uD83D\uDCC5', label: 'RDV' },
  { type: 'relance', icon: '\uD83D\uDD04', label: 'Relance' },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">{label}</dt>
      <dd className="text-xs text-neutral-700 truncate mt-0.5">{value || '-'}</dd>
    </div>
  );
}

export default function ProspectDetail({
  prospect,
  activities,
  activitiesLoading,
  onClose,
  onLoadMoreActivities,
  hasMoreActivities,
  onLogActivity,
  onActivityClick,
}: Props) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionText, setActionText] = useState('');

  const displayName =
    prospect.company || prospect.first_name || prospect.email || 'Prospect inconnu';

  const temp = TEMP_CONFIG[prospect.temperature] ?? TEMP_CONFIG.cold;

  const handleQuickAction = useCallback(
    (type: string) => {
      if (activeAction === type) {
        setActiveAction(null);
        setActionText('');
      } else {
        setActiveAction(type);
        setActionText('');
      }
    },
    [activeAction]
  );

  const handleSave = useCallback(() => {
    if (!activeAction || !actionText.trim()) return;
    onLogActivity(activeAction, actionText.trim());
    setActiveAction(null);
    setActionText('');
  }, [activeAction, actionText, onLogActivity]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-30 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 w-[420px] max-w-full h-full bg-white shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-out animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold text-neutral-800 truncate">{displayName}</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${temp.color}`}>
              {temp.label}
            </span>
            {prospect.score != null && (
              <span className="text-[10px] text-neutral-500 font-mono">
                {prospect.score}pts
              </span>
            )}
            {prospect.stage && (
              <span className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
                {prospect.stage}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors p-1"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Info section */}
          <div className="px-4 py-3 border-b border-neutral-50">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Informations
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <InfoField
                label="Email"
                value={
                  prospect.email ? (
                    <a
                      href={`mailto:${prospect.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {prospect.email}
                    </a>
                  ) : null
                }
              />
              <InfoField label="Telephone" value={prospect.phone} />
              <InfoField
                label="Instagram"
                value={
                  prospect.instagram_handle
                    ? `@${prospect.instagram_handle.replace(/^@/, '')}`
                    : null
                }
              />
              <InfoField label="TikTok" value={prospect.tiktok_handle} />
              <InfoField label="Type" value={prospect.business_type || prospect.type} />
              <InfoField label="Quartier" value={prospect.quartier} />
              <InfoField label="Source" value={prospect.source} />
              <InfoField label="Cree le" value={formatDate(prospect.created_at)} />
              <InfoField label="Dernier email" value={formatDate(prospect.last_email_sent_at)} />
              <InfoField label="Email step" value={prospect.email_sequence_step} />
              <InfoField label="Ouvert le" value={formatDate(prospect.last_email_opened_at)} />
              <InfoField label="Clique le" value={formatDate(prospect.last_email_clicked_at)} />
            </dl>
          </div>

          {/* Quick-log section */}
          <div className="px-4 py-3 border-b border-neutral-50">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Action rapide
            </h3>
            <div className="flex gap-2 mb-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.type}
                  onClick={() => handleQuickAction(action.type)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    activeAction === action.type
                      ? 'bg-neutral-800 text-white border-neutral-800'
                      : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <span>{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>

            {activeAction && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={actionText}
                  onChange={(e) => setActionText(e.target.value)}
                  placeholder={`Description (${activeAction})...`}
                  className="flex-1 text-xs border border-neutral-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                  }}
                />
                <button
                  onClick={handleSave}
                  disabled={!actionText.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-white rounded-lg disabled:opacity-40 hover:bg-neutral-700 transition-colors"
                >
                  Enregistrer
                </button>
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
              Historique
            </h3>
            <ActivityTimeline
              activities={activities}
              loading={activitiesLoading}
              onLoadMore={onLoadMoreActivities}
              hasMore={hasMoreActivities}
              onActivityClick={onActivityClick}
            />
          </div>
        </div>
      </div>

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
