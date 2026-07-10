"use client";

import { useMemo, useState, useEffect } from 'react';

/**
 * Wrapper around <img> that requests a WebP-optimized variant from
 * Supabase Storage Image Transformation when the source is a Supabase
 * public URL. Used for IN-APP DISPLAY ONLY (gallery thumbnails, modal
 * preview, etc.) — NEVER touch the original asset that ships to
 * Instagram/TikTok/LinkedIn.
 *
 * Founder rule 2026-06-09 : "optimise image cdn ect mais sans réduire
 * la qualité des posts". So we serve high-quality WebP for display
 * (≈ -40% size, no visible quality drop on screen) while publications
 * continue to use the untouched original JPEG/PNG.
 *
 * Supabase Image Transformation API :
 *   https://<project>.supabase.co/storage/v1/render/image/public/<bucket>/<path>?width=W&quality=Q&format=auto
 * - format=auto → WebP if browser supports it
 * - quality=80 → barely visible loss on UI screens
 *
 * Pass `original` to bypass and serve the original (useful when an
 * uploader needs the source file).
 */
interface DisplayImageProps {
  src: string | null | undefined;
  alt?: string;
  width?: number;     // intended display width (for transformation)
  height?: number;
  quality?: number;   // default 80
  original?: boolean; // bypass transformation
  className?: string;
  style?: React.CSSProperties;
  loading?: 'eager' | 'lazy';
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  draggable?: boolean;
  decoding?: 'sync' | 'async' | 'auto';
  title?: string;
}

function toRenderUrl(src: string, width?: number, quality = 80): string {
  // Only transform Supabase public storage URLs.
  // Pattern: https://<id>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const m = src.match(/^(https:\/\/[^/]+\.supabase\.co)\/storage\/v1\/object\/public\/(.+)$/);
  if (!m) return src;
  const base = m[1];
  const rest = m[2];
  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  params.set('quality', String(quality));
  // NOTE: do NOT send format=auto — Supabase's transformation API rejects it
  // (400 "format must be equal to one of the allowed values") and that broke
  // EVERY gallery thumbnail. Omitting format lets Supabase auto-serve WebP
  // based on the browser's Accept header (verified: 200 image/webp).
  // Resize hint — fit instead of cover so we never crop unexpectedly
  params.set('resize', 'contain');
  return `${base}/storage/v1/render/image/public/${rest}?${params.toString()}`;
}

export default function DisplayImage({
  src,
  alt = '',
  width,
  height,
  quality = 80,
  original = false,
  className,
  style,
  loading = 'lazy',
  onClick,
  onError,
  draggable,
  decoding = 'async',
  title,
}: DisplayImageProps) {
  const finalSrc = useMemo(() => {
    if (!src) return '';
    if (original) return src;
    return toRenderUrl(src, width, quality);
  }, [src, width, quality, original]);

  // If the transformed (render) URL fails for any reason, fall back to the
  // untouched original so a thumbnail is never broken.
  const [imgSrc, setImgSrc] = useState(finalSrc);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setImgSrc(finalSrc); setFailed(false); }, [finalSrc]);

  // Échec définitif (URL transformée ET originale cassées) → on se retire pour
  // laisser apparaître le placeholder du parent, plutôt qu'une image cassée sur
  // fond noir (founder vidéo 10/07).
  if (!finalSrc || failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc || src || ''}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      className={className}
      style={style}
      onClick={onClick}
      onError={(e) => {
        if (src && imgSrc !== src) { setImgSrc(src); return; } // retry with original
        setFailed(true);
        onError?.(e);
      }}
      draggable={draggable}
      title={title}
    />
  );
}
