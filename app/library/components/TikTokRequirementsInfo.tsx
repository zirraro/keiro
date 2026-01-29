'use client';

import { useState } from 'react';

export default function TikTokRequirementsInfo() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
        type="button"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <span>Exigences TikTok</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-neutral-200 z-50 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <svg className="w-6 h-6 text-cyan-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
                Exigences TikTok
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* Format */}
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                <h4 className="font-semibold text-cyan-900 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/>
                  </svg>
                  Format Vidéo
                </h4>
                <ul className="space-y-1 text-cyan-900">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 font-bold">✓</span>
                    <span>Container: MP4 (recommandé), MOV, WebM, AVI</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 font-bold">✓</span>
                    <span>Codec vidéo: H.264 (obligatoire)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 font-bold">✓</span>
                    <span>Codec audio: AAC (obligatoire)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600 font-bold">✗</span>
                    <span>Pas de H.265, VP9, MP3, Opus</span>
                  </li>
                </ul>
              </div>

              {/* Spécifications */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 000 2h6a1 1 0 100-2H7zm6 7a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-3 3a1 1 0 100 2h.01a1 1 0 100-2H10zm-4 1a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1zm1-4a1 1 0 100 2h.01a1 1 0 100-2H7zm2 1a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm4-4a1 1 0 100 2h.01a1 1 0 100-2H13zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zM7 8a1 1 0 000 2h.01a1 1 0 000-2H7z" clipRule="evenodd"/>
                  </svg>
                  Spécifications Techniques
                </h4>
                <ul className="space-y-1 text-purple-900">
                  <li><strong>Résolution:</strong> 540p - 1080p (recommandé: 1080x1920)</li>
                  <li><strong>Aspect ratio:</strong> 9:16 (vertical), 1:1, ou 16:9</li>
                  <li><strong>Durée:</strong> Minimum 3 secondes</li>
                  <li><strong>Taille:</strong> Maximum 100MB recommandé</li>
                  <li><strong>Framerate:</strong> 23-60 FPS</li>
                </ul>
              </div>

              {/* Restrictions */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/>
                  </svg>
                  Restrictions
                </h4>
                <ul className="space-y-1 text-red-900">
                  <li className="flex items-start gap-2">
                    <span>❌</span>
                    <span>Pas de watermark d'autres plateformes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>❌</span>
                    <span>Pas de contenu dupliqué</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>✅</span>
                    <span>Audio obligatoire (même silence)</span>
                  </li>
                </ul>
              </div>

              {/* Commande FFmpeg */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                <h4 className="font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
                  </svg>
                  Conversion FFmpeg
                </h4>
                <p className="text-neutral-600 mb-2">Si votre vidéo n'est pas conforme:</p>
                <div className="bg-black rounded px-3 py-2 overflow-x-auto">
                  <code className="text-green-400 text-xs font-mono whitespace-nowrap">
                    ffmpeg -i input.mp4 -c:v libx264 -c:a aac -b:a 128k output.mp4
                  </code>
                </div>
              </div>

              {/* Outils recommandés */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Outils de Conversion</h4>
                <ul className="space-y-1 text-blue-900 text-xs">
                  <li>• <strong>HandBrake</strong> (gratuit, facile)</li>
                  <li>• <strong>CloudConvert</strong> (en ligne)</li>
                  <li>• <strong>FFmpeg</strong> (ligne de commande)</li>
                </ul>
              </div>

              {/* Documentation */}
              <div className="text-center pt-2">
                <a
                  href="/TIKTOK_REQUIREMENTS.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Voir le guide complet (TIKTOK_REQUIREMENTS.md)
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
