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

    // Calculate completeness score
    const coreFields = ['company_name', 'company_description', 'business_type', 'target_audience', 'brand_tone', 'main_products'];
    const bonusFields = ['competitors', 'unique_selling_points', 'instagram_handle', 'logo_url', 'website_url', 'google_maps_url'];

    let score = 0;
    for (const f of coreFields) {
      if (body[f] && String(body[f]).trim()) score += 12; // 6 x 12 = 72
    }
    for (const f of bonusFields) {
      if (body[f] && String(body[f]).trim()) score += 4.67; // 6 x 4.67 = 28
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('business_dossiers')
      .upsert({
        user_id: user.id,
        company_name: body.company_name || null,
        company_description: body.company_description || null,
        business_type: body.business_type || null,
        target_audience: body.target_audience || null,
        brand_tone: body.brand_tone || null,
        main_products: body.main_products || null,
        competitors: body.competitors || null,
        unique_selling_points: body.unique_selling_points || null,
        business_goals: body.business_goals || null,
        instagram_handle: body.instagram_handle || null,
        tiktok_handle: body.tiktok_handle || null,
        linkedin_url: body.linkedin_url || null,
        website_url: body.website_url || null,
        google_maps_url: body.google_maps_url || null,
        logo_url: body.logo_url || null,
        uploaded_files: Array.isArray(body.uploaded_files) ? body.uploaded_files : [],
        completeness_score: Math.min(100, Math.round(score)),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

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
