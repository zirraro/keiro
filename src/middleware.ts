import type { NextRequest } from 'next/server';
export function middleware(_req: NextRequest) {
  // ne jamais toucher /api/** (le matcher fait déjà le filtre)
  return;
}
/** Ne pas exécuter le middleware sur:
 *  - api
 *  - assets Next
 *  - favicon
 */
export const config = {
  matcher: [
    // tout sauf /api, /_next/static, /_next/image, /favicon.ico
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
