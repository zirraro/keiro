'use client';
import { useEffect, useMemo, useState } from "react";

type Props = {
  url: string;           // URL de l'article
  thumb?: string | null; // miniature fournie par le flux (souvent inutilisable)
  topic?: string | null; // business / technology / science / world / health / sports
  alt?: string;
  className?: string;
};

const BAD_RE = /(gstatic|googleusercontent|news\.google|google\.)/i;

function weserv(u: string) {
  try {
    const url = new URL(u);
    return `https://images.weserv.nl/?url=${encodeURIComponent(url.hostname + url.pathname + url.search)}&w=1200&h=630&fit=cover&we=1`;
  } catch { return u; }
}

const FALLBACKS: Record<string, string> = {
  business: weserv("https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?q=80&auto=format"),
  technology: weserv("https://images.unsplash.com/photo-1518779578993-ec3579fee39f?q=80&auto=format"),
  science: weserv("https://images.unsplash.com/photo-1559757175-08e3bba0488a?q=80&auto=format"),
  world: weserv("https://images.unsplash.com/photo-1505842465776-3bf2f19b43e0?q=80&auto=format"),
  health: weserv("https://images.unsplash.com/photo-1512069772995-ec4ae9b8a9d0?q=80&auto=format"),
  sports: weserv("https://images.unsplash.com/photo-1517649763962-0c623066013b?q=80&auto=format"),
  news: weserv("https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&auto=format"),
};

export default function SmartOgImage({ url, thumb, topic, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  // 1) si la miniature est valable et pas "GE google"
  const validThumb = useMemo(() => {
    if (!thumb) return null;
    if (BAD_RE.test(thumb)) return null;
    return weserv(thumb);
  }, [thumb]);

  // 2) fallback thématique
  const topicFallback = FALLBACKS[(topic || "news").toLowerCase()] || FALLBACKS.news;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // priorité: miniature si valable
      if (validThumb) { setSrc(validThumb); return; }

      // sinon tente l'OG côté serveur
      try {
        const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
        const j = await res.json();
        if (!cancelled && j?.image) {
          setSrc(j.image);
          return;
        }
      } catch { /* ignore */ }

      // fallback thématique propre
      if (!cancelled) setSrc(topicFallback);
    }

    run();
    return () => { cancelled = true; };
  }, [url, validThumb, topicFallback]);

  return (
    <img
      src={src || topicFallback}
      alt={alt || "aperçu article"}
      className={className}
      loading="lazy"
    />
  );
}
