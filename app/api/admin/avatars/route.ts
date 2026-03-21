import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAllAgentAvatars, updateAgentAvatar, invalidateAvatarCache } from '@/lib/agents/avatar';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/admin/avatars — List all agent avatars
 */
export async function GET() {
  try {
    const avatars = await getAllAgentAvatars(supabaseAdmin);
    return NextResponse.json({ avatars });
  } catch (error: any) {
    console.error('[AdminAvatars] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/avatars — Update an agent's avatar config
 * Body: { id: string, display_name?, title?, personality?, custom_instructions?, is_active?, avatar_url? }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing agent id' }, { status: 400 });
    }

    const result = await updateAgentAvatar(supabaseAdmin, id, updates);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[AdminAvatars] PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/avatars — Upload avatar image
 * FormData: { id: string, file: File }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const id = formData.get('id') as string;
    const file = formData.get('file') as File;

    if (!id || !file) {
      return NextResponse.json({ error: 'Missing id or file' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 400 });
    }

    const uploadType = formData.get('type') as string | null; // '3d' or null
    const is3D = uploadType === '3d';

    const ext = file.name.split('.').pop() || 'png';
    const fileName = is3D ? `agent-avatars/${id}-3d.${ext}` : `agent-avatars/${id}.${ext}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from('public-assets')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      // Try creating the bucket if it doesn't exist
      if (uploadError.message.includes('not found')) {
        await supabaseAdmin.storage.createBucket('public-assets', { public: true });
        const { error: retryError } = await supabaseAdmin.storage
          .from('public-assets')
          .upload(fileName, buffer, { contentType: file.type, upsert: true });
        if (retryError) {
          return NextResponse.json({ error: retryError.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('public-assets')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Update the avatar record with appropriate field
    if (is3D) {
      await updateAgentAvatar(supabaseAdmin, id, { avatar_3d_url: publicUrl } as any);
    } else {
      await updateAgentAvatar(supabaseAdmin, id, { avatar_url: publicUrl });
    }

    return NextResponse.json({ success: true, avatar_url: publicUrl, type: is3D ? '3d' : 'classic' });
  } catch (error: any) {
    console.error('[AdminAvatars] POST upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
