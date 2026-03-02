'use client';

import { ReactNode } from 'react';

export function GlassCard({
  children,
  className = '',
  intensity = 'medium',
  dark = false,
}: {
  children: ReactNode;
  className?: string;
  intensity?: 'light' | 'medium' | 'strong';
  dark?: boolean;
}) {
  const styles = dark
    ? {
        light: 'bg-white/5 backdrop-blur-sm border border-white/10',
        medium: 'bg-white/10 backdrop-blur-md border border-white/15',
        strong: 'bg-white/15 backdrop-blur-xl border border-white/20',
      }
    : {
        light: 'bg-white/40 backdrop-blur-sm border border-white/30',
        medium: 'bg-white/60 backdrop-blur-md border border-white/40',
        strong: 'bg-white/80 backdrop-blur-xl border border-white/50',
      };

  return (
    <div className={`rounded-2xl ${styles[intensity]} ${className}`}>
      {children}
    </div>
  );
}
