import type { NextRequest } from 'next/server';
export function middleware(_req: NextRequest) {
  // Ne jamais toucher /api/** (matcher ci-dessous)
  return;
}
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
