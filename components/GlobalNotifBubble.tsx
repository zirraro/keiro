'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, X, ExternalLink } from 'lucide-react';

interface NotifData {
  totalPending: number;
  badges: Record<string, number>;
  hotProspects: Array<{ id: string; company: string; type: string; status: string }>;
  notifications: Array<{ id: string; agent: string; type: string; title: string; message: string; read: boolean; created_at: string }>;
}

const AGENT_LABELS: Record<string, string> = {
  commercial: 'Jade (Commercial)',
  email: 'Hugo (Email)',
  dm_instagram: 'Jade (DM)',
  marketing: 'Lena (Marketing)',
  onboarding: 'Clara (Onboarding)',
  seo: 'SEO',
  content: 'Lena (Contenu)',
  chatbot: 'Max (Chatbot)',
  retention: 'Retention',
  ceo: 'CEO Brief',
};

export default function GlobalNotifBubble() {
  const [data, setData] = useState<NotifData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Don't show on assistant/agent pages (avoid overlapping agent chat UIs)
  const isAssistantPage = pathname?.startsWith('/assistant');

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) { setData(null); return; }
      const d = await res.json();
      if (d.error) { setData(null); return; }
      setData(d);
      // Reset dismissed if new notifs arrive
      if (d.totalPending > 0) setDismissed(false);
    } catch { setData(null); }
  }, []);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  // Nothing to show
  if (!data || data.totalPending === 0 || isAssistantPage || dismissed) return null;

  const agentsWithActions = Object.entries(data.badges)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {expanded && (
        <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl w-72 sm:w-80 max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-white font-semibold text-sm">Actions en attente</span>
            <button onClick={() => setExpanded(false)} className="text-white/40 hover:text-white/70 transition">
              <X size={16} />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[320px] p-2 space-y-1">
            {agentsWithActions.map(([agent, count]) => (
              <button
                key={agent}
                onClick={() => { router.push(`/assistant?agent=${agent}`); setExpanded(false); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                  <span className="text-white/80 text-sm group-hover:text-white transition">
                    {AGENT_LABELS[agent] || agent}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
                    {count}
                  </span>
                  <ExternalLink size={12} className="text-white/20 group-hover:text-white/50 transition" />
                </div>
              </button>
            ))}
            {data.hotProspects.length > 0 && (
              <div className="border-t border-white/5 mt-1 pt-1">
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/60">
                    Prospects chauds
                  </span>
                </div>
                {data.hotProspects.slice(0, 5).map(p => (
                  <button
                    key={p.id}
                    onClick={() => { router.push('/assistant?agent=commercial'); setExpanded(false); }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/5 transition"
                  >
                    <span className="text-white/70 text-xs">{'\u{1F525}'} {p.company}</span>
                    <span className="text-[10px] text-white/30">{p.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-white/10 px-4 py-2.5">
            <button
              onClick={() => { router.push('/assistant'); setExpanded(false); }}
              className="w-full text-center text-xs text-purple-400 hover:text-purple-300 transition font-medium"
            >
              Ouvrir le tableau de bord →
            </button>
          </div>
        </div>
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="relative group flex items-center gap-2 bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-500 hover:to-orange-400 text-white rounded-full shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all duration-200 hover:scale-105 active:scale-95"
        style={{ padding: expanded ? '10px 16px' : '12px 18px' }}
      >
        <Bell size={18} className="animate-bounce" style={{ animationDuration: '2s' }} />
        <span className="font-bold text-sm">{data.totalPending}</span>
        <span className="text-white/80 text-xs hidden sm:inline">
          action{data.totalPending > 1 ? 's' : ''} en attente
        </span>

        {/* Dismiss button */}
        <button
          onClick={(e) => { e.stopPropagation(); setDismissed(true); setExpanded(false); }}
          className="ml-1 text-white/40 hover:text-white/80 transition"
        >
          <X size={14} />
        </button>
      </button>
    </div>
  );
}
