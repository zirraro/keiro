'use client';

export function VortexBackground() {
  return (
    <>
      <style>{`
        @keyframes vortex-orbit-1 {
          0% {
            transform: translate(-20%, -10%) rotate(0deg);
          }
          25% {
            transform: translate(30%, -30%) rotate(90deg);
          }
          50% {
            transform: translate(60%, 20%) rotate(180deg);
          }
          75% {
            transform: translate(10%, 50%) rotate(270deg);
          }
          100% {
            transform: translate(-20%, -10%) rotate(360deg);
          }
        }

        @keyframes vortex-orbit-2 {
          0% {
            transform: translate(70%, 60%) rotate(0deg);
          }
          25% {
            transform: translate(20%, 10%) rotate(-90deg);
          }
          50% {
            transform: translate(-30%, 40%) rotate(-180deg);
          }
          75% {
            transform: translate(50%, -20%) rotate(-270deg);
          }
          100% {
            transform: translate(70%, 60%) rotate(-360deg);
          }
        }

        @keyframes vortex-orbit-3 {
          0% {
            transform: translate(40%, -30%) rotate(0deg) scale(1);
          }
          33% {
            transform: translate(-10%, 50%) rotate(120deg) scale(1.15);
          }
          66% {
            transform: translate(60%, 30%) rotate(240deg) scale(0.9);
          }
          100% {
            transform: translate(40%, -30%) rotate(360deg) scale(1);
          }
        }

        @keyframes vortex-orbit-4 {
          0% {
            transform: translate(-10%, 40%) rotate(0deg);
          }
          20% {
            transform: translate(50%, 60%) rotate(72deg);
          }
          40% {
            transform: translate(80%, 10%) rotate(144deg);
          }
          60% {
            transform: translate(30%, -20%) rotate(216deg);
          }
          80% {
            transform: translate(-20%, 20%) rotate(288deg);
          }
          100% {
            transform: translate(-10%, 40%) rotate(360deg);
          }
        }

        @keyframes vortex-orbit-5 {
          0% {
            transform: translate(50%, 50%) rotate(0deg) scale(1.1);
          }
          25% {
            transform: translate(-20%, -10%) rotate(-90deg) scale(0.95);
          }
          50% {
            transform: translate(30%, -30%) rotate(-180deg) scale(1.05);
          }
          75% {
            transform: translate(70%, 30%) rotate(-270deg) scale(0.9);
          }
          100% {
            transform: translate(50%, 50%) rotate(-360deg) scale(1.1);
          }
        }

        @keyframes vortex-orbit-6 {
          0% {
            transform: translate(10%, 70%) rotate(0deg);
          }
          30% {
            transform: translate(60%, -10%) rotate(108deg);
          }
          60% {
            transform: translate(-15%, 10%) rotate(216deg);
          }
          100% {
            transform: translate(10%, 70%) rotate(360deg);
          }
        }

        @keyframes vortex-mesh-shift {
          0%, 100% {
            opacity: 0.03;
          }
          50% {
            opacity: 0.07;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .vortex-bg-container {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="vortex-bg-container"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        {/* Orb 1 — Large blue */}
        <div
          style={{
            position: 'absolute',
            width: '900px',
            height: '900px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
            opacity: 0.1,
            filter: 'blur(80px)',
            animation: 'vortex-orbit-1 32s ease-in-out infinite',
            willChange: 'transform',
          }}
        />

        {/* Orb 2 — Cyan drift */}
        <div
          style={{
            position: 'absolute',
            width: '750px',
            height: '750px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)',
            opacity: 0.08,
            filter: 'blur(90px)',
            animation: 'vortex-orbit-2 38s ease-in-out infinite',
            willChange: 'transform',
          }}
        />

        {/* Orb 3 — Indigo pulse */}
        <div
          style={{
            position: 'absolute',
            width: '1000px',
            height: '1000px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)',
            opacity: 0.07,
            filter: 'blur(100px)',
            animation: 'vortex-orbit-3 28s ease-in-out infinite',
            willChange: 'transform',
          }}
        />

        {/* Orb 4 — Purple wide orbit */}
        <div
          style={{
            position: 'absolute',
            width: '800px',
            height: '800px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)',
            opacity: 0.09,
            filter: 'blur(85px)',
            animation: 'vortex-orbit-4 35s ease-in-out infinite',
            willChange: 'transform',
          }}
        />

        {/* Orb 5 — Blue-cyan blend */}
        <div
          style={{
            position: 'absolute',
            width: '650px',
            height: '650px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #3b82f6 0%, #06b6d4 50%, transparent 70%)',
            opacity: 0.06,
            filter: 'blur(95px)',
            animation: 'vortex-orbit-5 25s ease-in-out infinite',
            willChange: 'transform',
          }}
        />

        {/* Orb 6 — Indigo-purple blend */}
        <div
          style={{
            position: 'absolute',
            width: '700px',
            height: '700px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #6366f1 0%, #8b5cf6 50%, transparent 70%)',
            opacity: 0.05,
            filter: 'blur(90px)',
            animation: 'vortex-orbit-6 40s ease-in-out infinite',
            willChange: 'transform',
          }}
        />

        {/* Mesh gradient overlay — subtle color shift */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'conic-gradient(from 180deg at 50% 50%, #3b82f6 0deg, #06b6d4 72deg, #6366f1 144deg, #8b5cf6 216deg, #3b82f6 288deg, #06b6d4 360deg)',
            opacity: 0.04,
            filter: 'blur(120px)',
            animation: 'vortex-mesh-shift 20s ease-in-out infinite',
          }}
        />
      </div>
    </>
  );
}
