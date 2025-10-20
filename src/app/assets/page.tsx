export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import AssetsPage from './page.client';

export default function Page() {
  return <AssetsPage />;
}
