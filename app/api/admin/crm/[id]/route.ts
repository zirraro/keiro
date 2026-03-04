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

// PUT: Mettre à jour un prospect
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();

    // Set updated_at
    const updateData: any = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    // If email changed, re-match with profiles
    if (body.email !== undefined) {
      if (body.email) {
        const { data: matchedProfile } = await supabase
          .from('profiles')
          .select('id, subscription_plan')
          .eq('email', body.email)
          .single();

        if (matchedProfile) {
          updateData.matched_user_id = matchedProfile.id;
          updateData.matched_plan = matchedProfile.subscription_plan;
        } else {
          updateData.matched_user_id = null;
          updateData.matched_plan = null;
        }
      } else {
        updateData.matched_user_id = null;
        updateData.matched_plan = null;
      }
    }

    const { data: prospect, error } = await supabase
      .from('crm_prospects')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[Admin CRM] Update error:', error);
      return NextResponse.json({ error: 'Erreur lors de la mise à jour du prospect' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, prospect });
  } catch (error: any) {
    console.error('[Admin CRM] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE: Supprimer un prospect
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { error } = await supabase
      .from('crm_prospects')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Admin CRM] Delete error:', error);
      return NextResponse.json({ error: 'Erreur lors de la suppression du prospect' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Admin CRM] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
