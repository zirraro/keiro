import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// POST: Batch match prospect emails with user profiles
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = getAdminClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Fetch all prospects with an email
    const { data: prospects, error: fetchError } = await supabase
      .from('crm_prospects')
      .select('id, email')
      .not('email', 'is', null);

    if (fetchError) {
      console.error('[Admin CRM Match] Fetch error:', fetchError);
      return NextResponse.json({ error: 'Erreur lors de la récupération des prospects' }, { status: 500 });
    }

    const total = (prospects || []).length;
    let matched = 0;

    // For each prospect, try to match with a profile
    for (const prospect of prospects || []) {
      if (!prospect.email) continue;

      // Skip admin emails
      const ADMIN_EMAILS = ['mrzirraro@gmail.com', 'contact@keiroai.com'];
      if (ADMIN_EMAILS.includes(prospect.email.toLowerCase())) continue;

      const { data: matchedProfile } = await supabase
        .from('profiles')
        .select('id, subscription_plan, is_admin')
        .eq('email', prospect.email)
        .single();

      if (matchedProfile && !matchedProfile.is_admin) {
        const { error: updateError } = await supabase
          .from('crm_prospects')
          .update({
            matched_user_id: matchedProfile.id,
            matched_plan: matchedProfile.subscription_plan,
            updated_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);

        if (!updateError) {
          matched++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      matched,
      total,
    });
  } catch (error: any) {
    console.error('[Admin CRM Match] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
