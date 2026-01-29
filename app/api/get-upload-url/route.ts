import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * POST /api/get-upload-url
 * Génère une signed URL pour upload direct vers Supabase Storage
 * Bypasse les limites de payload de Vercel (4.5MB)
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { user, error: authError } = await getAuthUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { filename, fileType, fileSize } = body;

    if (!filename || !fileType || !fileSize) {
      return NextResponse.json(
        { ok: false, error: 'Paramètres manquants (filename, fileType, fileSize)' },
        { status: 400 }
      );
    }

    // 3. Validate file type and size
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (fileSize > maxSize) {
      return NextResponse.json(
        { ok: false, error: 'Fichier trop volumineux (max 50MB)' },
        { status: 413 }
      );
    }

    // Validate video formats
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!allowedTypes.includes(fileType)) {
      return NextResponse.json(
        { ok: false, error: 'Format vidéo non supporté' },
        { status: 400 }
      );
    }

    // 4. Initialize Supabase client with service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Generate unique storage path
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `user-videos/${user.id}/${timestamp}-${sanitizedFilename}`;

    // 6. Create signed URL for upload (expires in 10 minutes)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('generated-images')
      .createSignedUploadUrl(storagePath);

    if (signedUrlError || !signedUrlData) {
      console.error('[GetUploadUrl] Error creating signed URL:', signedUrlError);
      return NextResponse.json(
        { ok: false, error: 'Impossible de générer l\'URL d\'upload' },
        { status: 500 }
      );
    }

    console.log('[GetUploadUrl] Signed URL generated for:', storagePath);

    // 7. Return signed URL and storage path
    return NextResponse.json({
      ok: true,
      signedUrl: signedUrlData.signedUrl,
      token: signedUrlData.token,
      path: storagePath
    });

  } catch (error: any) {
    console.error('[GetUploadUrl] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la génération de l\'URL' },
      { status: 500 }
    );
  }
}
