import * as React from "react";
import { cn } from "../../lib/utils";

export function TiltCard({
  className,
  children,
  glow = "rgba(59,130,246,.25)",
  maxTilt = 10,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glow?: string; maxTilt?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (py - 0.5) * -2 * maxTilt;
    const ry = (px - 0.5) * 2 * maxTilt;

    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
    el.style.setProperty("--px", `${px}`);
    el.style.setProperty("--py", `${py}`);
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn(
        "relative rounded-2xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-sm",
        "transition-transform [transform:perspective(800px)_rotateX(var(--rx))_rotateY(var(--ry))]",
        "shadow-[0_10px_30px_-10px_rgba(0,0,0,.6)] hover:shadow-[0_16px_50px_-12px_rgba(0,0,0,.75)]",
        "before:absolute before:inset-0 before:rounded-2xl before:opacity-0 hover:before:opacity-100 before:transition-opacity",
        className
      )}
      style={{
        // glow qui suit la souris
        background: `radial-gradient(600px 200px at calc(var(--px,0)*100%) calc(var(--py,0)*100%), ${glow}, transparent 60%)`,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
