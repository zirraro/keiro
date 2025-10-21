import type { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname || '';
  // Bypass News & Ping
  if (pathname.startsWith('/api/news') || pathname.startsWith('/api/ping')) {
    return NextResponse.next();
  }
  return _origMiddleware(req);
}
export function _origMiddleware(req: NextRequest) { return; } // no-op
export const config = { matcher: ['/:path*'] };
