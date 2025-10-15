'use client';
import * as React from 'react';

type Props = {
  url?: string | null;          // URL de l'article (pour /api/og)
  topic?: string | null;        // business | technology | ...
  fallback?: string | null;     // éventuelle miniature fournie par ton flux
  alt?: string;
  className?: string;
  imgClassName?: string;
  height?: number;
};

const FALLBACKS: Record<string, string> = {
  business: '/fallback/business.svg',
  technology: '/fallback/technology.svg',
  science: '/fallback/science.svg',
  world: '/fallback/world.svg',
  health: '/fallback/health.svg',
  sports: '/fallback/sports.svg',
  default: '/fallback/default.svg',
};

export default function OgImg({
  url,
  topic,
  fallback,
  alt = 'aperçu',
  className = 'w-full h-[180px] rounded-xl overflow-hidden bg-gray-100',
  imgClassName = 'w-full h-full object-cover',
  height = 180,
}: Props) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  const topicFallback = FALLBACKS[(topic || '').toLowerCase()] ?? FALLBACKS.default;

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      // priorité: /api/og ? fallback prop ? fallback de catégorie
      try {
        if (url) {
          const q = '/api/og?url=' + encodeURIComponent(url);
          const res = await fetch(q, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (mounted && data?.image) {
              setSrc(data.image);
              setLoading(false);
              return;
            }
          }
        }
      } catch (_) {
        // ignore -> pass to fallback chain
      }

      if (mounted) {
        setSrc(fallback || topicFallback);
        setLoading(false);
      }
    }

    run();
    return () => { mounted = false; };
  }, [url, fallback, topic, topicFallback]);

  const handleError: React.ReactEventHandler<HTMLImageElement> = () => {
    if (src !== topicFallback) setSrc(topicFallback);
  };

  return (
    <div className={className} style={{ minHeight: height }}>
      {loading ? (
        <div className="w-full h-full animate-pulse bg-gradient-to-br from-gray-100 to-gray-200" />
      ) : (
        <img
          src={src || topicFallback}
          alt={alt}
          className={imgClassName}
          onError={handleError}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
}
