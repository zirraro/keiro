import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2",
        "text-sm placeholder:text-neutral-600",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
