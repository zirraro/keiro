import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET: Liste des codes promo + redemptions
export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = getAdminClient();

    // Vérifier admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Récupérer tous les codes promo
    const { data: promoCodes } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });

    // Récupérer toutes les rédemptions avec info utilisateur
    const { data: redemptions } = await supabase
      .from('promo_code_redemptions')
      .select('*, promo_codes(code, plan_override)')
      .order('created_at', { ascending: false });

    // Enrichir les rédemptions avec les emails des utilisateurs
    const userIds = [...new Set((redemptions || []).map((r: any) => r.user_id))];
    let usersMap: Record<string, string> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, subscription_plan, credits_balance, credits_expires_at')
        .in('id', userIds);

      if (profiles) {
        for (const p of profiles) {
          usersMap[p.id] = JSON.stringify(p);
        }
      }
    }

    const enrichedRedemptions = (redemptions || []).map((r: any) => {
      const userProfile = usersMap[r.user_id] ? JSON.parse(usersMap[r.user_id]) : null;
      return {
        ...r,
        user_email: userProfile?.email || 'inconnu',
        user_name: userProfile ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() : '',
        user_plan: userProfile?.subscription_plan || 'free',
        user_credits: userProfile?.credits_balance || 0,
        user_expires_at: userProfile?.credits_expires_at || null,
      };
    });

    return NextResponse.json({
      promoCodes: promoCodes || [],
      redemptions: enrichedRedemptions,
    });
  } catch (error: any) {
    console.error('[Admin Promos] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Révoquer l'accès promo d'un utilisateur
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = getAdminClient();

    // Vérifier admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { action, userId } = await req.json();

    if (action === 'revoke' && userId) {
      // Reset user to free plan
      await supabase
        .from('profiles')
        .update({
          subscription_plan: 'free',
          credits_balance: 15,
          credits_monthly_allowance: 15,
          credits_expires_at: null,
        })
        .eq('id', userId);

      // Log the revocation
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: 15,
        balance_after: 15,
        type: 'admin_revoke',
        feature: 'admin_revoke',
        description: 'Révocation admin — retour au plan Gratuit',
      });

      return NextResponse.json({ ok: true, message: 'Accès révoqué' });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (error: any) {
    console.error('[Admin Promos] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
