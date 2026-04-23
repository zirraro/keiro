/**
 * Composite a dish/product photo onto a venue photo using sharp, then
 * upload the composite to Supabase Storage and return a public URL.
 *
 * Why this exists: Seedream i2i alone at strength 0.25 regenerates too
 * much of the input image — we were losing the client's real venue. The
 * fix is to do the COMPOSITING ourselves (pixel-level overlay), then
 * optionally run a low-strength i2i on the composite for cohesion
 * (matching lighting + colour grade across the seam). The client sees
 * their actual dish on their actual table in their actual dining room.
 *
 * Approach:
 *   1. Download venue + dish images
 *   2. Resize dish to ~30% of venue width (a plate on a table) and
 *      feather its edges
 *   3. Paste dish into lower-center of venue (where a table surface
 *      usually is on a dining-room photo)
 *   4. Write the composite back to storage
 */

import { createClient } from '@supabase/supabase-js';

let sharpMod: any = null;
async function getSharp() {
  if (!sharpMod) {
    sharpMod = (await import('sharp')).default;
  }
  return sharpMod;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Build the composite and return the public URL of the uploaded JPEG.
 * Returns null on any failure so the caller can fall back to plain i2i.
 */
export async function compositeDishOnVenue(params: {
  venueUrl: string;
  dishUrl: string;
  postId: string;
  aspect?: 'square' | 'story';
}): Promise<string | null> {
  try {
    const sharp = await getSharp();
    const [venueBuf, dishBuf] = await Promise.all([
      fetchBuffer(params.venueUrl),
      fetchBuffer(params.dishUrl),
    ]);
    if (!venueBuf || !dishBuf) {
      console.warn('[dish-in-venue] Missing buffer:', { venue: !!venueBuf, dish: !!dishBuf });
      return null;
    }

    // Target canvas per aspect ratio (square for feed, 9:16 for story)
    const targetW = params.aspect === 'story' ? 1440 : 1920;
    const targetH = params.aspect === 'story' ? 2560 : 1920;

    // Fit venue to canvas (cover, so it fills). Keep it slightly cooler
    // in tone so the overlaid dish pops without looking pasted.
    const venueBase = await sharp(venueBuf)
      .resize(targetW, targetH, { fit: 'cover', position: 'center' })
      .modulate({ brightness: 0.95, saturation: 0.88 })
      .jpeg({ quality: 92 })
      .toBuffer();

    // Dish should occupy ~42% of width, placed lower-center where a
    // table typically sits in a dining-room photo. Feather edges with
    // a rounded alpha mask so the composite doesn't look like sticker-
    // slapped pasting.
    const dishW = Math.round(targetW * 0.44);
    const dishH = Math.round(dishW * 0.75); // slight landscape bias — plates on tables
    const dishResized = await sharp(dishBuf)
      .resize(dishW, dishH, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 94 })
      .toBuffer();

    // Rounded-corner alpha mask on the dish edges (softens the seam)
    const radius = Math.round(dishW * 0.10);
    const maskSvg = Buffer.from(`
      <svg width="${dishW}" height="${dishH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="blur"><feGaussianBlur stdDeviation="8"/></filter>
        </defs>
        <rect x="0" y="0" width="${dishW}" height="${dishH}" rx="${radius}" ry="${radius}" fill="white" filter="url(#blur)"/>
      </svg>
    `);
    const dishWithAlpha = await sharp(dishResized)
      .composite([{ input: maskSvg, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // Soft shadow under the dish for depth
    const shadowSvg = Buffer.from(`
      <svg width="${dishW + 40}" height="${dishH + 40}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="sh"><feGaussianBlur stdDeviation="18"/></filter>
        </defs>
        <ellipse cx="${(dishW + 40) / 2}" cy="${dishH + 20}" rx="${dishW * 0.40}" ry="14" fill="black" opacity="0.35" filter="url(#sh)"/>
      </svg>
    `);

    const posX = Math.round((targetW - dishW) / 2);
    const posY = Math.round(targetH * 0.52); // lower-center — table surface

    const composite = await sharp(venueBase)
      .composite([
        // shadow slightly offset below the dish
        { input: shadowSvg, top: posY + Math.round(dishH * 0.80), left: posX - 20 },
        // dish itself
        { input: dishWithAlpha, top: posY, left: posX },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    // Upload to business-assets/composites/ (public bucket)
    const sb = admin();
    const path = `composites/${params.postId}-${Date.now()}.jpg`;
    const { error } = await sb.storage
      .from('business-assets')
      .upload(path, composite, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      console.error('[dish-in-venue] Upload failed:', error.message);
      return null;
    }
    const { data } = sb.storage.from('business-assets').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err: any) {
    console.error('[dish-in-venue] Composite failed:', err?.message);
    return null;
  }
}
