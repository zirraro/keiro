import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "px-4 py-2 rounded-lg font-medium transition",
          variant === "default"
            ? "bg-white text-black hover:bg-neutral-200"
            : "border border-neutral-700 hover:bg-neutral-800",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
