import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

/**
 * API Route: Update image URL in saved_images
 * POST /api/library/update-image
 */
export async function POST(req: NextRequest) {
  try {
    const { imageId, newImageUrl, textOverlay, originalImageUrl } = await req.json();

    if (!imageId || !newImageUrl) {
      return NextResponse.json({ ok: false, error: 'imageId and newImageUrl are required' }, { status: 400 });
    }

    const { user } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const updateData: Record<string, any> = { image_url: newImageUrl };
    if (textOverlay !== undefined) {
      updateData.text_overlay = textOverlay;
    }
    if (originalImageUrl !== undefined) {
      updateData.original_image_url = originalImageUrl;
    }

    const { error } = await supabase
      .from('saved_images')
      .update(updateData)
      .eq('id', imageId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[UpdateImage] Error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[UpdateImage] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
