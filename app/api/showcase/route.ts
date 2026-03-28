import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

/**
 * GET /api/showcase?type=restaurant&limit=5
 * Returns showcase images for a given business type.
 * Used by email templates and DM agents to include example visuals.
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || 'restaurant';
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '5');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get images for this type, fallback to generic
  let { data: images } = await supabase
    .from('showcase_images')
    .select('id, image_url, title, description, business_type')
    .eq('business_type', type)
    .eq('is_active', true)
    .order('usage_count', { ascending: true }) // Least used first (rotation)
    .limit(limit);

  // Fallback to generic if no type-specific images
  if (!images || images.length === 0) {
    const { data: generic } = await supabase
      .from('showcase_images')
      .select('id, image_url, title, description, business_type')
      .eq('business_type', 'generic')
      .eq('is_active', true)
      .limit(limit);
    images = generic || [];
  }

  // Increment usage count for rotation (fire and forget)
  if (images.length > 0) {
    for (const img of images) {
      supabase.from('showcase_images').update({ usage_count: 1 }).eq('id', img.id).then(() => {});
    }
  }

  return NextResponse.json({ ok: true, images, type });
}
