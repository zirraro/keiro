import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

const VALID_RATING_KEYS = [
  'images',
  'videos',
  'suggestions',
  'assistant',
  'audio',
  'publication',
  'interface',
  'prix',
] as const;

const VALID_RATING_VALUES = ['tres_bien', 'bien', 'moyen', 'pas_du_tout'] as const;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentification requise' },
        { status: 401 }
      );
    }

    const { ratings, comments } = await req.json();

    // Validate ratings
    if (!ratings || typeof ratings !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Ratings requis' },
        { status: 400 }
      );
    }

    for (const [key, value] of Object.entries(ratings)) {
      if (!VALID_RATING_KEYS.includes(key as any)) {
        return NextResponse.json(
          { ok: false, error: `Clé de rating invalide: ${key}` },
          { status: 400 }
        );
      }
      if (!VALID_RATING_VALUES.includes(value as any)) {
        return NextResponse.json(
          { ok: false, error: `Valeur de rating invalide pour ${key}: ${value}` },
          { status: 400 }
        );
      }
    }

    // Validate comments (optional)
    if (comments && typeof comments !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Comments doit être un objet' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('feedback_responses')
      .insert({
        user_id: user.id,
        user_email: user.email,
        ratings,
        comments: comments || {},
      });

    if (error) {
      console.error('[Feedback] Error inserting:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Feedback] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentification requise' },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Check admin status via profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json(
        { ok: false, error: 'Accès réservé aux administrateurs' },
        { status: 403 }
      );
    }

    // Fetch all feedback responses
    const { data: responses, error: fetchError } = await supabase
      .from('feedback_responses')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[Feedback] Error fetching:', fetchError);
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      );
    }

    const allResponses = responses || [];
    const total = allResponses.length;

    // Compute stats: for each question key, count each rating value
    const stats: Record<string, Record<string, number>> = {};
    for (const key of VALID_RATING_KEYS) {
      stats[key] = {
        tres_bien: 0,
        bien: 0,
        moyen: 0,
        pas_du_tout: 0,
      };
    }

    for (const response of allResponses) {
      const ratings = response.ratings as Record<string, string> | null;
      if (!ratings) continue;
      for (const [key, value] of Object.entries(ratings)) {
        if (stats[key] && VALID_RATING_VALUES.includes(value as any)) {
          stats[key][value]++;
        }
      }
    }

    // Extract all non-empty comments with user_email and created_at
    const comments: Array<{
      user_email: string;
      created_at: string;
      key: string;
      comment: string;
    }> = [];

    for (const response of allResponses) {
      const responseComments = response.comments as Record<string, string> | null;
      if (!responseComments) continue;
      for (const [key, comment] of Object.entries(responseComments)) {
        if (comment && typeof comment === 'string' && comment.trim() !== '') {
          comments.push({
            user_email: response.user_email,
            created_at: response.created_at,
            key,
            comment: comment.trim(),
          });
        }
      }
    }

    return NextResponse.json({ ok: true, stats, comments, total });
  } catch (error: any) {
    console.error('[Feedback] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
