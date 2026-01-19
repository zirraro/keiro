import { InstagramIcon, TrashIcon } from './Icons';

type InstagramDraft = {
  id: string;
  saved_image_id: string;
  image_url: string;
  caption: string;
  hashtags: string[];
  status: 'draft' | 'ready' | 'published';
  created_at: string;
  scheduled_for?: string;
};

interface InstagramDraftsTabProps {
  drafts: InstagramDraft[];
  onEdit: (draft: InstagramDraft) => void;
  onDelete: (draftId: string) => void;
  onPublish?: (draftId: string) => void;
}

export default function InstagramDraftsTab({ drafts, onEdit, onDelete, onPublish }: InstagramDraftsTabProps) {
  if (drafts.length === 0) {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-12 text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-6 shadow-lg">
          <InstagramIcon className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-neutral-900 mb-3">
          Aucun brouillon Instagram
        </h3>
        <p className="text-neutral-700 mb-6 max-w-md mx-auto">
          Transformez vos visuels en posts Instagram professionnels. Ajoutez des descriptions et des hashtags pour maximiser votre engagement.
        </p>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 max-w-lg mx-auto mb-6">
          <p className="text-sm text-neutral-700 font-medium mb-2">
            💡 Comment créer un brouillon ?
          </p>
          <ol className="text-sm text-neutral-600 text-left space-y-2">
            <li className="flex items-start gap-2">
              <span className="font-semibold text-purple-600">1.</span>
              <span>Allez dans l'onglet "Mes images"</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-purple-600">2.</span>
              <span>Survolez une image et cliquez sur "Préparer post"</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold text-purple-600">3.</span>
              <span>Ajoutez votre description et vos hashtags</span>
            </li>
          </ol>
        </div>
        <a
          href="#images-tab"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour aux images
        </a>
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {drafts.map((draft) => (
        <div key={draft.id} className="bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg transition-shadow">
          {/* Image */}
          <div className="aspect-square bg-neutral-100 relative">
            <img
              src={draft.image_url}
              alt="Instagram post preview"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute top-2 right-2">
              {getStatusBadge(draft.status)}
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
                  <span key={idx} className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
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
            <div className="flex gap-2">
              <button
                onClick={() => onEdit(draft)}
                className="flex-1 px-4 py-2 rounded-lg border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500"
                aria-label="Modifier le brouillon"
              >
                Modifier
              </button>

              {draft.status === 'ready' && onPublish && (
                <button
                  onClick={() => onPublish(draft.id)}
                  className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
                  aria-label="Publier sur Instagram"
                >
                  <InstagramIcon className="w-4 h-4 inline mr-1" />
                  Publier
                </button>
              )}

              <button
                onClick={() => onDelete(draft.id)}
                className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                title="Supprimer"
                aria-label="Supprimer le brouillon"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
