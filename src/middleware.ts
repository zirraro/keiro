import type { NextRequest } from 'next/server'
export function middleware(req: NextRequest) { return; } // no-op
export const config = { matcher: ['/generate', '/api/:path*'] }
