import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Middleware désactivé - le contrôle d'accès est géré par le modèle freemium
// dans les composants (GenerationContext) pour permettre l'accès aux visiteurs

export async function middleware(req: NextRequest) {
  // Laisser passer toutes les requêtes
  return NextResponse.next()
}

// Pas de matcher - le middleware ne bloque aucune route
export const config = { matcher: [] }
