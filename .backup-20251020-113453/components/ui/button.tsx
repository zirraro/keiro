import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950",
          variant === "primary" &&
            "px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 shadow-sm hover:shadow-md focus-visible:ring-blue-500",
          variant === "outline" &&
            "px-4 py-2 border border-neutral-300 hover:bg-neutral-100 text-neutral-900",
          variant === "ghost" &&
            "px-3 py-2 hover:bg-neutral-100 text-neutral-200",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
