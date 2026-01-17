import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

/**
 * API Route pour appliquer watermark + texte overlay CÔTÉ SERVEUR
 * Résout définitivement les problèmes CORS en faisant tout côté serveur avec sharp
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, watermark, textOverlay } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'URL d\'image manquante' },
        { status: 400 }
      );
    }

    console.log('[ApplyOverlays] Processing image:', imageUrl.substring(0, 100));

    // 1. Télécharger l'image depuis l'URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // 2. Charger l'image avec sharp pour obtenir les dimensions
    const imageMetadata = await sharp(imageBuffer).metadata();
    const width = imageMetadata.width || 1024;
    const height = imageMetadata.height || 1024;

    console.log('[ApplyOverlays] Image loaded:', width, 'x', height);

    // 3. Créer les overlays SVG
    const svgOverlays: string[] = [];

    // Watermark en bas à droite
    if (watermark && watermark.apply) {
      console.log('[ApplyOverlays] Applying watermark...');

      const watermarkText = 'keiro.ai';
      // Taille proportionnelle à l'image (3% de la largeur minimum)
      const fontSize = Math.max(48, Math.floor(width * 0.03));
      const padding = Math.floor(width * 0.02);
      const textWidth = watermarkText.length * fontSize * 0.6;
      const x = width - textWidth - padding;
      const y = height - padding;

      svgOverlays.push(`
        <!-- Watermark avec ombre portée forte -->
        <text x="${x}" y="${y}"
              font-family="Arial, Helvetica, sans-serif"
              font-size="${fontSize}"
              font-weight="900"
              fill="white"
              stroke="rgba(0,0,0,0.8)"
              stroke-width="3"
              paint-order="stroke"
              style="text-shadow: 4px 4px 8px rgba(0,0,0,0.9);">${watermarkText}</text>
      `);

      console.log('[ApplyOverlays] ✅ Watermark SVG created');
    }

    // Texte overlay centré
    if (textOverlay && textOverlay.text) {
      console.log('[ApplyOverlays] Applying text overlay:', textOverlay.text);

      // Échapper les caractères spéciaux XML
      const rawText = textOverlay.text;
      const text = rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      // Taille BEAUCOUP plus grande : 8-12% de la largeur de l'image
      const fontSize = Math.max(80, Math.floor(width * 0.10));
      const strokeWidth = Math.max(4, Math.floor(fontSize * 0.08));

      svgOverlays.push(`
        <!-- Text overlay SANS fond, avec ombre portée très forte -->
        <text x="${width / 2}" y="${height / 2}"
              font-family="Arial, Helvetica, sans-serif"
              font-size="${fontSize}"
              font-weight="900"
              fill="white"
              stroke="rgba(0,0,0,0.9)"
              stroke-width="${strokeWidth}"
              paint-order="stroke"
              text-anchor="middle"
              dominant-baseline="middle"
              style="text-shadow: 6px 6px 12px rgba(0,0,0,1);">${text}</text>
      `);

      console.log('[ApplyOverlays] ✅ Text overlay SVG created');
    }

    // 4. Composer l'image avec les overlays SVG
    let finalBuffer: Buffer = imageBuffer;

    if (svgOverlays.length > 0) {
      const svgOverlay = `
        <svg width="${width}" height="${height}">
          ${svgOverlays.join('\n')}
        </svg>
      `;

      console.log('[ApplyOverlays] Compositing overlays...');

      finalBuffer = await sharp(imageBuffer)
        .composite([
          {
            input: Buffer.from(svgOverlay),
            top: 0,
            left: 0
          }
        ])
        .png()
        .toBuffer() as any;
    }

    // 5. Convertir en data URL
    const base64 = finalBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    console.log('[ApplyOverlays] ✅ All overlays applied, size:', finalBuffer.length, 'bytes');

    return NextResponse.json({
      ok: true,
      dataUrl,
      size: finalBuffer.length
    });

  } catch (error: any) {
    console.error('[ApplyOverlays] ❌ Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Erreur lors de l\'application des overlays'
      },
      { status: 500 }
    );
  }
}
