'use client';

import { useState, useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/context';

type ScheduledPost = {
  id: string;
  saved_image_id: string;
  image_url: string;
  platform: string;
  scheduled_for: string;
  caption: string;
  hashtags: string[];
  status: string;
  approval_status?: string;
};

interface CalendarTabProps {
  scheduledPosts: ScheduledPost[];
  onEditPost: (post: ScheduledPost) => void;
  onDeletePost: (postId: string) => void;
  isVisitor?: boolean;
}

export default function CalendarTab({ scheduledPosts, onEditPost, onDeletePost, isVisitor = false }: CalendarTabProps) {
  const { t, locale } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [savingTime, setSavingTime] = useState(false);

  const { daysInMonth, firstDayOfMonth, prevMonthDays, nextMonthDays } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const firstDayOfWeek = firstDay.getDay();
    const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    const daysInCurrentMonth = lastDay.getDate();
    const prevMonth = new Date(year, month, 0);
    const daysInPrevMonth = prevMonth.getDate();

    const prevDays = Array.from({ length: adjustedFirstDay }, (_, i) => ({
      day: daysInPrevMonth - adjustedFirstDay + i + 1,
      isCurrentMonth: false,
      date: new Date(year, month - 1, daysInPrevMonth - adjustedFirstDay + i + 1)
    }));

    const currentDays = Array.from({ length: daysInCurrentMonth }, (_, i) => ({
      day: i + 1,
      isCurrentMonth: true,
      date: new Date(year, month, i + 1)
    }));

    const totalCells = prevDays.length + currentDays.length;
    const nextDays = Array.from({ length: 42 - totalCells }, (_, i) => ({
      day: i + 1,
      isCurrentMonth: false,
      date: new Date(year, month + 1, i + 1)
    }));

    return {
      daysInMonth: currentDays,
      firstDayOfMonth: adjustedFirstDay,
      prevMonthDays: prevDays,
      nextMonthDays: nextDays
    };
  }, [currentDate]);

  const allDays = [...prevMonthDays, ...daysInMonth, ...nextMonthDays];

  const postsByDay = useMemo(() => {
    const groups: Record<string, ScheduledPost[]> = {};

    scheduledPosts.forEach(post => {
      const date = new Date(post.scheduled_for);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      if (!groups[key]) groups[key] = [];
      groups[key].push(post);
    });

    return groups;
  }, [scheduledPosts]);

  const getPostsForDay = (date: Date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return postsByDay[key] || [];
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const monthNames = [
    t.library.calMonthJan, t.library.calMonthFeb, t.library.calMonthMar,
    t.library.calMonthApr, t.library.calMonthMay, t.library.calMonthJun,
    t.library.calMonthJul, t.library.calMonthAug, t.library.calMonthSep,
    t.library.calMonthOct, t.library.calMonthNov, t.library.calMonthDec
  ];

  const weekDays = [
    t.library.calDayMon, t.library.calDayTue, t.library.calDayWed,
    t.library.calDayThu, t.library.calDayFri, t.library.calDaySat, t.library.calDaySun
  ];

  const getPlatformEmoji = (platform: string) => {
    switch (platform) {
      case 'instagram': return '📷';
      case 'tiktok': return '🎵';
      case 'facebook': return '👥';
      case 'linkedin': return '💼';
      case 'twitter': return '🐦';
      default: return '📱';
    }
  };

  const handleSaveTime = async () => {
    if (!selectedPost || !editDate || !editTime) return;
    setSavingTime(true);
    try {
      const newScheduledFor = `${editDate}T${editTime}:00`;
      const res = await fetch('/api/library/scheduled-posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPost.id, scheduled_for: newScheduledFor })
      });
      const data = await res.json();
      if (data.ok) {
        // Update local state
        setSelectedPost({ ...selectedPost, scheduled_for: newScheduledFor });
        setEditingTime(false);
        // Trigger parent refresh via onEditPost
        onEditPost({ ...selectedPost, scheduled_for: newScheduledFor });
      } else {
        alert(data.error || 'Erreur lors de la modification');
      }
    } catch (err: any) {
      alert(err.message || 'Erreur réseau');
    } finally {
      setSavingTime(false);
    }
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US';

  return (
    <div className="space-y-6">
      {!isVisitor && (
        <>
          {scheduledPosts.length > 0 && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">🤖</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 mb-1">
                {t.library.calAutoPublishEnabled}
              </p>
              <p className="text-xs text-blue-800">
                {t.library.calAutoPublishDesc}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 border border-blue-200">
            <p className="text-xs font-semibold text-blue-900 mb-2">📆 {t.library.calNextAutoPublish}</p>
            <div className="space-y-2">
              {scheduledPosts
                .filter(post => new Date(post.scheduled_for) > new Date())
                .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())
                .slice(0, 3)
                .map(post => (
                  <div key={post.id} className="flex items-center gap-2 text-xs">
                    <span className="text-blue-500">→</span>
                    <span className="font-medium text-neutral-900">
                      {new Date(post.scheduled_for).toLocaleDateString(dateLocale, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short'
                      })} {locale === 'fr' ? 'à' : 'at'} {new Date(post.scheduled_for).toLocaleTimeString(dateLocale, {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <span className="text-neutral-600">•</span>
                    <span className="text-neutral-600 truncate flex-1">
                      {post.caption.substring(0, 40)}...
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <p className="text-sm text-neutral-600 mt-1">
            {scheduledPosts.length} {t.library.calPublicationsScheduled}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={previousMonth}
            className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors text-sm font-medium"
          >
            {t.library.calToday}
          </button>
          <button
            onClick={nextMonth}
            className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 bg-neutral-50 border-b border-neutral-200">
          {weekDays.map(day => (
            <div key={day} className="p-3 text-center text-sm font-semibold text-neutral-700">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {allDays.map((dayInfo, idx) => {
            const posts = getPostsForDay(dayInfo.date);
            const isTodayDate = isToday(dayInfo.date);

            return (
              <div
                key={idx}
                className={`min-h-[120px] border-b border-r border-neutral-100 p-2 ${
                  !dayInfo.isCurrentMonth ? 'bg-neutral-50' : 'bg-white'
                } ${isTodayDate ? 'bg-blue-50' : ''}`}
              >
                <div className={`text-sm font-medium mb-2 ${
                  !dayInfo.isCurrentMonth ? 'text-neutral-400' : 'text-neutral-900'
                } ${isTodayDate ? 'text-blue-600 font-bold' : ''}`}>
                  {dayInfo.day}
                </div>

                <div className="space-y-1">
                  {posts.slice(0, 3).map(post => (
                    <button
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className="w-full text-left p-2 rounded bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-1">
                        <span>{getPlatformEmoji(post.platform)}</span>
                        <span className="truncate flex-1">
                          {new Date(post.scheduled_for).toLocaleTimeString(dateLocale, {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </button>
                  ))}

                  {posts.length > 3 && (
                    <div className="text-xs text-neutral-500 text-center">
                      +{posts.length - 3} {t.library.calMore}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Post Detail Modal */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedPost(null); setEditingTime(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                    {getPlatformEmoji(selectedPost.platform)} {t.library.calScheduledPost}
                  </h3>
                  <p className="text-xs text-neutral-500 capitalize mt-0.5">{selectedPost.platform}</p>
                </div>
                <button
                  onClick={() => { setSelectedPost(null); setEditingTime(false); }}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Editable Date & Time */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-blue-900">📅 Date et heure de publication</span>
                  {selectedPost.status === 'scheduled' && !editingTime && (
                    <button
                      onClick={() => {
                        const d = new Date(selectedPost.scheduled_for);
                        setEditDate(d.toISOString().split('T')[0]);
                        setEditTime(d.toTimeString().slice(0, 5));
                        setEditingTime(true);
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-medium underline"
                    >
                      Modifier
                    </button>
                  )}
                </div>

                {editingTime ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="px-2 py-1.5 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="px-2 py-1.5 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveTime}
                        disabled={savingTime}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded font-medium hover:bg-blue-700 disabled:bg-blue-300"
                      >
                        {savingTime ? 'Enregistrement...' : 'Enregistrer'}
                      </button>
                      <button
                        onClick={() => setEditingTime(false)}
                        className="px-3 py-1.5 border border-neutral-300 text-xs rounded font-medium hover:bg-neutral-50"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-blue-800">
                    {new Date(selectedPost.scheduled_for).toLocaleDateString(dateLocale, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })} {locale === 'fr' ? 'à' : 'at'} {new Date(selectedPost.scheduled_for).toLocaleTimeString(dateLocale, {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>

              {selectedPost.image_url && (
                <img
                  src={selectedPost.image_url}
                  alt="Post"
                  className="w-full aspect-square object-cover rounded-lg mb-4"
                />
              )}

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-neutral-700 mb-1">Caption</p>
                  <p className="text-sm text-neutral-900 whitespace-pre-wrap">{selectedPost.caption}</p>
                </div>

                {selectedPost.hashtags && selectedPost.hashtags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-neutral-700 mb-1">Hashtags</p>
                    <p className="text-sm text-blue-600">{selectedPost.hashtags.join(' ')}</p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedPost.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                    selectedPost.status === 'published' ? 'bg-green-100 text-green-700' :
                    selectedPost.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-neutral-100 text-neutral-700'
                  }`}>
                    {selectedPost.status === 'scheduled' ? '📅 ' + t.library.calStatusScheduled :
                     selectedPost.status === 'published' ? '✅ ' + t.library.calStatusPublished :
                     selectedPost.status === 'failed' ? '❌ Échec' : selectedPost.status}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    onEditPost(selectedPost);
                    setSelectedPost(null);
                    setEditingTime(false);
                  }}
                  className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
                >
                  {t.library.calEdit}
                </button>
                <button
                  onClick={() => {
                    if (confirm(t.library.calConfirmDelete)) {
                      onDeletePost(selectedPost.id);
                      setSelectedPost(null);
                      setEditingTime(false);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                >
                  {t.library.calDelete}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Visitor preview */}
      {isVisitor && (
        <div>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <h3 className="text-base font-bold text-blue-900 mb-1">
                  {t.library.calVisitorTitle}
                </h3>
                <p className="text-sm text-blue-800">
                  {t.library.calVisitorDesc}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border-2 border-blue-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{t.library.calExampleTitle}</h3>
                <p className="text-sm text-neutral-600">{t.library.calExampleCount}</p>
              </div>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">
                {t.library.calPreview}
              </span>
            </div>

            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-7 bg-neutral-50 border-b border-neutral-200">
                {weekDays.map(day => (
                  <div key={day} className="p-2 text-center text-xs font-semibold text-neutral-700">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {[...Array(35)].map((_, i) => {
                  const day = i + 1;
                  const hasPost = day === 8 || day === 15 || day === 22;
                  return (
                    <div
                      key={i}
                      className={`min-h-[80px] border-b border-r border-neutral-100 p-2 ${
                        day > 31 ? 'bg-neutral-50' : 'bg-white'
                      }`}
                    >
                      {day <= 31 && (
                        <>
                          <div className="text-xs font-medium text-neutral-900 mb-1">{day}</div>
                          {hasPost && (
                            <div className="bg-blue-500 text-white text-[10px] rounded px-2 py-1 mb-1">
                              📷 {day === 8 ? '18h00' : day === 15 ? '12h30' : '19h15'}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-neutral-700 mb-2">📋 {t.library.calScheduledPublications}</p>
              <div className="flex items-center gap-2 text-xs text-neutral-700 bg-blue-50 rounded p-2">
                <span className="text-blue-500">→</span>
                <span className="font-medium">{t.library.calExPost1Date}</span>
                <span className="text-neutral-600">•</span>
                <span className="truncate flex-1">{t.library.calExPost1Text}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-700 bg-blue-50 rounded p-2">
                <span className="text-blue-500">→</span>
                <span className="font-medium">{t.library.calExPost2Date}</span>
                <span className="text-neutral-600">•</span>
                <span className="truncate flex-1">{t.library.calExPost2Text}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-700 bg-blue-50 rounded p-2">
                <span className="text-blue-500">→</span>
                <span className="font-medium">{t.library.calExPost3Date}</span>
                <span className="text-neutral-600">•</span>
                <span className="truncate flex-1">{t.library.calExPost3Text}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h4 className="font-bold text-neutral-900 mb-3">🎯 {t.library.calHowToTitle}</h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-neutral-700">
                <span className="font-semibold text-blue-600">1.</span>
                <span dangerouslySetInnerHTML={{ __html: t.library.calStep1 }} />
              </div>
              <div className="flex items-start gap-2 text-sm text-neutral-700">
                <span className="font-semibold text-blue-600">2.</span>
                <span dangerouslySetInnerHTML={{ __html: t.library.calStep2 }} />
              </div>
              <div className="flex items-start gap-2 text-sm text-neutral-700">
                <span className="font-semibold text-blue-600">3.</span>
                <span dangerouslySetInnerHTML={{ __html: t.library.calStep3 }} />
              </div>
              <div className="flex items-start gap-2 text-sm text-neutral-700">
                <span className="font-semibold text-blue-600">4.</span>
                <span>{t.library.calStep4}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
