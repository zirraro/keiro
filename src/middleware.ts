import type { NextRequest } from 'next/server'
export function middleware(req: NextRequest) { return; } // no-op
export const config = {
  matcher: [
    // tout sauf ces chemins :
    "/((?!api/news|api/ping|_next|favicon.ico|.*\\.(png|jpg|svg|ico)).*)",
  ],
};
