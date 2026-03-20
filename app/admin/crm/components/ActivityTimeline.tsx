'use client';

type TimelineActivity = {
  id: string;
  type: string;
  description: string | null;
  data: any;
  created_at: string;
  resultat?: string | null;
};

type Props = {
  activities: TimelineActivity[];
  loading: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  onActivityClick?: (activity: TimelineActivity) => void;
};

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  email:                          { icon: '\u2709\uFE0F', color: 'bg-blue-500' },
  email_opened:                   { icon: '\uD83D\uDCE7', color: 'bg-sky-400' },
  email_clicked:                  { icon: '\uD83D\uDDB1\uFE0F', color: 'bg-green-500' },
  email_replied:                  { icon: '\uD83D\uDCAC', color: 'bg-emerald-600' },
  email_bounced:                  { icon: '\u26A0\uFE0F', color: 'bg-red-500' },
  dm_instagram:                   { icon: '\uD83D\uDCE9', color: 'bg-pink-500' },
  dm_tiktok:                      { icon: '\uD83D\uDCE9', color: 'bg-neutral-500' },
  tiktok_comment:                 { icon: '\uD83D\uDCAC', color: 'bg-indigo-500' },
  comment_prepared:               { icon: '\uD83D\uDCAC', color: 'bg-indigo-400' },
  commercial_enrichment:          { icon: '\uD83D\uDD0D', color: 'bg-amber-500' },
  commercial_social_enrichment:   { icon: '\uD83D\uDD0D', color: 'bg-amber-400' },
  commercial_verification:        { icon: '\u274C', color: 'bg-red-400' },
  prospect_discovered:            { icon: '\uD83C\uDD95', color: 'bg-cyan-500' },
  retention_message:              { icon: '\uD83D\uDD04', color: 'bg-orange-500' },
  retention_alert:                { icon: '\uD83D\uDD04', color: 'bg-orange-400' },
  onboarding_email:               { icon: '\uD83C\uDF93', color: 'bg-purple-500' },
  appel:                          { icon: '\uD83D\uDCDE', color: 'bg-green-500' },
  rdv:                            { icon: '\uD83D\uDCC5', color: 'bg-amber-500' },
  note:                           { icon: '\uD83D\uDCDD', color: 'bg-neutral-400' },
};

const DEFAULT_CONFIG = { icon: '\u2022', color: 'bg-neutral-400' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text: string | null, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function typeLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ActivityTimeline({
  activities,
  loading,
  onLoadMore,
  hasMore,
  onActivityClick,
}: Props) {
  if (loading && !activities.length) {
    return (
      <div className="flex items-center justify-center py-8 text-neutral-400 text-sm">
        Chargement...
      </div>
    );
  }

  if (!activities.length) {
    return (
      <div className="text-center text-neutral-400 text-sm py-6">
        Aucune activite
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-neutral-200" />

      <div className="space-y-3">
        {activities.map((activity) => {
          const config = TYPE_CONFIG[activity.type] ?? DEFAULT_CONFIG;

          return (
            <div
              key={activity.id}
              className={`relative flex items-start gap-3 pl-0 group ${onActivityClick ? 'cursor-pointer' : ''}`}
              onClick={() => onActivityClick?.(activity)}
            >
              {/* Circle icon */}
              <div
                className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full ${config.color} text-white text-xs shrink-0 shadow-sm`}
              >
                {config.icon}
              </div>

              {/* Content card */}
              <div className="flex-1 bg-white border border-neutral-100 rounded-lg px-3 py-2 shadow-sm group-hover:shadow-md transition-shadow min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-neutral-700 truncate">
                    {typeLabel(activity.type)}
                  </span>
                  <span className="text-[10px] text-neutral-400 whitespace-nowrap">
                    {formatDate(activity.created_at)}
                  </span>
                </div>
                {activity.description && (
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    {truncate(activity.description, 100)}
                  </p>
                )}
                {activity.resultat && (
                  <p className="text-[10px] text-neutral-400 mt-0.5 italic">
                    {truncate(activity.resultat, 80)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="text-center mt-4">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="text-xs text-neutral-500 hover:text-neutral-800 underline disabled:opacity-50 transition-colors"
          >
            {loading ? 'Chargement...' : 'Charger plus'}
          </button>
        </div>
      )}
    </div>
  );
}

export type { TimelineActivity };
