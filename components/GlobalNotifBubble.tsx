'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, X, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/context';

interface NotifData {
  totalPending: number;
  actionSignature?: string;
  badges: Record<string, number>;
  hotProspects: Array<{ id: string; company: string; type: string; status: string }>;
  notifications: Array<{ id: string; agent: string; type: string; title: string; message: string; read: boolean; created_at: string }>;
}

const DISMISS_KEY = 'keiro_notif_dismissed_sig';

export default function GlobalNotifBubble() {
  const [data, setData] = useState<NotifData | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Signature des actions que l'utilisateur a masquées : on ne ré-affiche le
  // popup QUE si de NOUVELLES actions apparaissent (founder 03/07 : "pas de
  // popup qui ressort inutilement / s'accumule").
  const [dismissedSig, setDismissedSig] = useState<string>('');
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const n = (t as any).notif || {};
  const AGENT_LABELS: Record<string, string> = {
    commercial: n.agentCommercial || 'Léo (Commercial)',
    email: n.agentEmail || 'Hugo (Email)',
    dm_instagram: n.agentDmInstagram || 'Jade (DM)',
    marketing: n.agentMarketing || 'Ami (Marketing)',
    onboarding: n.agentOnboarding || 'Clara (Onboarding)',
    seo: n.agentSeo || 'Oscar (SEO)',
    content: n.agentContent || 'Léna (Contenu)',
    chatbot: n.agentChatbot || 'Clara (Chatbot site)',
    retention: n.agentRetention || 'Théo (Rétention)',
    ceo: n.agentCeo || 'Noah (Brief CEO)',
  };

  // Don't show on assistant/agent pages (avoid overlapping agent chat UIs)
  const isAssistantPage = pathname?.startsWith('/assistant');

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) { setData(null); return; }
      const d = await res.json();
      if (d.error) { setData(null); return; }
      setData(d);
    } catch { setData(null); }
  }, []);

  useEffect(() => {
    try { setDismissedSig(localStorage.getItem(DISMISS_KEY) || ''); } catch { /* SSR/no storage */ }
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  const sig = data?.actionSignature || '';
  const dismiss = () => {
    setDismissedSig(sig);
    try { localStorage.setItem(DISMISS_KEY, sig); } catch { /* ignore */ }
    setExpanded(false);
  };

  // Nothing to show — or the current action set was already dismissed (only
  // re-appears when a NEW action changes the signature).
  if (!data || data.totalPending === 0 || isAssistantPage || (sig && sig === dismissedSig)) return null;

  const agentsWithActions = Object.entries(data.badges)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    // 2026-06-03 Mobile UX fix:
    // - Mobile (<640px) : badge discret top-right, n'overlap pas la BottomNav
    //   ni les boutons d'action. Pas de label texte (juste icon + nombre).
    //   Position safe-area pour ne pas être sous la barre status iOS.
    // - Desktop (≥640px) : bubble bottom-right comme avant.
    <div className="fixed z-[9999] flex flex-col items-end gap-2
                    sm:bottom-6 sm:right-6
                    top-[max(0.75rem,env(safe-area-inset-top))] right-3 sm:top-auto">
      {/* Expanded panel */}
      {expanded && (
        <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl w-[calc(100vw-1.5rem)] max-w-xs sm:w-80 max-h-[70vh] overflow-hidden animate-in fade-in slide-in-from-top-2 sm:slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-white font-semibold text-sm">{n.pendingActionsTitle || 'Actions en attente'}</span>
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
                  <ExternalLink size={12} className="text-white/45 group-hover:text-white/50 transition" />
                </div>
              </button>
            ))}
            {data.hotProspects.length > 0 && (
              <div className="border-t border-white/5 mt-1 pt-1">
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400/60">
                    {n.hotProspects || 'Prospects chauds'}
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
              {n.openDashboard || 'Ouvrir le tableau de bord'} →
            </button>
          </div>
        </div>
      )}

      {/* Floating bubble.
          Mobile : compact icon-only avec count badge.
          Desktop : pleine pill avec label "actions en attente".
      */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="relative group flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-500 hover:to-orange-400 text-white rounded-full shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all duration-200 hover:scale-105 active:scale-95 px-2.5 py-2 sm:px-4 sm:py-3"
      >
        <Bell size={16} className="sm:w-[18px] sm:h-[18px] animate-bounce" style={{ animationDuration: '2s' }} />
        <span className="font-bold text-xs sm:text-sm">{data.totalPending}</span>
        <span className="text-white/80 text-xs hidden sm:inline">
          {data.totalPending > 1 ? (n.pendingActionMany || 'actions en attente') : (n.pendingActionOne || 'action en attente')}
        </span>

        {/* Dismiss button — visible only on hover desktop, always small touch on mobile */}
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          className="ml-0.5 sm:ml-1 text-white/50 hover:text-white/90 transition p-1 -m-1"
          aria-label="Masquer"
        >
          <X size={12} className="sm:w-3.5 sm:h-3.5" />
        </button>
      </button>
    </div>
  );
}
