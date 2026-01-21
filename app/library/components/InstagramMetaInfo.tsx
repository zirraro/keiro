'use client';

interface InstagramMetaInfoProps {
  onLearnMore?: () => void;
}

export default function InstagramMetaInfo({ onLearnMore }: InstagramMetaInfoProps) {
  return (
    <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Icône info */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-md">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* Contenu */}
        <div className="flex-1">
          <h4 className="font-bold text-neutral-900 text-sm mb-1 flex items-center gap-2">
            📱 Publication automatique sur Instagram
          </h4>
          <p className="text-xs text-neutral-700 leading-relaxed mb-3">
            Pour publier automatiquement sur Instagram, vous devez connecter votre compte via <strong>Meta Business Suite</strong>.
            Votre compte Instagram doit être <strong>professionnel</strong> et lié à une <strong>Page Facebook</strong>.
          </p>

          {/* Points clés */}
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></div>
              <span className="text-neutral-600">Compte Instagram <strong>professionnel</strong> requis</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0"></div>
              <span className="text-neutral-600">Lié à une <strong>Page Facebook Business</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-pink-500 flex-shrink-0"></div>
              <span className="text-neutral-600">Configuration via <strong>Meta Business Suite</strong></span>
            </div>
          </div>

          {/* CTA */}
          {onLearnMore && (
            <button
              onClick={onLearnMore}
              className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors group"
            >
              <span>En savoir plus sur la configuration</span>
              <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
