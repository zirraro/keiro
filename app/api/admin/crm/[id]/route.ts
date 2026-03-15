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

async function checkAdmin(supabase: ReturnType<typeof getAdminClient>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return profile?.is_admin === true;
}

// PUT: Update a prospect OR an activity
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
    if (!(await checkAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const isActivity = new URL(req.url).searchParams.get('type') === 'activity';

    if (isActivity) {
      // ─── Update Activity ─────────────────────────────────────────────
      const { data: activity, error } = await supabase
        .from('crm_activities')
        .update(body)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[CRM Activities] Update error:', error);
        return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, activity });
    }

    // ─── Update Prospect ───────────────────────────────────────────────
    const updateData: any = { ...body, updated_at: new Date().toISOString() };

    if (body.email !== undefined) {
      const ADMIN_EMAILS = ['mrzirraro@gmail.com', 'contact@keiroai.com'];
      if (body.email && !ADMIN_EMAILS.includes(body.email.toLowerCase())) {
        const { data: matchedProfile } = await supabase
          .from('profiles')
          .select('id, subscription_plan, is_admin')
          .eq('email', body.email)
          .single();
        if (matchedProfile && !matchedProfile.is_admin) {
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

// DELETE: Delete a prospect OR an activity
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
    if (!(await checkAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { id } = await params;
    const isActivity = new URL(req.url).searchParams.get('type') === 'activity';

    const table = isActivity ? 'crm_activities' : 'crm_prospects';
    const { error } = await supabase.from(table).delete().eq('id', id);

    if (error) {
      console.error(`[Admin CRM] Delete error (${table}):`, error);
      return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[Admin CRM] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
