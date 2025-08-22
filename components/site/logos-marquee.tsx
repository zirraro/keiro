export default function LogosMarquee() {
  const logos = ["Café du Marché","Pizzeria Roma","Studio Fit","Green Beauty","Urban Bar","SneakShop"];
  return (
    <div className="relative overflow-hidden border border-neutral-800 rounded-xl bg-neutral-900/40 py-4">
      <div className="animate-[marquee_20s_linear_infinite] whitespace-nowrap">
        {logos.concat(logos).map((name, i) => (
          <span key={i} className="mx-6 inline-block text-neutral-400 text-sm">• {name}</span>
        ))}
      </div>
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
