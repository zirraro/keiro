import { InstagramIcon } from './Icons';

interface InstagramPreviewCardProps {
  user: any;
  draftCount: number;
  onOpenModal: () => void;
}

export default function InstagramPreviewCard({ user, draftCount, onOpenModal }: InstagramPreviewCardProps) {
  if (!user) return null;

  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
            <InstagramIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Espace Instagram</h3>
            <p className="text-sm text-neutral-600">
              {draftCount} brouillon{draftCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onOpenModal}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-700 hover:to-pink-700 transition-colors flex items-center gap-2"
        >
          <InstagramIcon className="w-4 h-4" />
          Préparer un post
        </button>
      </div>
    </div>
  );
}
