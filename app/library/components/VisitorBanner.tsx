import { PhotoIcon } from './Icons';

export default function VisitorBanner() {
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
            Connectez-vous pour sauvegarder vos visuels, préparer vos posts Instagram et bien plus encore
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <a
            href="/login"
            className="px-6 py-3 rounded-lg bg-white text-blue-600 font-semibold hover:bg-blue-50 transition-colors shadow-md"
          >
            Se connecter
          </a>
          <a
            href="/generate"
            className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors border-2 border-white"
          >
            Générer un visuel
          </a>
        </div>
      </div>
    </div>
  );
}
