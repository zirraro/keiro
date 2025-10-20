'use client';
import React from 'react';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default'|'outline' };
export function Button({ className='', variant='default', ...rest }: Props) {
  const base = 'inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition';
  const styles = variant==='outline'
    ? 'border border-neutral-300 bg-white hover:bg-neutral-50'
    : 'bg-black text-white hover:opacity-90';
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}
export default Button;
