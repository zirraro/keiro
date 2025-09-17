"use client";
import { useRef } from "react";

const BRANDS = [
  "LinkedIn","X","Shopify","Stripe","Zapier","Notion",
  "Figma","Instagram","TikTok","Facebook","LinkedIn","X",
];

export default function BrandsTicker() {
  const trackRef = useRef<HTMLDivElement>(null);

  // Pause / resume au survol
  const onEnter = () => { if (trackRef.current) trackRef.current.style.animationPlayState = "paused"; };
  const onLeave = () => { if (trackRef.current) trackRef.current.style.animationPlayState = "running"; };

  // On duplique la liste pour une boucle continue
  const items = [...BRANDS, ...BRANDS];

  return (
    <div className="relative">
      {/* lueur bleue */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1A73E8]/15 blur-2xl" />
      <div
        className="relative max-w-6xl mx-auto px-2 py-3 rounded-full bg-white ring-1 ring-black/5 shadow-[0_10px_30px_rgba(15,23,42,.03)] overflow-hidden"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        <div
          ref={trackRef}
          className="flex gap-10 whitespace-nowrap will-change-transform"
          style={{ animation: "brand-scroll 38s linear infinite" }}
          aria-label="Réseaux compatibles"
        >
          {items.map((b, i) => (
            <span
              key={`${b}-${i}`}
              className="text-[13px] text-[#64748B] select-none"
            >
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* keyframes + reduced motion */}
      <style jsx global>{`
        @keyframes brand-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .will-change-transform { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
