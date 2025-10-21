export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { POST as runFetch } from '../fetch/route';

export async function POST(req: Request) {
  // Réutilise exactement la même logique que /api/news/fetch
  return runFetch(req);
}
