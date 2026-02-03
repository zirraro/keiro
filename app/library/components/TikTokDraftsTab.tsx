import { useState } from 'react';
import { TrashIcon } from './Icons';

export type TikTokDraft = {
  id: string;
  saved_image_id?: string;
  video_id?: string;
  media_url: string; // Renamed from image_url
  media_type: 'image' | 'video';
  caption: string;
  hashtags: string[];
  status: 'draft' | 'ready' | 'published';
  category: 'draft' | 'converted' | 'published';
  created_at: string;
  scheduled_for?: string;
};

interface TikTokDraftsTabProps {
  drafts: TikTokDraft[];
  onEdit: (draft: TikTokDraft) => void;
  onDelete: (draftId: string) => void;
  onPublish?: (draftId: string) => void;
  onSchedule?: (draft: TikTokDraft) => void;
  onBackToImages?: () => void;
}

export default function TikTokDraftsTab({ drafts, onEdit, onDelete, onPublish, onSchedule, onBackToImages }: TikTokDraftsTabProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | 'draft' | 'converted' | 'published'>('all');

  // Filter drafts by category
  const filteredDrafts = activeCategory === 'all'
    ? drafts
    : drafts.filter(d => d.category === activeCategory);

  // Count drafts by category
  const countByCategory = {
    draft: drafts.filter(d => d.category === 'draft').length,
    converted: drafts.filter(d => d.category === 'converted').length,
    published: drafts.filter(d => d.category === 'published').length
  };

  if (drafts.length === 0) {
    return (
      <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl border border-cyan-200 p-12 text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mx-auto mb-6 shadow-lg">
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-neutral-900 mb-3">
          Aucun brouillon TikTok
        </h3>
        <p className="text-neutral-700 mb-6 max-w-md mx-auto">
          Transformez vos visuels en vidéos TikTok virales. Ajoutez des descriptions engageantes et des hashtags tendance.
        </p>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 max-w-lg mx-auto mb-6">
          <p className="text-sm text-neutral-700 font-medium mb-2">
            💡 Comment créer un brouillon TikTok ?
          </p>
          <ol className="text-sm text-neutral-600 text-left space-y-2">
            <li className="flex items-start gap-2">
              <span className="font-semibold text-cyan-600">1.</span>
              <span>Cliquez sur "Préparer un post" dans le widget TikTok</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-cyan-600">2.</span>
              <span>Sélectionnez une image (convertie auto en vidéo 9:16)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-cyan-600">3.</span>
              <span>Ajoutez description et hashtags (#fyp #viral #foryou)</span>
            </li>
          </ol>
        </div>
        <button
          onClick={() => {
            if (onBackToImages) {
              onBackToImages();
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold hover:from-cyan-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour aux images
        </button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return (
          <span className="px-2 py-1 rounded-full bg-neutral-100 text-neutral-700 text-xs font-medium">
            📝 Brouillon
          </span>
        );
      case 'ready':
        return (
          <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
            ✓ Prêt à publier
          </span>
        );
      case 'published':
        return (
          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
            ✓ Publié
          </span>
        );
      default:
        return null;
    }
  };

  const getCategoryBadge = (category: string, mediaType: string) => {
    const mediaIcon = mediaType === 'video' ? '🎬' : '📸';

    switch (category) {
      case 'draft':
        return (
          <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
            {mediaIcon} Brouillon
          </span>
        );
      case 'converted':
        return (
          <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
            {mediaIcon} Convertie
          </span>
        );
      case 'published':
        return (
          <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
            {mediaIcon} Publiée
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            activeCategory === 'all'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          🎯 Tous ({drafts.length})
        </button>
        <button
          onClick={() => setActiveCategory('draft')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            activeCategory === 'draft'
              ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-md'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          📝 Brouillons ({countByCategory.draft})
        </button>
        <button
          onClick={() => setActiveCategory('converted')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            activeCategory === 'converted'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-md'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          🎬 Converties ({countByCategory.converted})
        </button>
        <button
          onClick={() => setActiveCategory('published')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            activeCategory === 'published'
              ? 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-md'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          ✅ Publiées ({countByCategory.published})
        </button>
      </div>

      {/* Message si pas de résultats pour cette catégorie */}
      {filteredDrafts.length === 0 && drafts.length > 0 && (
        <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-8 text-center">
          <p className="text-neutral-600">
            Aucun brouillon dans cette catégorie
          </p>
        </div>
      )}

      {/* Grille de brouillons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDrafts.map((draft) => (
        <div key={draft.id} className="bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg transition-shadow">
          {/* Image/Video - Format TikTok avec hauteur réduite */}
          <div className="aspect-[9/16] max-h-[400px] bg-gradient-to-br from-cyan-50 to-blue-50 relative">
            <img
              src={draft.media_url}
              alt="TikTok video preview"
              className="w-full h-full object-contain"
              loading="lazy"
            />
            {/* Category Badge */}
            <div className="absolute top-2 right-2">
              {getCategoryBadge(draft.category, draft.media_type)}
            </div>
            {/* Status Badge */}
            <div className="absolute top-2 left-2">
              {getStatusBadge(draft.status)}
            </div>
            {/* Video indicator (always show since TikTok is video format) */}
            <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded flex items-center gap-1">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              <span className="text-white text-xs font-medium">
                {draft.media_type === 'video' ? 'Vidéo' : '5s'}
              </span>
            </div>
          </div>

          {/* Contenu */}
          <div className="p-4">
            {/* Caption preview */}
            <p className="text-sm text-neutral-700 line-clamp-3 mb-3">
              {draft.caption || 'Pas de description'}
            </p>

            {/* Hashtags preview */}
            {draft.hashtags && draft.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {draft.hashtags.slice(0, 3).map((tag, idx) => (
                  <span key={idx} className="text-xs text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
                {draft.hashtags.length > 3 && (
                  <span className="text-xs text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded">
                    +{draft.hashtags.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Date */}
            <p className="text-xs text-neutral-400 mb-4">
              Créé le {new Date(draft.created_at).toLocaleDateString('fr-FR')}
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(draft)}
                  className="flex-1 px-4 py-2 rounded-lg border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500"
                  aria-label="Modifier le brouillon"
                >
                  Modifier
                </button>

                <button
                  onClick={() => onDelete(draft.id)}
                  className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                  title="Supprimer"
                  aria-label="Supprimer le brouillon"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>

              {onSchedule && (
                <button
                  onClick={() => onSchedule(draft)}
                  className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:from-green-600 hover:to-emerald-600 transition-all focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center justify-center gap-2"
                  aria-label="Ajouter au planning"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  📅 Ajouter au planning
                </button>
              )}

              {draft.status === 'ready' && onPublish && (
                <button
                  onClick={() => onPublish(draft.id)}
                  className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium hover:from-cyan-700 hover:to-blue-700 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500 flex items-center justify-center gap-1"
                  aria-label="Publier sur TikTok"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                  </svg>
                  Publier maintenant
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
