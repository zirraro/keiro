import * as React from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-neutral-200 bg-white/60 backdrop-blur-sm",
        "shadow-[0_10px_30px_-10px_rgba(0,0,0,.6)] hover:shadow-[0_14px_40px_-10px_rgba(0,0,0,.7)]",
        "transition",
        className
      )}
      {...props}
    />
  );
}
