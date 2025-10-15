import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(_req: NextRequest) {
  // Laisse tout passer (si tu as un contrôle d'API key, fais-le ici).
  return NextResponse.next();
}

// IMPORTANT: exécuter le middleware UNIQUEMENT sur les routes API
export const config = {
  matcher: ["/api/:path*"],
};
