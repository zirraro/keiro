import { PhotoIcon } from './Icons';

interface VisitorBannerProps {
  onStartFree?: () => void;
}

export default function VisitorBanner({ onStartFree }: VisitorBannerProps) {
  return (
    <div className="mb-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-6 text-white shadow-lg">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
            <PhotoIcon className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Mode Visiteur</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold mb-1">Découvrez votre futur espace de travail</h2>
          <p className="text-blue-100 text-sm md:text-base">
            Uploadez des images et créez votre premier brouillon Instagram gratuitement
          </p>
        </div>
        <div className="flex flex-wrap gap-3 flex-shrink-0 justify-center">
          <button
            onClick={onStartFree}
            className="px-6 py-3 rounded-lg bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
          >
            <span>Commencer gratuitement</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
          <a
            href="/login"
            className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors border-2 border-white"
          >
            Se connecter
          </a>
        </div>
      </div>
    </div>
  );
}
