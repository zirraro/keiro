'use client';

export default function LogosMarquee() {
  const items = [
    "Instagram", "TikTok", "Facebook", "LinkedIn", "X",
    "Shopify", "Stripe", "Zapier", "Notion", "Figma"
  ];
  return (
    <div className="relative overflow-hidden border border-neutral-800 rounded-xl bg-neutral-900/40">
      <div className="flex gap-10 py-3 animate-[scroll_20s_linear_infinite] whitespace-nowrap px-4">
        {[...items, ...items].map((label, i) => (
          <span key={i} className="text-neutral-300 text-sm opacity-80">
            {label}
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
