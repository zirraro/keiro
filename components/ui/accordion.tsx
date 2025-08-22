import * as React from "react";
import { cn } from "../../lib/utils";

export function Accordion({
  children, className
}: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export function AccordionItem({
  title, children, defaultOpen=false
}: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-neutral-900/70"
      >
        <span className="font-medium">{title}</span>
        <span className={cn(
          "transition-transform text-neutral-400",
          open ? "rotate-45" : "rotate-0"
        )}>+</span>
      </button>
      <div className={cn(
        "px-4 overflow-hidden transition-[max-height,opacity] duration-300",
        open ? "opacity-100 max-h-96 py-2" : "opacity-0 max-h-0"
      )}>
        <div className="text-sm text-neutral-400 pb-3">{children}</div>
      </div>
    </div>
  );
}
