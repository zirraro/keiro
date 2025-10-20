import * as React from 'react';

export function SectionReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // No-op wrapper so NOTHING can cover/capture clicks by mistake
  return <div className={className} style={{ position: 'relative', pointerEvents: 'auto' }}>{children}</div>;
}
