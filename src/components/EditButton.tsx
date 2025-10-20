'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function EditButton({ srcUrl }: { srcUrl: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function onClick() {
    try { setBusy(true); router.push(`/editor?src=${encodeURIComponent(srcUrl)}`); }
    finally { setBusy(false); }
  }
  return <button className="btn" onClick={onClick} disabled={busy}>{busy?'Ouverture…':'Éditer'}</button>;
}
