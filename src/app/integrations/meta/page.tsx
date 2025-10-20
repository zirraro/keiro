export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react';
import MetaClient from './MetaClient';

export default function MetaIntegrationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Chargement…</div>}>
      <MetaClient />
    </Suspense>
  );
}
