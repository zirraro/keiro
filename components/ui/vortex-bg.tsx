'use client';

/**
 * Modern premium background — Stripe/Linear-inspired flowing gradient mesh.
 * Thin luminous ribbons instead of blobby orbs. More refined, geometric feel.
 */
export function VortexBackground() {
  return (
    <>
      <style>{`
        @keyframes ribbon-flow-1 {
          0%   { transform: translateY(0%) rotate(-12deg) scaleX(1); }
          50%  { transform: translateY(-8%) rotate(-8deg) scaleX(1.1); }
          100% { transform: translateY(0%) rotate(-12deg) scaleX(1); }
        }
        @keyframes ribbon-flow-2 {
          0%   { transform: translateY(0%) rotate(8deg) scaleX(1); }
          50%  { transform: translateY(6%) rotate(12deg) scaleX(0.95); }
          100% { transform: translateY(0%) rotate(8deg) scaleX(1); }
        }
        @keyframes ribbon-flow-3 {
          0%   { transform: translateX(0%) rotate(-5deg); }
          50%  { transform: translateX(4%) rotate(-2deg); }
          100% { transform: translateX(0%) rotate(-5deg); }
        }
        @keyframes mesh-drift {
          0%   { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(3deg) scale(1.02); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes grain-shift {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2%, -2%); }
          30% { transform: translate(1%, -1%); }
          50% { transform: translate(-1%, 2%); }
          70% { transform: translate(2%, 1%); }
          90% { transform: translate(-2%, 0%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .vortex-bg-container { display: none !important; }
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
        {/* Gradient mesh — soft color field */}
        <div style={{
          position: 'absolute',
          inset: '-20%',
          background: `
            radial-gradient(ellipse 80% 50% at 20% 20%, rgba(59, 130, 246, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 30%, rgba(6, 182, 212, 0.06) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 50% 80%, rgba(139, 92, 246, 0.05) 0%, transparent 60%)
          `,
          animation: 'mesh-drift 30s ease-in-out infinite',
          willChange: 'transform',
        }} />

        {/* Ribbon 1 — wide luminous band, top area */}
        <div style={{
          position: 'absolute',
          top: '-5%',
          left: '-10%',
          width: '120%',
          height: '250px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.07) 20%, rgba(6, 182, 212, 0.05) 50%, rgba(139, 92, 246, 0.04) 80%, transparent 100%)',
          filter: 'blur(40px)',
          animation: 'ribbon-flow-1 20s ease-in-out infinite',
          willChange: 'transform',
        }} />

        {/* Ribbon 2 — mid-page accent */}
        <div style={{
          position: 'absolute',
          top: '35%',
          left: '-5%',
          width: '110%',
          height: '180px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.06) 30%, rgba(59, 130, 246, 0.04) 60%, transparent 100%)',
          filter: 'blur(50px)',
          animation: 'ribbon-flow-2 25s ease-in-out infinite',
          willChange: 'transform',
        }} />

        {/* Ribbon 3 — lower page */}
        <div style={{
          position: 'absolute',
          bottom: '10%',
          left: '-10%',
          width: '120%',
          height: '200px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(6, 182, 212, 0.05) 25%, rgba(59, 130, 246, 0.06) 55%, rgba(139, 92, 246, 0.03) 85%, transparent 100%)',
          filter: 'blur(45px)',
          animation: 'ribbon-flow-3 22s ease-in-out infinite',
          willChange: 'transform',
        }} />

        {/* Dot grid overlay — subtle structure */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.03) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />

        {/* Film grain texture — adds organic/analog feel */}
        <div style={{
          position: 'absolute',
          inset: '-50%',
          width: '200%',
          height: '200%',
          opacity: 0.015,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          animation: 'grain-shift 8s steps(10) infinite',
          pointerEvents: 'none',
        }} />
      </div>
    </>
  );
}
