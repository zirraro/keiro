'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * VortexBackground — Living, breathing background for KeiroAI.
 *
 * Combines:
 * 1. Animated gradient mesh (soft color fields that drift)
 * 2. Flowing luminous ribbons that traverse the viewport
 * 3. Floating micro-particles with parallax on scroll
 * 4. Subtle grid pattern for structure
 * 5. Film grain for analog premium texture
 *
 * All GPU-accelerated via will-change: transform.
 * Respects prefers-reduced-motion.
 */
export function VortexBackground() {
  const [scrollY, setScrollY] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const onScroll = () => {
      rafRef.current = requestAnimationFrame(() => {
        setScrollY(window.scrollY);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Parallax offset for particles
  const p1 = scrollY * 0.02;
  const p2 = scrollY * -0.015;
  const p3 = scrollY * 0.01;

  return (
    <>
      <style>{`
        @keyframes vbg-drift-1 {
          0%   { transform: translate(0%, 0%) scale(1); }
          25%  { transform: translate(3%, -2%) scale(1.02); }
          50%  { transform: translate(-2%, 3%) scale(0.98); }
          75%  { transform: translate(4%, 1%) scale(1.01); }
          100% { transform: translate(0%, 0%) scale(1); }
        }
        @keyframes vbg-drift-2 {
          0%   { transform: translate(0%, 0%) rotate(0deg); }
          33%  { transform: translate(-4%, 2%) rotate(2deg); }
          66%  { transform: translate(3%, -3%) rotate(-1deg); }
          100% { transform: translate(0%, 0%) rotate(0deg); }
        }
        @keyframes vbg-ribbon-1 {
          0%   { transform: translateX(-100%) rotate(-8deg); }
          100% { transform: translateX(100%) rotate(-8deg); }
        }
        @keyframes vbg-ribbon-2 {
          0%   { transform: translateX(100%) rotate(5deg); }
          100% { transform: translateX(-100%) rotate(5deg); }
        }
        @keyframes vbg-ribbon-3 {
          0%   { transform: translateX(-80%) rotate(-3deg); }
          100% { transform: translateX(80%) rotate(-3deg); }
        }
        @keyframes vbg-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes vbg-pulse {
          0%, 100% { opacity: 0.03; }
          50% { opacity: 0.08; }
        }
        @keyframes vbg-grain {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2%, -2%); }
          30% { transform: translate(1%, -1%); }
          50% { transform: translate(-1%, 2%); }
          70% { transform: translate(2%, 1%); }
          90% { transform: translate(-2%, 0%); }
        }
        @keyframes vbg-orb-glow {
          0%, 100% { opacity: 0.06; transform: scale(1); }
          50% { opacity: 0.12; transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .vortex-bg-root { display: none !important; }
        }
      `}</style>

      <div
        className="vortex-bg-root"
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        {/* === LAYER 1: Gradient mesh — soft color fields === */}
        <div style={{
          position: 'absolute',
          inset: '-30%',
          animation: 'vbg-drift-1 40s ease-in-out infinite',
          willChange: 'transform',
        }}>
          <div style={{
            position: 'absolute',
            top: '10%', left: '5%',
            width: '50%', height: '40%',
            background: 'radial-gradient(ellipse, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
          <div style={{
            position: 'absolute',
            top: '50%', right: '5%',
            width: '45%', height: '35%',
            background: 'radial-gradient(ellipse, rgba(6, 182, 212, 0.08) 0%, transparent 70%)',
            filter: 'blur(70px)',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '5%', left: '30%',
            width: '40%', height: '30%',
            background: 'radial-gradient(ellipse, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
        </div>

        {/* === LAYER 2: Living orbs — breathe/pulse in place === */}
        <div style={{
          position: 'absolute',
          top: '15%', left: '10%',
          width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 60%)',
          filter: 'blur(40px)',
          animation: 'vbg-orb-glow 8s ease-in-out infinite',
          willChange: 'transform, opacity',
        }} />
        <div style={{
          position: 'absolute',
          top: '55%', right: '8%',
          width: 350, height: 350,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 60%)',
          filter: 'blur(45px)',
          animation: 'vbg-orb-glow 10s ease-in-out infinite 3s',
          willChange: 'transform, opacity',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '10%', left: '40%',
          width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 60%)',
          filter: 'blur(50px)',
          animation: 'vbg-orb-glow 12s ease-in-out infinite 6s',
          willChange: 'transform, opacity',
        }} />

        {/* === LAYER 3: Flowing ribbons — traverse the screen === */}
        <div style={{
          position: 'absolute',
          top: '20%', left: 0, right: 0,
          height: 120,
          background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.06) 20%, rgba(6, 182, 212, 0.08) 50%, rgba(139, 92, 246, 0.04) 80%, transparent)',
          filter: 'blur(30px)',
          animation: 'vbg-ribbon-1 30s linear infinite',
          willChange: 'transform',
        }} />
        <div style={{
          position: 'absolute',
          top: '50%', left: 0, right: 0,
          height: 80,
          background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.05) 30%, rgba(59, 130, 246, 0.07) 70%, transparent)',
          filter: 'blur(25px)',
          animation: 'vbg-ribbon-2 35s linear infinite',
          willChange: 'transform',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '25%', left: 0, right: 0,
          height: 100,
          background: 'linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.06) 40%, rgba(59, 130, 246, 0.04) 60%, transparent)',
          filter: 'blur(35px)',
          animation: 'vbg-ribbon-3 25s linear infinite',
          willChange: 'transform',
        }} />

        {/* === LAYER 4: Floating particles with scroll parallax === */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${p1}px)`, willChange: 'transform' }}>
          {/* Group 1 — blue particles */}
          {[
            { l: '8%', t: '12%', s: 3 },
            { l: '25%', t: '35%', s: 2 },
            { l: '45%', t: '8%', s: 4 },
            { l: '72%', t: '28%', s: 2 },
            { l: '88%', t: '15%', s: 3 },
            { l: '15%', t: '65%', s: 2 },
            { l: '55%', t: '72%', s: 3 },
            { l: '82%', t: '58%', s: 2 },
          ].map((dot, i) => (
            <div key={`b-${i}`} style={{
              position: 'absolute',
              left: dot.l, top: dot.t,
              width: dot.s, height: dot.s,
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.35)',
              boxShadow: '0 0 6px rgba(59, 130, 246, 0.2)',
              animation: `vbg-float ${4 + i * 0.5}s ease-in-out infinite ${i * 0.3}s`,
            }} />
          ))}
        </div>
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${p2}px)`, willChange: 'transform' }}>
          {/* Group 2 — cyan particles */}
          {[
            { l: '18%', t: '22%', s: 2 },
            { l: '38%', t: '45%', s: 3 },
            { l: '62%', t: '18%', s: 2 },
            { l: '78%', t: '42%', s: 3 },
            { l: '92%', t: '68%', s: 2 },
            { l: '5%', t: '82%', s: 3 },
          ].map((dot, i) => (
            <div key={`c-${i}`} style={{
              position: 'absolute',
              left: dot.l, top: dot.t,
              width: dot.s, height: dot.s,
              borderRadius: '50%',
              background: 'rgba(6, 182, 212, 0.3)',
              boxShadow: '0 0 6px rgba(6, 182, 212, 0.15)',
              animation: `vbg-float ${5 + i * 0.4}s ease-in-out infinite ${i * 0.5 + 1}s`,
            }} />
          ))}
        </div>
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${p3}px)`, willChange: 'transform' }}>
          {/* Group 3 — purple particles */}
          {[
            { l: '12%', t: '45%', s: 2 },
            { l: '35%', t: '78%', s: 3 },
            { l: '58%', t: '52%', s: 2 },
            { l: '85%', t: '82%', s: 2 },
            { l: '48%', t: '32%', s: 3 },
          ].map((dot, i) => (
            <div key={`p-${i}`} style={{
              position: 'absolute',
              left: dot.l, top: dot.t,
              width: dot.s, height: dot.s,
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.25)',
              boxShadow: '0 0 6px rgba(139, 92, 246, 0.12)',
              animation: `vbg-float ${6 + i * 0.3}s ease-in-out infinite ${i * 0.7 + 2}s`,
            }} />
          ))}
        </div>

        {/* === LAYER 5: Dot grid — subtle structure === */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.035) 1px, transparent 0)',
          backgroundSize: '48px 48px',
          animation: 'vbg-drift-2 60s ease-in-out infinite',
        }} />

        {/* === LAYER 6: Animated pulse ring === */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 600, height: 600,
          marginTop: -300, marginLeft: -300,
          borderRadius: '50%',
          border: '1px solid rgba(59, 130, 246, 0.04)',
          animation: 'vbg-pulse 6s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 900, height: 900,
          marginTop: -450, marginLeft: -450,
          borderRadius: '50%',
          border: '1px solid rgba(6, 182, 212, 0.03)',
          animation: 'vbg-pulse 8s ease-in-out infinite 2s',
        }} />

        {/* === LAYER 7: Film grain === */}
        <div style={{
          position: 'absolute',
          inset: '-50%',
          width: '200%',
          height: '200%',
          opacity: 0.012,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          animation: 'vbg-grain 6s steps(8) infinite',
          pointerEvents: 'none',
        }} />
      </div>
    </>
  );
}
