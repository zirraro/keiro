'use client';
import React from 'react';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean };
export function Toggle({ pressed=false, className='', ...rest }: Props) {
  return (
    <button
      aria-pressed={pressed}
      className={`rounded-md border px-2 py-1 text-sm ${pressed?'bg-black text-white':'bg-white'} ${className}`}
      {...rest}
    />
  );
}
export default Toggle;
