import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname || '';
  // Bypass complet pour nos API news & ping
  if (pathname.startsWith('/api/news') || pathname.startsWith('/api/ping')) {
    return NextResponse.next();
  }
  return _origMiddleware(req);
}

export function _origMiddleware(_req: NextRequest) {
  // Rien d'autre pour l'instant
  return NextResponse.next();
}

export const config = { matcher: ['/:path*'] };
