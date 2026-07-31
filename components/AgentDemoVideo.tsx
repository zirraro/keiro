'use client';

import { useRef, useState } from 'react';
import { AGENT_VIDEOS } from '@/lib/marketing/agent-videos';

/**
 * Démonstration vidéo d'un agent, sur la carte d'accueil.
 *
 * Les vidéos sont tournées en capture d'écran SANS SON : elles se lancent donc
 * en sourdine au survol (ou au tap sur mobile), en boucle, et le résumé texte
 * sous la vidéo porte le message pour ceux qui ne regardent pas.
 *
 * Si la vidéo de cet agent n'est pas encore tournée, le composant ne rend
 * RIEN : la carte reste exactement comme aujourd'hui, sans emplacement vide ni
 * lecteur cassé.
 */
export default function AgentDemoVideo({ agentId, label }: { agentId: string; label?: string }) {
  const video = AGENT_VIDEOS[agentId];
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  if (!video?.src) return null;

  const start = () => { ref.current?.play().then(() => setPlaying(true)).catch(() => {}); };
  const stop = () => { const v = ref.current; if (!v) return; v.pause(); v.currentTime = 0; setPlaying(false); };

  return (
    <div
      className="mt-2 rounded-xl overflow-hidden border border-neutral-200 bg-black/90 relative group/vid"
      onMouseEnter={start}
      onMouseLeave={stop}
      onClick={() => (playing ? stop() : start())}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playing ? stop() : start(); } }}
      aria-label={`Démonstration : ${video.resume}`}
    >
      <video
        ref={ref}
        src={video.src}
        poster={video.poster}
        muted
        loop
        playsInline
        preload="metadata"
        className="w-full aspect-video object-cover"
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-black/60 px-2.5 py-1 rounded-full">
            ▶ {label || 'Voir'} · {video.duree}
          </span>
        </div>
      )}
    </div>
  );
}
