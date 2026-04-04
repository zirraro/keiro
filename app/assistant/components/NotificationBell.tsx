'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  agent: string;
  type: string;
  title: string;
  message: string;
  data: any;
  read: boolean;
  created_at: string;
}

const AGENT_ICONS: Record<string, string> = {
  ceo: '🧠', email: '📧', commercial: '💼', content: '📝', seo: '🔍',
  ads: '📢', dm_instagram: '📸', whatsapp: '💬', chatbot: '🤖',
  gmaps: '📍', tiktok_comments: '🎵', retention: '🔒', onboarding: '🚀',
  comptable: '💰', rh: '👥', marketing: '📊', noah: '🧠', ami: '🔮',
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}j`;
}

export default function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.totalPending || data.unreadCount || 0);
      // Add hot prospect notifications to the list
      if (data.hotProspects?.length > 0) {
        const hotNotifs = data.hotProspects.map((p: any) => ({
          id: `hot_${p.id}`,
          agent: 'commercial',
          type: 'hot_prospect',
          title: `${'\u{1F525}'} Prospect chaud : ${p.company}`,
          message: `${p.type || 'Commerce'} — ${p.status}. A contacter en priorite !`,
          data: p,
          read: false,
          created_at: new Date().toISOString(),
        }));
        setNotifications(prev => [...hotNotifs, ...prev.filter(n => !n.id.startsWith('hot_'))]);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 60s for new notifications
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch('/api/notifications', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
    setLoading(false);
  };

  const markRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notificationId: id }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-white/10 transition z-[60]"
      >
        <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto sm:right-0 top-16 sm:top-12 z-50 sm:w-96 max-w-[calc(100vw-16px)] max-h-[70vh] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="font-bold text-sm text-neutral-800 dark:text-white">
                Notifications {unreadCount > 0 && <span className="text-red-500">({unreadCount})</span>}
              </h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} disabled={loading} className="text-[11px] text-blue-500 hover:underline">
                  {loading ? '...' : 'Tout marquer comme lu'}
                </button>
              )}
            </div>

            {/* Notifications list — show unread first, hide read by default */}
            <div className="overflow-y-auto max-h-[55vh]">
              {notifications.filter(n => !n.read).length === 0 && notifications.length > 0 ? (
                <div className="text-center py-8 text-neutral-400 text-sm">
                  <div className="text-2xl mb-2">{'\u2705'}</div>
                  Tout est a jour !
                  <button onClick={() => {}} className="block mx-auto mt-2 text-[10px] text-blue-400 hover:underline">Voir les anciennes notifications</button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-12 text-neutral-400 text-sm">
                  <div className="text-3xl mb-2">🔔</div>
                  Aucune notification
                </div>
              ) : (
                notifications.map(notif => (
                  <button
                    key={notif.id}
                    onClick={() => {
                      if (!notif.read) markRead(notif.id);
                      setOpen(false);
                      // Navigate to agent page, open chat with notification message
                      const agentId = notif.agent;
                      if (agentId && agentId !== 'system') {
                        const chatMsg = encodeURIComponent(notif.title + ': ' + notif.message);
                        window.location.href = `/assistant/agent/${agentId}?tab=dashboard&openChat=true&chatMsg=${chatMsg}`;
                      }
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-neutral-50 dark:border-neutral-800/50 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${!notif.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg mt-0.5">{AGENT_ICONS[notif.agent] || '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${!notif.read ? 'text-neutral-900 dark:text-white' : 'text-neutral-500'}`}>
                            {notif.title}
                          </span>
                          {!notif.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                        </div>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{notif.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-neutral-400">{notif.agent}</span>
                          <span className="text-[10px] text-neutral-300">·</span>
                          <span className="text-[10px] text-neutral-400">{timeAgo(notif.created_at)}</span>
                          {notif.type === 'action' && <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">Action requise</span>}
                          {notif.type === 'alert' && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Alerte</span>}
                          {notif.type === 'brief' && <span className="text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">Brief CEO</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Agent notification badge — shows unread count per agent
 * Use: <AgentNotifBadge agentId="email" notifications={notifications} />
 */
export function AgentNotifBadge({ agentId, notifications }: { agentId: string; notifications: Notification[] }) {
  const count = notifications.filter(n => n.agent === agentId && !n.read).length;
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5 z-10">
      {count}
    </span>
  );
}
