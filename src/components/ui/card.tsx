'use client';
import * as React from 'react';

export function Card({ className='', children }: { className?: string; children?: React.ReactNode }) {
  return <div className={"rounded-2xl border bg-white shadow-sm " + className}>{children}</div>;
}
export function CardHeader({ className='', children }: any) {
  return <div className={"p-4 border-b " + className}>{children}</div>;
}
export function CardContent({ className='', children }: any) {
  return <div className={"p-4 " + className}>{children}</div>;
}
export function CardFooter({ className='', children }: any) {
  return <div className={"p-4 border-t " + className}>{children}</div>;
}
export default Card;
