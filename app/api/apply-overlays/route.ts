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
      const fontSize = 32;
      const padding = 20;
      const textWidth = watermarkText.length * fontSize * 0.6; // Approximation
      const x = width - textWidth - padding;
      const y = height - padding - 10;

      svgOverlays.push(`
        <!-- Watermark background -->
        <rect x="${x - 6}" y="${y - 28}" width="${textWidth + 12}" height="${fontSize + 8}"
              fill="rgba(0,0,0,0.5)" rx="4"/>
        <!-- Watermark text -->
        <text x="${x}" y="${y}"
              font-family="Arial, sans-serif"
              font-size="${fontSize}"
              font-weight="bold"
              fill="white">${watermarkText}</text>
      `);

      console.log('[ApplyOverlays] ✅ Watermark SVG created');
    }

    // Texte overlay centré
    if (textOverlay && textOverlay.text) {
      console.log('[ApplyOverlays] Applying text overlay:', textOverlay.text);

      const text = textOverlay.text;
      const fontSize = 64;
      const textWidth = text.length * fontSize * 0.6; // Approximation
      const x = (width - textWidth) / 2;
      const y = height / 2;
      const padding = 40;

      svgOverlays.push(`
        <!-- Text overlay background -->
        <rect x="${x - padding}" y="${y - fontSize - padding}"
              width="${textWidth + padding * 2}" height="${fontSize + padding * 2}"
              fill="rgba(0,0,0,0.6)" rx="8"/>
        <!-- Text overlay -->
        <text x="${width / 2}" y="${y}"
              font-family="Arial, sans-serif"
              font-size="${fontSize}"
              font-weight="bold"
              fill="white"
              text-anchor="middle"
              dominant-baseline="middle">${text}</text>
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
