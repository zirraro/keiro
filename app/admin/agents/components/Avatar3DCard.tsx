'use client';

import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

// ─── Animation keyframes (injected once globally) ────────────────────────────

const ANIMATION_STYLES = `
@keyframes avatar-3d-idle {
  0%, 100% { transform: rotateY(0deg) rotateX(0deg); }
  25% { transform: rotateY(3deg) rotateX(-1deg); }
  50% { transform: rotateY(0deg) rotateX(1deg); }
  75% { transform: rotateY(-3deg) rotateX(-1deg); }
}
@keyframes avatar-3d-wave {
  0%, 100% { transform: rotateY(0deg) rotateZ(0deg); }
  15% { transform: rotateY(5deg) rotateZ(3deg); }
  30% { transform: rotateY(-3deg) rotateZ(-2deg); }
  45% { transform: rotateY(5deg) rotateZ(3deg); }
  60% { transform: rotateY(-2deg) rotateZ(-1deg); }
  75% { transform: rotateY(4deg) rotateZ(2deg); }
}
@keyframes avatar-3d-thinking {
  0%, 100% { transform: rotateX(0deg) rotateY(0deg) translateY(0); }
  25% { transform: rotateX(2deg) rotateY(-3deg) translateY(-2px); }
  50% { transform: rotateX(-1deg) rotateY(0deg) translateY(-4px); }
  75% { transform: rotateX(1deg) rotateY(3deg) translateY(-2px); }
}
@keyframes avatar-3d-talking {
  0%, 100% { transform: scale(1) rotateY(0deg); }
  10% { transform: scale(1.02) rotateY(1deg); }
  20% { transform: scale(0.99) rotateY(-1deg); }
  30% { transform: scale(1.01) rotateY(1deg); }
  40% { transform: scale(0.995) rotateY(0deg); }
}
@keyframes ring-glow {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
}
@keyframes ring-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes reflection-shimmer {
  0%, 100% { opacity: 0.15; transform: scaleY(1) translateY(0); }
  50% { opacity: 0.25; transform: scaleY(1.02) translateY(1px); }
}
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(255,255,255,0.08); }
  50% { box-shadow: 0 0 35px rgba(255,255,255,0.18); }
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

const ANIMATION_MAP: Record<AnimationType, string> = {
  idle: 'avatar-3d-idle 5s ease-in-out infinite',
  wave: 'avatar-3d-wave 2.5s ease-in-out infinite',
  thinking: 'avatar-3d-thinking 4s ease-in-out infinite',
  talking: 'avatar-3d-talking 1.5s ease-in-out infinite',
  none: 'none',
};

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
  const animationCSS = ANIMATION_MAP[animation as AnimationType] || ANIMATION_MAP.idle;
  const [imgError, setImgError] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const sizes = {
    sm: { card: 'w-32', imgW: 112, imgH: 112, nameSize: 'text-xs', titleSize: 'text-[11px]', emoji: 'text-2xl', ringSize: 120 },
    md: { card: 'w-44', imgW: 144, imgH: 144, nameSize: 'text-sm', titleSize: 'text-xs', emoji: 'text-4xl', ringSize: 152 },
    lg: { card: 'w-56', imgW: 176, imgH: 176, nameSize: 'text-base', titleSize: 'text-sm', emoji: 'text-5xl', ringSize: 184 },
  };
  const s = sizes[size];

  // 3D tilt on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -20, y: x * 20 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const cardStyle: CSSProperties = {
    background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
    animation: 'glow-pulse 4s ease-in-out infinite',
    perspective: '800px',
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick();
    }
  }, [onClick]);

  const showFallback = !imageUrl || imgError;

  // Dynamic shadow based on tilt
  const shadowX = tilt.y * 0.8;
  const shadowY = 8 + tilt.x * 0.5;

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
      className={`avatar-animated ${s.card} rounded-2xl p-2 pb-3 flex flex-col items-center gap-1 cursor-pointer group relative overflow-hidden ${
        selected ? 'ring-2 ring-white/60 shadow-2xl scale-105' : ''
      }`}
      style={cardStyle}
    >

      {/* Status dot */}
      {statusDot && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1" role="status" aria-label={statusLabel || 'Status'}>
          <div className={`w-2 h-2 rounded-full ${statusDot}`} />
          {statusLabel && <span className="text-[9px] text-white/60">{statusLabel}</span>}
        </div>
      )}

      {/* 3D perspective container */}
      <div
        className="relative z-10"
        style={{
          transformStyle: 'preserve-3d',
          transform: isHovered
            ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.05)`
            : undefined,
          animation: isHovered ? 'none' : animationCSS,
          transition: 'transform 0.15s ease-out',
          willChange: 'transform',
        }}
      >
        {!showFallback ? (
          <>
            {/* Main avatar image */}
            <img
              src={imageUrl!}
              alt={`${name}, ${title}`}
              width={s.imgW}
              height={s.imgH}
              className="object-cover rounded-xl"
              style={{
                filter: `drop-shadow(${shadowX}px ${shadowY}px 16px rgba(0,0,0,0.4))`,
                transform: 'translateZ(20px)',
              }}
              loading="lazy"
              onError={() => setImgError(true)}
            />

            {/* Reflection under avatar */}
            <div
              style={{
                position: 'absolute',
                bottom: -s.imgH * 0.35,
                left: '50%',
                transform: 'translateX(-50%) scaleY(-1)',
                width: s.imgW,
                height: s.imgH * 0.35,
                overflow: 'hidden',
                borderRadius: '0 0 12px 12px',
                animation: 'reflection-shimmer 4s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            >
              <img
                src={imageUrl!}
                alt=""
                width={s.imgW}
                height={s.imgH}
                className="object-cover rounded-xl"
                style={{
                  opacity: 0.2,
                  filter: 'blur(2px)',
                  maskImage: 'linear-gradient(to top, rgba(0,0,0,0.3), transparent)',
                  WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.3), transparent)',
                }}
              />
            </div>
          </>
        ) : (
          <div
            className="rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center"
            style={{ width: s.imgW, height: s.imgH, transform: 'translateZ(20px)' }}
          >
            <span className={s.emoji}>{icon || '🤖'}</span>
          </div>
        )}

        {/* Glow ring around avatar */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: s.ringSize,
            height: s.ringSize,
            marginTop: -s.ringSize / 2,
            marginLeft: -s.ringSize / 2,
            borderRadius: '50%',
            border: `2px solid ${gradientFrom}`,
            animation: 'ring-glow 3s ease-in-out infinite',
            pointerEvents: 'none',
            transform: 'translateZ(-5px)',
          }}
        />

        {/* Spinning accent arc */}
        <svg
          width={s.ringSize + 16}
          height={s.ringSize + 16}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            marginTop: -(s.ringSize + 16) / 2,
            marginLeft: -(s.ringSize + 16) / 2,
            animation: 'ring-spin 8s linear infinite',
            pointerEvents: 'none',
            transform: 'translateZ(-8px)',
          }}
        >
          <circle
            cx={(s.ringSize + 16) / 2}
            cy={(s.ringSize + 16) / 2}
            r={(s.ringSize + 8) / 2}
            fill="none"
            stroke={gradientFrom}
            strokeWidth="1.5"
            strokeDasharray="20 60"
            strokeLinecap="round"
            opacity="0.4"
          />
        </svg>
      </div>

      {/* Name — floating text */}
      <div
        className="relative z-10 text-center mt-1"
        style={{ animation: 'float-badge 3s ease-in-out infinite' }}
      >
        <span
          className={`font-bold text-white ${s.nameSize}`}
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)' }}
        >
          {name}
        </span>
        <p
          className={`text-white/90 ${s.titleSize} leading-tight`}
          style={{ textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}
        >
          {title}
        </p>
      </div>
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

  const containerRef = useRef<HTMLDivElement>(null);
  const imageUrl = avatar3dUrl || avatarUrl;
  const animationCSS = ANIMATION_MAP[animation as AnimationType] || ANIMATION_MAP.idle;
  const [imgError, setImgError] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -15, y: x * 15 });
  }, []);

  const handleMouseLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="avatar-animated rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
        perspective: '400px',
      }}
    >
      {imageUrl && !imgError ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          style={{
            animation: tilt.x === 0 && tilt.y === 0 ? animationCSS : 'none',
            transform: tilt.x !== 0 || tilt.y !== 0
              ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.05)`
              : undefined,
            transition: 'transform 0.15s ease-out',
            willChange: 'transform',
          }}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{icon || '🤖'}</span>
      )}
    </div>
  );
}
