'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * VortexBackground — Living, breathing background for KeiroAI.
 *
 * Colors match the page reveal intro (deep blues, cyans, purples).
 * Movement is clearly VISIBLE — not subtle, but elegant.
 * Orbs drift toward CTA area (center-top), creating subconscious pull.
 *
 * All GPU-accelerated via will-change: transform.
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

  const p1 = scrollY * 0.03;
  const p2 = scrollY * -0.02;
  const p3 = scrollY * 0.015;

  return (
    <>
      <style>{`
        @keyframes vbg-drift-1 {
          0%   { transform: translate(0%, 0%) scale(1); }
          25%  { transform: translate(5%, -3%) scale(1.05); }
          50%  { transform: translate(-3%, 5%) scale(0.97); }
          75%  { transform: translate(6%, 2%) scale(1.03); }
          100% { transform: translate(0%, 0%) scale(1); }
        }
        @keyframes vbg-drift-2 {
          0%   { transform: translate(0%, 0%) rotate(0deg); }
          33%  { transform: translate(-5%, 3%) rotate(3deg); }
          66%  { transform: translate(4%, -4%) rotate(-2deg); }
          100% { transform: translate(0%, 0%) rotate(0deg); }
        }
        @keyframes vbg-ribbon-1 {
          0%   { transform: translateX(-120%) rotate(-6deg) scaleY(1); }
          50%  { transform: translateX(0%) rotate(-6deg) scaleY(1.3); }
          100% { transform: translateX(120%) rotate(-6deg) scaleY(1); }
        }
        @keyframes vbg-ribbon-2 {
          0%   { transform: translateX(120%) rotate(4deg) scaleY(1); }
          50%  { transform: translateX(0%) rotate(4deg) scaleY(1.4); }
          100% { transform: translateX(-120%) rotate(4deg) scaleY(1); }
        }
        @keyframes vbg-ribbon-3 {
          0%   { transform: translateX(-100%) rotate(-2deg); }
          100% { transform: translateX(100%) rotate(-2deg); }
        }
        @keyframes vbg-ribbon-4 {
          0%   { transform: translateX(80%) rotate(7deg); }
          100% { transform: translateX(-80%) rotate(7deg); }
        }
        @keyframes vbg-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-30px); }
        }
        @keyframes vbg-float-x {
          0%, 100% { transform: translate(0px, 0px); }
          25% { transform: translate(15px, -10px); }
          50% { transform: translate(-10px, -25px); }
          75% { transform: translate(20px, -5px); }
        }
        @keyframes vbg-pulse {
          0%, 100% { opacity: 0.04; transform: scale(1); }
          50% { opacity: 0.1; transform: scale(1.05); }
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
          0%, 100% { opacity: 0.12; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(1.15); }
        }
        @keyframes vbg-orb-drift {
          0%   { transform: translate(0%, 0%) scale(1); }
          25%  { transform: translate(8%, -5%) scale(1.08); }
          50%  { transform: translate(-5%, 8%) scale(0.95); }
          75%  { transform: translate(6%, 3%) scale(1.05); }
          100% { transform: translate(0%, 0%) scale(1); }
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
        {/* === LAYER 1: Gradient mesh — color fields that drift visibly === */}
        <div style={{
          position: 'absolute',
          inset: '-20%',
          animation: 'vbg-drift-1 25s ease-in-out infinite',
          willChange: 'transform',
        }}>
          <div style={{
            position: 'absolute',
            top: '5%', left: '0%',
            width: '60%', height: '50%',
            background: 'radial-gradient(ellipse, rgba(59, 130, 246, 0.18) 0%, transparent 70%)',
            filter: 'blur(50px)',
          }} />
          <div style={{
            position: 'absolute',
            top: '40%', right: '0%',
            width: '55%', height: '45%',
            background: 'radial-gradient(ellipse, rgba(6, 182, 212, 0.15) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '0%', left: '25%',
            width: '50%', height: '40%',
            background: 'radial-gradient(ellipse, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
            filter: 'blur(55px)',
          }} />
        </div>

        {/* === LAYER 2: Living orbs — breathe AND drift === */}
        <div style={{
          position: 'absolute',
          top: '8%', left: '5%',
          width: 500, height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 60%)',
          filter: 'blur(30px)',
          animation: 'vbg-orb-drift 20s ease-in-out infinite, vbg-orb-glow 6s ease-in-out infinite',
          willChange: 'transform, opacity',
        }} />
        <div style={{
          position: 'absolute',
          top: '45%', right: '3%',
          width: 450, height: 450,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.18) 0%, transparent 60%)',
          filter: 'blur(35px)',
          animation: 'vbg-orb-drift 25s ease-in-out infinite 5s, vbg-orb-glow 8s ease-in-out infinite 2s',
          willChange: 'transform, opacity',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '5%', left: '30%',
          width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 60%)',
          filter: 'blur(40px)',
          animation: 'vbg-orb-drift 30s ease-in-out infinite 10s, vbg-orb-glow 10s ease-in-out infinite 4s',
          willChange: 'transform, opacity',
        }} />
        {/* Extra orb near hero CTA — draws eye upward */}
        <div style={{
          position: 'absolute',
          top: '15%', left: '40%',
          width: 350, height: 350,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(6, 182, 212, 0.08) 40%, transparent 60%)',
          filter: 'blur(25px)',
          animation: 'vbg-orb-glow 5s ease-in-out infinite 1s',
          willChange: 'transform, opacity',
        }} />

        {/* === LAYER 3: Flowing ribbons — 4 ribbons, clearly visible === */}
        <div style={{
          position: 'absolute',
          top: '15%', left: 0, right: 0,
          height: 160,
          background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.12) 15%, rgba(6, 182, 212, 0.14) 50%, rgba(139, 92, 246, 0.08) 85%, transparent)',
          filter: 'blur(20px)',
          animation: 'vbg-ribbon-1 18s linear infinite',
          willChange: 'transform',
        }} />
        <div style={{
          position: 'absolute',
          top: '42%', left: 0, right: 0,
          height: 120,
          background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.1) 25%, rgba(59, 130, 246, 0.12) 75%, transparent)',
          filter: 'blur(18px)',
          animation: 'vbg-ribbon-2 22s linear infinite',
          willChange: 'transform',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '20%', left: 0, right: 0,
          height: 140,
          background: 'linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.1) 30%, rgba(59, 130, 246, 0.08) 60%, transparent)',
          filter: 'blur(22px)',
          animation: 'vbg-ribbon-3 15s linear infinite',
          willChange: 'transform',
        }} />
        <div style={{
          position: 'absolute',
          top: '70%', left: 0, right: 0,
          height: 100,
          background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.08) 20%, rgba(139, 92, 246, 0.1) 50%, rgba(6, 182, 212, 0.06) 80%, transparent)',
          filter: 'blur(25px)',
          animation: 'vbg-ribbon-4 20s linear infinite',
          willChange: 'transform',
        }} />

        {/* === LAYER 4: Floating particles with scroll parallax — larger, more visible === */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${p1}px)`, willChange: 'transform' }}>
          {[
            { l: '8%', t: '10%', s: 5 },
            { l: '22%', t: '30%', s: 4 },
            { l: '45%', t: '6%', s: 6 },
            { l: '72%', t: '22%', s: 4 },
            { l: '88%', t: '12%', s: 5 },
            { l: '15%', t: '60%', s: 4 },
            { l: '55%', t: '68%', s: 5 },
            { l: '82%', t: '52%', s: 4 },
            { l: '35%', t: '85%', s: 5 },
            { l: '65%', t: '42%', s: 3 },
          ].map((dot, i) => (
            <div key={`b-${i}`} style={{
              position: 'absolute',
              left: dot.l, top: dot.t,
              width: dot.s, height: dot.s,
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.5)',
              boxShadow: '0 0 12px rgba(59, 130, 246, 0.3)',
              animation: `vbg-float-x ${6 + i * 0.5}s ease-in-out infinite ${i * 0.4}s`,
            }} />
          ))}
        </div>
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${p2}px)`, willChange: 'transform' }}>
          {[
            { l: '18%', t: '18%', s: 4 },
            { l: '38%', t: '42%', s: 5 },
            { l: '62%', t: '15%', s: 4 },
            { l: '78%', t: '38%', s: 5 },
            { l: '92%', t: '62%', s: 4 },
            { l: '5%', t: '78%', s: 5 },
            { l: '48%', t: '55%', s: 3 },
            { l: '28%', t: '92%', s: 4 },
          ].map((dot, i) => (
            <div key={`c-${i}`} style={{
              position: 'absolute',
              left: dot.l, top: dot.t,
              width: dot.s, height: dot.s,
              borderRadius: '50%',
              background: 'rgba(6, 182, 212, 0.45)',
              boxShadow: '0 0 12px rgba(6, 182, 212, 0.25)',
              animation: `vbg-float-x ${7 + i * 0.4}s ease-in-out infinite ${i * 0.5 + 1}s`,
            }} />
          ))}
        </div>
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${p3}px)`, willChange: 'transform' }}>
          {[
            { l: '12%', t: '40%', s: 4 },
            { l: '35%', t: '72%', s: 5 },
            { l: '58%', t: '48%', s: 4 },
            { l: '85%', t: '78%', s: 4 },
            { l: '48%', t: '28%', s: 5 },
            { l: '72%', t: '88%', s: 3 },
            { l: '8%', t: '92%', s: 4 },
          ].map((dot, i) => (
            <div key={`p-${i}`} style={{
              position: 'absolute',
              left: dot.l, top: dot.t,
              width: dot.s, height: dot.s,
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.4)',
              boxShadow: '0 0 12px rgba(139, 92, 246, 0.2)',
              animation: `vbg-float-x ${8 + i * 0.3}s ease-in-out infinite ${i * 0.7 + 2}s`,
            }} />
          ))}
        </div>

        {/* === LAYER 5: Dot grid with drift === */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.05) 1px, transparent 0)',
          backgroundSize: '48px 48px',
          animation: 'vbg-drift-2 45s ease-in-out infinite',
        }} />

        {/* === LAYER 6: Concentric pulse rings — visible === */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 600, height: 600,
          marginTop: -300, marginLeft: -300,
          borderRadius: '50%',
          border: '1px solid rgba(59, 130, 246, 0.06)',
          animation: 'vbg-pulse 5s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 900, height: 900,
          marginTop: -450, marginLeft: -450,
          borderRadius: '50%',
          border: '1px solid rgba(6, 182, 212, 0.05)',
          animation: 'vbg-pulse 7s ease-in-out infinite 2s',
        }} />
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 1200, height: 1200,
          marginTop: -600, marginLeft: -600,
          borderRadius: '50%',
          border: '1px solid rgba(139, 92, 246, 0.04)',
          animation: 'vbg-pulse 9s ease-in-out infinite 4s',
        }} />

        {/* === LAYER 7: Film grain === */}
        <div style={{
          position: 'absolute',
          inset: '-50%',
          width: '200%',
          height: '200%',
          opacity: 0.015,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          animation: 'vbg-grain 6s steps(8) infinite',
          pointerEvents: 'none',
        }} />
      </div>
    </>
  );
}
