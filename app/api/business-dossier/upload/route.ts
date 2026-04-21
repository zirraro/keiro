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

    // Logo auto-analysis: when the client uploads their logo, run it
    // through Claude Vision to extract the brand palette and persist
    // it to business_dossiers.brand_colors + logo_url automatically.
    // This lets agents use the RIGHT brand colors in every generation
    // from day one — no manual hex entry needed.
    let extractedPalette: string[] | null = null;
    if (fileType === 'logo' && file.type.startsWith('image/')) {
      try {
        const { data: dossier } = await supabase
          .from('business_dossiers')
          .select('business_type, brand_colors')
          .eq('user_id', user.id)
          .maybeSingle();

        const { analyzeImageForAgent } = await import('@/lib/agents/visual-analyzer');
        const analysis = await analyzeImageForAgent(publicUrl, 'content', dossier?.business_type || null);
        if (analysis && analysis.color_palette && analysis.color_palette.length > 0) {
          extractedPalette = analysis.color_palette;
          // Format: "#FF6B6B, #4ECDC4, #2E86AB" — human-readable + easy
          // for agents to pick from.
          const paletteStr = extractedPalette.join(', ');

          // Typography + personality + icon style also extracted when
          // Claude detects the image is a logo. They get folded into
          // the dossier alongside brand_colors so every agent sees a
          // consistent brand signal downstream.
          const updates: Record<string, any> = {
            user_id: user.id,
            logo_url: publicUrl,
            updated_at: new Date().toISOString(),
          };
          if (!dossier?.brand_colors) updates.brand_colors = paletteStr;
          if (analysis.typography_style) {
            // Merge into visual_style when empty; append otherwise so a
            // hand-picked style isn't overwritten but is enriched.
            const existing = (dossier as any)?.visual_style as string | undefined;
            updates.visual_style = existing
              ? `${existing} · typo logo : ${analysis.typography_style}`
              : `typo logo : ${analysis.typography_style}`;
          }
          if (analysis.brand_personality && analysis.brand_personality.length > 0) {
            // Brand personality goes into content_themes as a seed for
            // Jade's tone (clients can refine later).
            const existing = (dossier as any)?.content_themes as string | undefined;
            const fromLogo = analysis.brand_personality.slice(0, 4).join(', ');
            updates.content_themes = existing
              ? `${existing} · vibes logo : ${fromLogo}`
              : `vibes logo : ${fromLogo}`;
          }
          await supabase.from('business_dossiers').upsert(updates, { onConflict: 'user_id' });
        } else {
          // Even without analysis, remember the logo URL.
          await supabase.from('business_dossiers').upsert({
            user_id: user.id,
            logo_url: publicUrl,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        }
      } catch (e: any) {
        console.error('[Upload] Logo analysis failed:', String(e?.message || e).substring(0, 200));
      }
    }

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      name: file.name,
      type: file.type,
      size: file.size,
      extracted_palette: extractedPalette,
    });
  } catch (error: any) {
    console.error('[Upload] Error:', error?.message);
    return NextResponse.json(
      { ok: false, error: 'Erreur serveur' },
      { status: 500 },
    );
  }
}
