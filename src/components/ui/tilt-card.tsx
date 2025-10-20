'use client';
import React from 'react';
export function TiltCard({ className='', children }: React.PropsWithChildren<{className?:string}>) {
  return <div className={`rounded-xl border shadow-sm ${className}`}>{children}</div>;
}
export default TiltCard;
