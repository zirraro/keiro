import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * API Route pour appliquer watermark + texte overlay CÔTÉ SERVEUR
 * Utilise @napi-rs/canvas pour un rendu de texte fiable et performant
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
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);

    // 2. Charger l'image avec Canvas
    const image = await loadImage(imageBuffer);
    const width = image.width;
    const height = image.height;

    console.log('[ApplyOverlays] Image loaded:', width, 'x', height);

    // 3. Créer un canvas et dessiner l'image
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Dessiner l'image de base
    ctx.drawImage(image, 0, 0);

    // 4. Appliquer le watermark en bas à droite
    if (watermark && watermark.apply) {
      console.log('[ApplyOverlays] Applying watermark...');

      const watermarkText = 'keiro.ai';
      const fontSize = Math.max(48, Math.floor(width * 0.04)); // 4% de la largeur
      const padding = Math.floor(width * 0.02);

      ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';

      const x = width - padding;
      const y = height - padding;

      // Ombre portée forte
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;

      // Contour noir
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.lineWidth = Math.max(3, Math.floor(fontSize * 0.08));
      ctx.strokeText(watermarkText, x, y);

      // Texte blanc
      ctx.fillStyle = 'white';
      ctx.fillText(watermarkText, x, y);

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      console.log('[ApplyOverlays] ✅ Watermark applied');
    }

    // 5. Appliquer le texte overlay centré
    if (textOverlay && textOverlay.text) {
      console.log('[ApplyOverlays] Applying text overlay:', textOverlay.text);

      const text = textOverlay.text;
      const fontSize = Math.max(80, Math.floor(width * 0.10)); // 10% de la largeur

      ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const x = width / 2;
      const y = height / 2;

      // Ombre portée très forte
      ctx.shadowColor = 'rgba(0, 0, 0, 1)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 6;
      ctx.shadowOffsetY = 6;

      // Contour noir épais
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
      ctx.lineWidth = Math.max(6, Math.floor(fontSize * 0.10));
      ctx.strokeText(text, x, y);

      // Texte blanc
      ctx.fillStyle = 'white';
      ctx.fillText(text, x, y);

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      console.log('[ApplyOverlays] ✅ Text overlay applied');
    }

    // 6. Convertir le canvas en buffer PNG
    const finalBuffer = canvas.toBuffer('image/png');

    // 7. Convertir en data URL
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
