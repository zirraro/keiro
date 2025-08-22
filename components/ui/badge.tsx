import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className, active, children, ...props
}: React.HTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "px-3 py-1 rounded-full border text-sm transition",
        active
          ? "bg-white text-black border-white"
          : "border-neutral-700 text-neutral-200 hover:bg-neutral-900",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
