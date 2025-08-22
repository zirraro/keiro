import * as React from "react";
import { cn } from "../../lib/utils";

export function ShineButton({
  className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center rounded-lg px-5 py-2 font-semibold",
        "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow hover:shadow-lg",
        "transition-transform active:scale-[0.99] overflow-hidden",
        className
      )}
      {...props}
    >
      <span className="relative z-[1]">{children}</span>
      {/* reflets */}
      <span className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity">
        <span className="absolute -inset-1 bg-[radial-gradient(200px_80px_at_0%_50%,rgba(255,255,255,.25),transparent)]" />
        <span className="absolute inset-0">
          <span className="absolute -left-1/3 top-0 h-full w-1/3 rotate-12 bg-gradient-to-r from-white/50 via-white/10 to-transparent animate-[shine_1.8s_ease-in-out_infinite]" />
        </span>
      </span>
      <style jsx>{`
        @keyframes shine {
          0% { transform: translateX(-100%) rotate(12deg); }
          100% { transform: translateX(300%) rotate(12deg); }
        }
      `}</style>
    </button>
  );
}
