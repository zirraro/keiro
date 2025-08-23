'use client';

import * as React from "react";
import { cn } from "../../lib/utils";

export function ShineButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "relative group inline-flex items-center justify-center rounded-lg px-5 py-2 font-semibold",
        "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow hover:shadow-lg",
        "transition-transform active:scale-[0.99] overflow-hidden",
        className
      )}
      {...props}
    >
      <span className="relative z-10">{children}</span>

      {/* Shine effect without styled-jsx */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        <span
          className={cn(
            "absolute left-[-150%] top-0 h-full w-1/3",
            "bg-gradient-to-r from-white/40 via-white/10 to-transparent",
            "-skew-x-12 transition-transform duration-700 ease-out",
            "group-hover:translate-x-[450%]"
          )}
        />
      </span>
    </button>
  );
}
