import * as React from "react";
import { cn } from "../../lib/utils";

export function Modal({
  open, onClose, children, className
}: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={cn(
        "absolute inset-0 flex items-center justify-center p-4",
      )}>
        <div className={cn(
          "w-full max-w-4xl rounded-2xl border border-neutral-200 bg-white",
          "shadow-[0_20px_60px_-20px_rgba(0,0,0,.8)]",
          className
        )}>
          {children}
        </div>
      </div>
    </div>
  );
}
