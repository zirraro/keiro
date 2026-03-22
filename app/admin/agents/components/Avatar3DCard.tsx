'use client';

import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

// ─── Animation keyframes (injected once globally) ────────────────────────────

const ANIMATION_STYLES = `
@keyframes ring-glow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.7; }
}
@keyframes ring-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 15px rgba(255,255,255,0.06); }
  50% { box-shadow: 0 0 30px rgba(255,255,255,0.14); }
}
@keyframes float-badge {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-2px); }
}
@media (prefers-reduced-motion: reduce) {
  .avatar-animated, .avatar-animated * {
    animation: none !important;
    transition: none !important;
  }
}
`;

let stylesInjected = false;
function useAvatarStyles() {
  useEffect(() => {
    if (stylesInjected || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.setAttribute('data-avatar-3d', 'true');
    style.textContent = ANIMATION_STYLES;
    document.head.appendChild(style);
    stylesInjected = true;
  }, []);
}

type AnimationType = 'idle' | 'wave' | 'thinking' | 'talking' | 'none';

interface Avatar3DCardProps {
  name: string;
  title: string;
  avatarUrl: string | null;
  avatar3dUrl: string | null;
  gradientFrom: string;
  gradientTo: string;
  badgeColor: string;
  animation: string;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  selected?: boolean;
  statusDot?: string;
  statusLabel?: string;
}

export default function Avatar3DCard({
  name, title, avatarUrl, avatar3dUrl, gradientFrom, gradientTo, badgeColor,
  animation = 'idle', icon, size = 'md', onClick, selected, statusDot, statusLabel,
}: Avatar3DCardProps) {
  useAvatarStyles();

  const cardRef = useRef<HTMLDivElement>(null);
  const imageUrl = avatar3dUrl || avatarUrl;
  const [imgError, setImgError] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  // Uniform sizes — fixed aspect ratio cards
  const sizes = {
    sm: { w: 140, h: 180, imgH: 130, nameSize: 'text-xs', titleSize: 'text-[10px]', emoji: 'text-2xl', ringSize: 100 },
    md: { w: 180, h: 240, imgH: 180, nameSize: 'text-sm', titleSize: 'text-xs', emoji: 'text-4xl', ringSize: 130 },
    lg: { w: 220, h: 300, imgH: 230, nameSize: 'text-base', titleSize: 'text-sm', emoji: 'text-5xl', ringSize: 160 },
  };
  const s = sizes[size];

  // 3D tilt on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -15, y: x * 15 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick();
    }
  }, [onClick]);

  const showFallback = !imageUrl || imgError;

  // Dynamic shadow based on tilt
  const shadowX = tilt.y * 0.6;
  const shadowY = 6 + tilt.x * 0.4;

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${name}, ${title}`}
      aria-pressed={onClick ? selected : undefined}
      className={`avatar-animated rounded-2xl flex flex-col items-center cursor-pointer group relative overflow-hidden ${
        selected ? 'ring-2 ring-white/60 shadow-2xl' : ''
      }`}
      style={{
        width: s.w,
        height: s.h,
        background: `linear-gradient(145deg, ${gradientFrom}, ${gradientTo})`,
        animation: 'glow-pulse 4s ease-in-out infinite',
        perspective: '600px',
        transform: isHovered
          ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.04)`
          : selected ? 'scale(1.03)' : 'scale(1)',
        transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
        willChange: 'transform',
        boxShadow: isHovered
          ? `${shadowX}px ${shadowY}px 25px rgba(0,0,0,0.4), 0 0 20px ${gradientFrom}30`
          : '0 4px 15px rgba(0,0,0,0.3)',
      }}
    >

      {/* Status dot */}
      {statusDot && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1" role="status" aria-label={statusLabel || 'Status'}>
          <div className={`w-2 h-2 rounded-full ${statusDot}`} />
          {statusLabel && <span className="text-[9px] text-white/60">{statusLabel}</span>}
        </div>
      )}

      {/* Avatar image — cropped to bust, uniform size */}
      <div className="relative z-10 w-full flex-1 overflow-hidden rounded-t-xl">
        {!showFallback ? (
          <img
            src={imageUrl!}
            alt={`${name}, ${title}`}
            className="w-full h-full object-cover"
            style={{
              objectPosition: 'top center',
              height: s.imgH,
              filter: isHovered
                ? 'brightness(1.08) contrast(1.02)'
                : 'brightness(1)',
              transition: 'filter 0.3s ease',
            }}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="w-full flex items-center justify-center bg-white/10 backdrop-blur-sm"
            style={{ height: s.imgH }}
          >
            <span className={s.emoji}>{icon || '🤖'}</span>
          </div>
        )}

        {/* Gradient fade at bottom of image into card */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: '40%',
            background: `linear-gradient(to top, ${gradientTo}, transparent)`,
          }}
        />

        {/* Spinning accent arc (only on hover) */}
        {isHovered && (
          <svg
            width={s.ringSize}
            height={s.ringSize}
            className="absolute pointer-events-none"
            style={{
              top: '50%',
              left: '50%',
              marginTop: -s.ringSize / 2,
              marginLeft: -s.ringSize / 2,
              animation: 'ring-spin 6s linear infinite',
              opacity: 0.5,
            }}
          >
            <circle
              cx={s.ringSize / 2}
              cy={s.ringSize / 2}
              r={s.ringSize / 2 - 4}
              fill="none"
              stroke="white"
              strokeWidth="1.5"
              strokeDasharray="15 45"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* Name + Title — over gradient fade */}
      <div
        className="relative z-10 text-center px-2 pb-3 pt-1"
        style={{ animation: 'float-badge 4s ease-in-out infinite' }}
      >
        <span
          className={`font-bold text-white block ${s.nameSize}`}
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
        >
          {name}
        </span>
        <p
          className={`text-white/80 ${s.titleSize} leading-tight mt-0.5`}
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
        >
          {title}
        </p>
      </div>

      {/* Bottom glow line */}
      <div
        className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
        style={{
          background: `linear-gradient(90deg, transparent, ${gradientFrom}, transparent)`,
          animation: 'ring-glow 3s ease-in-out infinite',
        }}
      />
    </div>
  );
}

/**
 * Inline avatar for headers, lists, etc.
 */
export function Avatar3DInline({
  name, avatarUrl, avatar3dUrl, gradientFrom, gradientTo, animation = 'idle', icon, size = 32,
}: {
  name: string; avatarUrl: string | null; avatar3dUrl: string | null;
  gradientFrom: string; gradientTo: string; animation?: string; icon?: string; size?: number;
}) {
  useAvatarStyles();

  const imageUrl = avatar3dUrl || avatarUrl;
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="avatar-animated rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
      }}
    >
      {imageUrl && !imgError ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          style={{ objectPosition: 'top center' }}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{icon || '🤖'}</span>
      )}
    </div>
  );
}
