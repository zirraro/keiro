import { useState } from 'react';
import { LinkedInIcon, TrashIcon } from './Icons';

export type LinkedInDraft = {
  id: string;
  saved_image_id?: string;
  video_id?: string;
  media_url: string;
  media_type: 'image' | 'video' | 'text-only';
  caption: string;
  hashtags: string[];
  status: 'draft' | 'ready' | 'published';
  category: 'draft' | 'published';
  created_at: string;
  scheduled_for?: string;
};

interface LinkedInDraftsTabProps {
  drafts: LinkedInDraft[];
  onEdit: (draft: LinkedInDraft) => void;
  onDelete: (draftId: string) => void;
  onSchedule?: (draft: LinkedInDraft) => void;
  onPrepareLinkedIn?: () => void;
  linkedinConnected?: boolean;
  onPublish?: (draft: LinkedInDraft) => void;
  onSaveCaption?: (draftId: string, caption: string) => void;
}

export default function LinkedInDraftsTab({ drafts, onEdit, onDelete, onSchedule, onPrepareLinkedIn, linkedinConnected, onPublish, onSaveCaption }: LinkedInDraftsTabProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | 'draft' | 'published'>('all');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editedCaption, setEditedCaption] = useState<string>('');

  const filteredDrafts = activeCategory === 'all'
    ? drafts
    : drafts.filter(d => d.category === activeCategory);

  const countByCategory = {
    draft: drafts.filter(d => d.category === 'draft').length,
    published: drafts.filter(d => d.category === 'published').length
  };

  const handleSaveCaption = (draft: LinkedInDraft) => {
    if (editedCaption.trim() && editedCaption !== draft.caption) {
      if (onSaveCaption) {
        onSaveCaption(draft.id, editedCaption.trim());
      } else {
        onEdit({ ...draft, caption: editedCaption.trim() });
      }
    }
    setEditingDraftId(null);
  };

  if (drafts.length === 0) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl border border-blue-200 p-12 text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#0077B5] to-blue-600 flex items-center justify-center mx-auto mb-6 shadow-lg">
          <LinkedInIcon className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-neutral-900 mb-2">
          Aucun brouillon LinkedIn
        </h3>
        <p className="text-neutral-700 mb-6 max-w-md mx-auto">
          Transformez vos visuels en posts LinkedIn professionnels. Ajoutez des descriptions et des hashtags pour maximiser votre visibilité.
        </p>
        <button
          onClick={onPrepareLinkedIn}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#0077B5] to-blue-600 text-white font-semibold hover:from-[#005f8f] hover:to-blue-700 transition-all shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Préparer un post LinkedIn
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
    const mediaIcon = mediaType === 'video' ? '🎬' : mediaType === 'text-only' ? '📝' : '📸';
    switch (category) {
      case 'draft':
        return (
          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
            {mediaIcon} Brouillon
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
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            activeCategory === 'all'
              ? 'bg-gradient-to-r from-[#0077B5] to-blue-600 text-white shadow-md'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          🎯 Tous ({drafts.length})
        </button>
        <button
          onClick={() => setActiveCategory('draft')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            activeCategory === 'draft'
              ? 'bg-gradient-to-r from-[#0077B5] to-blue-500 text-white shadow-md'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          📝 Brouillons ({countByCategory.draft})
        </button>
        <button
          onClick={() => setActiveCategory('published')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            activeCategory === 'published'
              ? 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-md'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          ✅ Publiés ({countByCategory.published})
        </button>
      </div>

      {filteredDrafts.length === 0 && drafts.length > 0 && (
        <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-8 text-center">
          <p className="text-neutral-600">Aucun brouillon dans cette catégorie</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredDrafts.map((draft) => (
          <div key={draft.id} className="bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
            {/* Preview zone - image/video/texte */}
            {draft.media_url && draft.media_type !== 'text-only' ? (
              <div className="h-36 bg-gradient-to-br from-blue-50 to-sky-50 relative">
                {draft.media_type === 'video' ? (
                  <video
                    src={draft.media_url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                  />
                ) : (
                  <img src={draft.media_url} alt="LinkedIn post preview" className="w-full h-full object-cover" loading="lazy" />
                )}
                <div className="absolute top-2 left-2">
                  {getStatusBadge(draft.status)}
                </div>
                <div className="absolute top-2 right-2">
                  {getCategoryBadge(draft.category, draft.media_type)}
                </div>
                {draft.media_type === 'video' && (
                  <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded flex items-center gap-1">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                    <span className="text-white text-xs font-medium">Vidéo</span>
                  </div>
                )}
              </div>
            ) : (
              /* Aperçu texte-seul style LinkedIn */
              <div className="h-36 bg-gradient-to-br from-blue-50 to-sky-50 relative overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#0077B5] to-blue-600 flex items-center justify-center flex-shrink-0">
                      <LinkedInIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-800">Post LinkedIn</p>
                      <p className="text-[10px] text-neutral-500">Texte seul</p>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-700 line-clamp-4 leading-relaxed">{draft.caption || 'Pas de texte'}</p>
                </div>
                <div className="absolute top-2 right-2">
                  {getCategoryBadge(draft.category, draft.media_type)}
                </div>
              </div>
            )}

            {/* Contenu - identique au format TikTok */}
            <div className="p-3 flex flex-col flex-1">
              {/* Caption preview - Cliquable pour édition inline (TOUJOURS affiché) */}
              {editingDraftId === draft.id ? (
                <div className="mb-2">
                  <textarea
                    value={editedCaption}
                    onChange={(e) => setEditedCaption(e.target.value)}
                    onBlur={() => handleSaveCaption(draft)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        handleSaveCaption(draft);
                      }
                      if (e.key === 'Escape') {
                        setEditingDraftId(null);
                      }
                    }}
                    className="w-full text-sm text-neutral-700 border border-blue-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={3}
                    autoFocus
                  />
                  <p className="text-xs text-neutral-400 mt-1">Ctrl+Entrée pour sauvegarder, Échap pour annuler</p>
                </div>
              ) : (
                <p
                  onClick={() => {
                    setEditingDraftId(draft.id);
                    setEditedCaption(draft.caption || '');
                  }}
                  className="text-sm text-neutral-700 line-clamp-3 mb-2 cursor-pointer hover:text-blue-600 hover:bg-blue-50 rounded p-1 transition-colors"
                  title="Cliquer pour modifier la description"
                >
                  {draft.caption || 'Pas de description (cliquer pour ajouter)'}
                </p>
              )}

              {/* Hashtags preview */}
              {draft.hashtags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {draft.hashtags.slice(0, 3).map((tag, idx) => (
                    <span key={idx} className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{tag}</span>
                  ))}
                  {draft.hashtags.length > 3 && (
                    <span className="text-xs text-neutral-500 bg-neutral-50 px-2 py-0.5 rounded">+{draft.hashtags.length - 3}</span>
                  )}
                </div>
              )}

              <p className="text-xs text-neutral-400 mb-2">Créé le {new Date(draft.created_at).toLocaleDateString('fr-FR')}</p>

              {/* Actions - EXACTEMENT comme TikTok : Continuer → Supprimer → Planifier */}
              <div className="flex flex-col gap-1.5 mt-auto">
                <button onClick={() => onEdit(draft)} className="w-full px-2 py-1.5 rounded-lg bg-gradient-to-r from-[#0077B5] to-blue-600 text-white text-xs font-semibold hover:from-[#005f8f] hover:to-blue-700 transition-all flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Continuer
                </button>
                <button onClick={() => onDelete(draft.id)} className="w-full px-2 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-xs font-medium flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Supprimer
                </button>
                {onSchedule && draft.category !== 'published' && (
                  <button onClick={() => onSchedule(draft)} className="w-full px-2 py-1.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-semibold hover:from-green-600 hover:to-emerald-600 transition-all flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Planifier
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
