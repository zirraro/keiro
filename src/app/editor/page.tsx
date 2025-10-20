export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';
import EditorClient from './EditorClient';

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="p-6">Chargement de l’éditeur…</div>}>
      <EditorClient />
    </Suspense>
  );
}
