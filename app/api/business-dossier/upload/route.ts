import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_USER = 10;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/business-dossier/upload
 * Upload a file (logo or document) to Supabase Storage.
 * FormData: file (File), type ('logo' | 'document')
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Connexion requise' },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileType = (formData.get('type') as string) || 'document';

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'Aucun fichier fourni' },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: 'Fichier trop volumineux (max 5 Mo)' },
        { status: 400 },
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: 'Type de fichier non supporte. Formats acceptes: JPG, PNG, WebP, PDF, DOC' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // Check file count for non-logo uploads
    if (fileType !== 'logo') {
      const { data: dossier } = await supabase
        .from('business_dossiers')
        .select('uploaded_files')
        .eq('user_id', user.id)
        .single();

      const existingFiles = Array.isArray(dossier?.uploaded_files) ? dossier.uploaded_files : [];
      if (existingFiles.length >= MAX_FILES_PER_USER) {
        return NextResponse.json(
          { ok: false, error: `Maximum ${MAX_FILES_PER_USER} fichiers par utilisateur` },
          { status: 400 },
        );
      }
    }

    // Generate unique file path
    const ext = file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 50);
    const filePath = fileType === 'logo'
      ? `${user.id}/logo_${timestamp}.${ext}`
      : `${user.id}/${timestamp}_${safeName}`;

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('business-assets')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[Upload] Supabase Storage error:', uploadError);
      return NextResponse.json(
        { ok: false, error: 'Erreur lors du telechargement: ' + uploadError.message },
        { status: 500 },
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('business-assets')
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl || '';

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  } catch (error: any) {
    console.error('[Upload] Error:', error?.message);
    return NextResponse.json(
      { ok: false, error: 'Erreur serveur' },
      { status: 500 },
    );
  }
}
