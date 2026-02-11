import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }
    const { data, error } = await supabase
      .from('feature_interests')
      .select('feature')
      .eq('user_id', user.id);
    if (error) {
      console.error('[FeatureInterest] Error fetching:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const features = (data || []).map((d: { feature: string }) => d.feature);
    return NextResponse.json({ ok: true, features });
  } catch (error: any) {
    console.error('[FeatureInterest] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }
    const { feature } = await req.json();
    if (!feature || typeof feature !== 'string') {
      return NextResponse.json({ ok: false, error: 'Feature requise' }, { status: 400 });
    }
    const { error } = await supabase
      .from('feature_interests')
      .upsert(
        { user_id: user.id, feature },
        { onConflict: 'user_id,feature' }
      );
    if (error) {
      console.error('[FeatureInterest] Error inserting:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[FeatureInterest] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
