import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname || '';
  if (p.startsWith('/api/news') || p.startsWith('/api/ping')) {
    return NextResponse.next();
  }
  return NextResponse.next(); // rien d'autre
}

export const config = { matcher: ['/:path*'] };
