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
      style={{ minHeight: 170 }}
    >
      {/* Dark card background with subtle gradient accent */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, #111827 0%, #0f172a 100%)`,
        }}
      />
      {/* Gradient accent bar at top */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${agent.gradientFrom}, ${agent.gradientTo})`,
        }}
      />

      {/* Coming soon overlay */}
      {isLocked && (
        <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
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

      {/* Status badge */}
      {isLocked && comingSoonMode && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-0.5 bg-purple-500/30 backdrop-blur-sm rounded-full">
          <svg className="w-2.5 h-2.5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] text-purple-200 font-medium">Bientot</span>
        </div>
      )}
      {!isLocked && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-0.5 bg-green-500/15 backdrop-blur-sm rounded-full border border-green-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-green-300 font-medium">Actif</span>
        </div>
      )}

      <div className="relative z-10 p-4 flex flex-col items-center text-center gap-2.5">
        {/* Avatar — large, circular, with gradient ring */}
        <div
          className="relative w-20 h-20 rounded-full flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${agent.gradientFrom}, ${agent.gradientTo})`,
            padding: '2.5px',
          }}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
            {showImage ? (
              <img
                src={avatarUrl!}
                alt={agent.displayName}
                className="w-full h-full object-cover scale-[1.15]"
                style={{ objectPosition: 'center 15%' }}
                loading="lazy"
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-3xl">{agent.icon}</span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 w-full">
          <h3 className="text-white font-bold text-sm leading-tight">{agent.displayName}</h3>
          <p
            className="text-xs font-medium mt-0.5"
            style={{ color: agent.gradientFrom }}
          >
            {agent.title}
          </p>
          <p className="text-gray-400 text-[11px] leading-snug mt-1.5 line-clamp-2">{agent.description}</p>
        </div>
      </div>

      {/* Bottom gradient glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-12 opacity-20 pointer-events-none"
        style={{
          background: `linear-gradient(to top, ${agent.gradientFrom}40, transparent)`,
        }}
      />
    </button>
  );
}
