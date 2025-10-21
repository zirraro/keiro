import type { NextRequest } from 'next/server';
export function middleware(_req: NextRequest) {
  return; // ne touche jamais /api/**
}
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
