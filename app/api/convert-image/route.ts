import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route pour convertir une URL d'image externe en data URL
 * Résout les problèmes CORS en téléchargeant l'image côté serveur
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'URL d\'image manquante' },
        { status: 400 }
      );
    }

    console.log('[ConvertImage] Downloading image from:', imageUrl.substring(0, 100));

    // Télécharger l'image depuis l'URL externe (pas de CORS côté serveur)
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Récupérer le blob
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convertir en base64
    const base64 = buffer.toString('base64');
    const mimeType = blob.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    console.log('[ConvertImage] ✅ Image converted successfully, size:', buffer.length, 'bytes');

    return NextResponse.json({
      ok: true,
      dataUrl,
      size: buffer.length,
      mimeType
    });

  } catch (error: any) {
    console.error('[ConvertImage] ❌ Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Erreur lors de la conversion de l\'image'
      },
      { status: 500 }
    );
  }
}
