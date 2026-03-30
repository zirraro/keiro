import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/business-dossier
 * Load business dossier for authenticated user.
 */
export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Connexion requise' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('business_dossiers')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No dossier yet
      return NextResponse.json({ ok: true, dossier: null });
    }

    if (error) {
      console.error('[BusinessDossier] GET error:', error);
      return NextResponse.json(
        { ok: false, error: 'Erreur lors du chargement du dossier' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, dossier: data });
  } catch (error: any) {
    console.error('[BusinessDossier] GET error:', error?.message);
    return NextResponse.json(
      { ok: false, error: 'Erreur serveur' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/business-dossier
 * Update (upsert) business dossier for authenticated user.
 */
export async function PUT(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Connexion requise' },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();

    // Load existing dossier to MERGE (don't overwrite with null)
    const { data: existing } = await supabase
      .from('business_dossiers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Merge: only update fields that have a non-empty value in body
    // Only include columns that exist in business_dossiers table
    const allFields = ['company_name', 'company_description', 'business_type', 'target_audience', 'brand_tone', 'main_products', 'competitors', 'unique_selling_points', 'business_goals', 'instagram_handle', 'tiktok_handle', 'linkedin_url', 'website_url', 'google_maps_url', 'logo_url'];
    const merged: Record<string, any> = { user_id: user.id };
    for (const f of allFields) {
      const newVal = body[f];
      const existingVal = existing?.[f];
      merged[f] = (newVal && String(newVal).trim()) ? newVal : existingVal || null;
    }
    if (Array.isArray(body.uploaded_files)) merged.uploaded_files = body.uploaded_files;
    else if (existing?.uploaded_files) merged.uploaded_files = existing.uploaded_files;

    // Calculate completeness score from MERGED data
    const coreFields = ['company_name', 'company_description', 'business_type', 'target_audience', 'brand_tone', 'main_products'];
    const bonusFields = ['competitors', 'unique_selling_points', 'instagram_handle', 'logo_url', 'website_url', 'google_maps_url'];
    let score = 0;
    for (const f of coreFields) {
      if (merged[f] && String(merged[f]).trim()) score += 12;
    }
    for (const f of bonusFields) {
      if (merged[f] && String(merged[f]).trim()) score += 4.67;
    }
    // Extra points for non-core fields
    for (const f of ['business_goals', 'main_products']) {
      if (merged[f] && String(merged[f]).trim()) score += 3;
    }

    merged.completeness_score = Math.min(100, Math.round(score));
    merged.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('business_dossiers')
      .upsert(merged, { onConflict: 'user_id' });

    if (error) {
      console.error('[BusinessDossier] PUT error:', error);
      return NextResponse.json(
        { ok: false, error: 'Erreur lors de la sauvegarde' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, completeness: Math.min(100, Math.round(score)) });
  } catch (error: any) {
    console.error('[BusinessDossier] PUT error:', error?.message);
    return NextResponse.json(
      { ok: false, error: 'Erreur serveur' },
      { status: 500 },
    );
  }
}
