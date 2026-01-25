import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy pour les images Instagram
 * Contourne les restrictions CORS du CDN Instagram
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'URL manquante' },
        { status: 400 }
      );
    }

    // Récupérer l'image depuis Instagram
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Retourner l'image avec les bons headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400', // Cache 24h
      },
    });
  } catch (error: any) {
    console.error('[Instagram Proxy] Error:', error.message);
    return NextResponse.json(
      { error: 'Erreur lors du chargement de l\'image' },
      { status: 500 }
    );
  }
}
