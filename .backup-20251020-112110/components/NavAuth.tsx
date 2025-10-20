// @ts-nocheck
'use client';
import Link from 'next/link';

export default function NavAuth() {
  return (
    <div className="ml-auto flex items-center gap-3">
      <Link
        href="/login"
        className="inline-flex items-center rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        Se connecter
      </Link>
    </div>
  );
}
