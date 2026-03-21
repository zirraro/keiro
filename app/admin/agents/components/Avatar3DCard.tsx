'use client';

import { CSSProperties } from 'react';

// ─── Animation keyframes (injected once) ─────────────────────────────────────

const ANIMATION_STYLES = `
@keyframes avatar-idle {
  0%, 100% { transform: translateY(0px) scale(1); }
  50% { transform: translateY(-6px) scale(1.02); }
}
@keyframes avatar-wave {
  0%, 100% { transform: rotate(0deg); }
  15% { transform: rotate(14deg); }
  30% { transform: rotate(-8deg); }
  45% { transform: rotate(14deg); }
  60% { transform: rotate(-4deg); }
  75% { transform: rotate(10deg); }
}
@keyframes avatar-thinking {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  25% { transform: translateY(-3px) rotate(-2deg); }
  50% { transform: translateY(-5px) rotate(0deg); }
  75% { transform: translateY(-3px) rotate(2deg); }
}
@keyframes avatar-talking {
  0%, 100% { transform: scale(1); }
  10% { transform: scale(1.03); }
  20% { transform: scale(0.98); }
  30% { transform: scale(1.02); }
  40% { transform: scale(0.99); }
  50% { transform: scale(1.01); }
}
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(255,255,255,0.1); }
  50% { box-shadow: 0 0 40px rgba(255,255,255,0.25); }
}
@keyframes float-badge {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-2px); }
}
`;

const ANIMATION_MAP: Record<string, string> = {
  idle: 'avatar-idle 3s ease-in-out infinite',
  wave: 'avatar-wave 2.5s ease-in-out infinite',
  thinking: 'avatar-thinking 4s ease-in-out infinite',
  talking: 'avatar-talking 1.5s ease-in-out infinite',
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
  const imageUrl = avatar3dUrl || avatarUrl;
  const animationCSS = ANIMATION_MAP[animation] || ANIMATION_MAP.idle;

  const sizes = {
    sm: { card: 'w-32', img: 'w-28 h-28', nameSize: 'text-xs', titleSize: 'text-[10px]' },
    md: { card: 'w-44', img: 'w-36 h-36', nameSize: 'text-sm', titleSize: 'text-xs' },
    lg: { card: 'w-56', img: 'w-44 h-44', nameSize: 'text-base', titleSize: 'text-sm' },
  };
  const s = sizes[size];

  const cardStyle: CSSProperties = {
    background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
    animation: 'glow-pulse 4s ease-in-out infinite',
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
      <div
        onClick={onClick}
        className={`${s.card} rounded-2xl p-2 pb-3 flex flex-col items-center gap-1 transition-all duration-300 cursor-pointer group relative overflow-hidden ${
          selected ? 'ring-2 ring-white/60 shadow-2xl scale-105' : 'hover:scale-105 hover:shadow-xl'
        }`}
        style={cardStyle}
      >

        {/* Status dot */}
        {statusDot && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${statusDot}`} />
            {statusLabel && <span className="text-[9px] text-white/60">{statusLabel}</span>}
          </div>
        )}

        {/* Avatar image with animation */}
        <div className="relative z-10" style={{ animation: animationCSS }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className={`${s.img} object-cover rounded-xl drop-shadow-2xl`}
              style={{ filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.3))' }}
            />
          ) : (
            <div className={`${s.img} rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center`}>
              <span className="text-4xl">{icon || '🤖'}</span>
            </div>
          )}
        </div>

        {/* Name — floating text, no box */}
        <div
          className="relative z-10 text-center"
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
    </>
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
  const imageUrl = avatar3dUrl || avatarUrl;
  const animationCSS = ANIMATION_MAP[animation] || ANIMATION_MAP.idle;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
      <div
        className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{
          width: size, height: size,
          background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
            style={{ animation: animationCSS }}
          />
        ) : (
          <span style={{ fontSize: size * 0.5 }}>{icon || '🤖'}</span>
        )}
      </div>
    </>
  );
}
