'use client';

import { useState, useMemo } from 'react';

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
}

export default function CalendarTab({ scheduledPosts, onEditPost, onDeletePost }: CalendarTabProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);

  // Générer les jours du mois
  const { daysInMonth, firstDayOfMonth, prevMonthDays, nextMonthDays } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const firstDayOfWeek = firstDay.getDay(); // 0 = Dimanche
    const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Lundi = 0

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

  // Grouper les posts par jour
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
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const getPlatformEmoji = (platform: string) => {
    switch (platform) {
      case 'instagram': return '📷';
      case 'facebook': return '👥';
      case 'linkedin': return '💼';
      case 'twitter': return '🐦';
      default: return '📱';
    }
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  return (
    <div className="space-y-6">
      {/* Auto-Publish Banner avec aperçu */}
      {scheduledPosts.length > 0 && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">🤖</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 mb-1">
                Publication automatique activée
              </p>
              <p className="text-xs text-blue-800">
                Keiro publiera automatiquement vos posts aux dates et heures programmées. Vous recevrez une confirmation par email.
              </p>
            </div>
          </div>

          {/* Aperçu des 3 prochaines publications */}
          <div className="bg-white rounded-lg p-3 border border-blue-200">
            <p className="text-xs font-semibold text-blue-900 mb-2">📆 Prochaines publications automatiques :</p>
            <div className="space-y-2">
              {scheduledPosts
                .filter(post => new Date(post.scheduled_for) > new Date())
                .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())
                .slice(0, 3)
                .map(post => (
                  <div key={post.id} className="flex items-center gap-2 text-xs">
                    <span className="text-blue-500">→</span>
                    <span className="font-medium text-neutral-900">
                      {new Date(post.scheduled_for).toLocaleDateString('fr-FR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short'
                      })} à {new Date(post.scheduled_for).toLocaleTimeString('fr-FR', {
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
            {scheduledPosts.length} publication{scheduledPosts.length > 1 ? 's' : ''} planifiée{scheduledPosts.length > 1 ? 's' : ''}
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
            Aujourd'hui
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
        {/* Week Days Header */}
        <div className="grid grid-cols-7 bg-neutral-50 border-b border-neutral-200">
          {weekDays.map(day => (
            <div key={day} className="p-3 text-center text-sm font-semibold text-neutral-700">
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
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

                {/* Posts for this day */}
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
                          {new Date(post.scheduled_for).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </button>
                  ))}

                  {posts.length > 3 && (
                    <div className="text-xs text-neutral-500 text-center">
                      +{posts.length - 3} autre{posts.length - 3 > 1 ? 's' : ''}
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPost(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                    {getPlatformEmoji(selectedPost.platform)} Publication planifiée
                  </h3>
                  <p className="text-sm text-neutral-600 mt-1">
                    {new Date(selectedPost.scheduled_for).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPost(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <img
                src={selectedPost.image_url}
                alt="Post"
                className="w-full aspect-square object-cover rounded-lg mb-4"
              />

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
                    'bg-neutral-100 text-neutral-700'
                  }`}>
                    {selectedPost.status === 'scheduled' ? '📅 Planifié' :
                     selectedPost.status === 'published' ? '✅ Publié' : selectedPost.status}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    onEditPost(selectedPost);
                    setSelectedPost(null);
                  }}
                  className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
                >
                  Modifier
                </button>
                <button
                  onClick={() => {
                    if (confirm('Supprimer cette publication planifiée ?')) {
                      onDeletePost(selectedPost.id);
                      setSelectedPost(null);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {scheduledPosts.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📅</div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">Aucune publication planifiée</h3>
          <p className="text-neutral-600 mb-6">
            Commencez à planifier vos publications depuis l'onglet "Mes images"
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all"
          >
            Retour à mes images
          </button>
        </div>
      )}
    </div>
  );
}
