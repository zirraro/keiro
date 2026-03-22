'use client';

import { useState } from 'react';
import type { ClientAgent } from '@/lib/agents/client-context';

interface AgentCardProps {
  agent: ClientAgent;
  avatarUrl: string | null;
  isSelected: boolean;
  onClick: () => void;
  comingSoonMode?: boolean;
  onNotifyClick?: () => void;
}

export default function AgentCard({ agent, avatarUrl, isSelected, onClick, comingSoonMode = false, onNotifyClick }: AgentCardProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = avatarUrl && !imgError;
  const isLocked = comingSoonMode || agent.visibility === 'coming_soon';

  return (
    <button
      onClick={isLocked ? (onNotifyClick || undefined) : onClick}
      disabled={false}
      className={`
        relative w-full rounded-2xl overflow-hidden text-left transition-all duration-200
        ${isLocked ? 'cursor-pointer hover:scale-[1.01]' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'}
        ${isSelected ? 'ring-2 ring-purple-400 shadow-xl shadow-purple-500/20' : 'shadow-lg hover:shadow-xl'}
      `}
      style={{
        background: `linear-gradient(145deg, ${agent.gradientFrom}, ${agent.gradientTo})`,
        minHeight: 140,
      }}
    >
      {/* Coming soon overlay */}
      {isLocked && (
        <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
          <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-white/90 text-xs font-semibold">Automatisation a venir</span>
          {onNotifyClick && (
            <span className="text-purple-300 text-[10px] font-medium underline underline-offset-2">
              Me notifier
            </span>
          )}
        </div>
      )}

      {/* Status badge: coming soon in global mode */}
      {isLocked && comingSoonMode && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 bg-purple-500/30 backdrop-blur-sm rounded-full">
          <svg className="w-2.5 h-2.5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] text-purple-200 font-medium">Bientot</span>
        </div>
      )}

      {/* Status badge: available (only when not in coming-soon mode) */}
      {!isLocked && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 bg-white/15 backdrop-blur-sm rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[10px] text-white/90 font-medium">Disponible</span>
        </div>
      )}

      <div className="relative z-10 p-3 flex items-start gap-3">
        {/* Avatar */}
        <div
          className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          {showImage ? (
            <img
              src={avatarUrl!}
              alt={agent.displayName}
              className="w-full h-full object-cover"
              style={{ objectPosition: 'top center' }}
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-2xl">{agent.icon}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm leading-tight">{agent.displayName}</h3>
          <p className="text-white/70 text-[11px] font-medium mt-0.5">{agent.title}</p>
          <p className="text-white/55 text-[11px] leading-snug mt-1.5 line-clamp-2">{agent.description}</p>
        </div>
      </div>

      {/* Bottom glow line */}
      <div
        className="absolute bottom-0 left-3 right-3 h-[1px] rounded-full"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
        }}
      />
    </button>
  );
}
