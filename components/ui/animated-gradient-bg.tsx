'use client';

export function AnimatedGradientBG({ variant = 'hero' }: { variant?: 'hero' | 'dark' | 'pricing' }) {
  const configs = {
    hero: {
      blob1: 'bg-blue-400/20',
      blob2: 'bg-cyan-400/15',
      blob3: 'bg-indigo-400/10',
    },
    dark: {
      blob1: 'bg-blue-600/20',
      blob2: 'bg-indigo-500/15',
      blob3: 'bg-purple-600/10',
    },
    pricing: {
      blob1: 'bg-blue-400/15',
      blob2: 'bg-purple-400/12',
      blob3: 'bg-cyan-400/10',
    },
  };

  const c = configs[variant];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true" style={{ zIndex: 0 }}>
      {/* Blob 1 - top left */}
      <div
        className={`absolute -top-32 -left-32 w-96 h-96 ${c.blob1} rounded-full blur-3xl`}
        style={{ animation: 'float-blob 8s ease-in-out infinite' }}
      />
      {/* Blob 2 - bottom right */}
      <div
        className={`absolute -bottom-24 -right-24 w-80 h-80 ${c.blob2} rounded-full blur-3xl`}
        style={{ animation: 'float-blob 6s ease-in-out infinite 2s' }}
      />
      {/* Blob 3 - center */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 ${c.blob3} rounded-full blur-3xl`}
        style={{ animation: 'float-blob 10s ease-in-out infinite 4s' }}
      />
    </div>
  );
}
