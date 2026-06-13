'use client';

/**
 * "Continuer le brouillon sur Insta / TikTok / LinkedIn" — assisted publish.
 *
 * Léna prépare tout (visuel/reel + légende + hashtags). Ce bouton amène le
 * contenu dans l'app de la plateforme SUR LE TÉLÉPHONE DU CLIENT, où il est déjà
 * connecté à SON compte — aucune connexion OAuth requise, donc immunisé aux
 * changements de politique API (si l'auto-publish saute, ça marche toujours).
 *
 * Stratégie (friction minimale par plateforme) :
 *  - Mobile : Web Share API (navigator.share avec le fichier média) → la feuille
 *    de partage ouvre l'app choisie avec le média chargé. La légende est aussi
 *    copiée dans le presse-papier (IG feed ne pré-remplit pas → 1 collage).
 *  - Desktop : télécharge le média + copie la légende + ouvre la plateforme.
 */
import { useState } from 'react';

type Platform = 'instagram' | 'tiktok' | 'linkedin';

const META: Record<Platform, { label: string; emoji: string; web: string; app?: string }> = {
  instagram: { label: 'Instagram', emoji: '📸', web: 'https://www.instagram.com/', app: 'instagram://library' },
  tiktok: { label: 'TikTok', emoji: '🎵', web: 'https://www.tiktok.com/upload', app: 'snssdk1233://' },
  linkedin: { label: 'LinkedIn', emoji: '💼', web: 'https://www.linkedin.com/feed/' },
};

export function ContinueDraftButton({
  platform,
  mediaUrl,
  caption,
  hashtags = [],
  className = '',
}: {
  platform: Platform;
  mediaUrl?: string | null;
  caption?: string;
  hashtags?: string[];
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'copied'>('idle');
  const m = META[platform];
  const fullText = [caption?.trim(), hashtags.length ? hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ') : '']
    .filter(Boolean)
    .join('\n\n');

  const go = async () => {
    setState('working');
    // Always put the caption on the clipboard so the client can paste it
    // wherever the app doesn't pre-fill it (IG feed).
    try { await navigator.clipboard?.writeText(fullText); } catch { /* clipboard may be blocked */ }

    // Mobile: share the actual media file into the platform app.
    try {
      if (mediaUrl && typeof navigator !== 'undefined' && (navigator as any).canShare) {
        const resp = await fetch(mediaUrl);
        const blob = await resp.blob();
        const isVideo = blob.type.includes('video');
        const file = new File([blob], `keiro-post.${isVideo ? 'mp4' : 'jpg'}`, { type: blob.type || (isVideo ? 'video/mp4' : 'image/jpeg') });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({ files: [file], text: fullText });
          setState('done');
          return;
        }
      }
    } catch { /* user cancelled or share unsupported → fall through */ }

    // Desktop / no-share fallback: download the media, then open the platform.
    try {
      if (mediaUrl) {
        const a = document.createElement('a');
        a.href = mediaUrl;
        a.download = `keiro-${platform}`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch { /* ignore */ }
    // Try the native app deep link, fall back to web after a beat.
    const opened = Date.now();
    if (m.app) { try { window.location.href = m.app; } catch { /* ignore */ } }
    setTimeout(() => {
      if (Date.now() - opened < 1500) { try { window.open(m.web, '_blank'); } catch { /* ignore */ } }
    }, 600);
    setState('copied');
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={go}
        disabled={state === 'working'}
        className={className || `inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60`}
        title={`Ouvre ${m.label} avec ton post prêt — légende copiée`}
      >
        {m.emoji} {state === 'working' ? 'Préparation…' : `Continuer sur ${m.label}`}
      </button>
      {(state === 'copied' || state === 'done') && (
        <span className="text-[11px] text-emerald-500">✓ Légende copiée — colle-la dans {m.label} si besoin</span>
      )}
    </div>
  );
}
