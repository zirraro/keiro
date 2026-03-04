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

// GET: List activities (by prospect or pending reminders)
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const prospectId = searchParams.get('prospect_id');
    const rappels = searchParams.get('rappels');

    if (rappels === 'true' || rappels === 'jour' || rappels === 'semaine') {
      // Determine the cutoff date based on the rappels parameter
      let cutoffDate: Date;

      if (rappels === 'semaine') {
        // End of this week (Sunday 23:59:59)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ...
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        cutoffDate = new Date(now);
        cutoffDate.setDate(now.getDate() + daysUntilSunday);
        cutoffDate.setHours(23, 59, 59, 999);
      } else {
        // 'true' or 'jour': today + overdue
        cutoffDate = new Date();
        cutoffDate.setHours(23, 59, 59, 999);
      }

      const { data: reminders, error } = await supabase
        .from('crm_activities')
        .select('*, crm_prospects!inner(id, first_name, last_name, company, instagram)')
        .eq('rappel_fait', false)
        .not('date_rappel', 'is', null)
        .lte('date_rappel', cutoffDate.toISOString())
        .order('date_rappel', { ascending: true });

      if (error) {
        console.error('[CRM Activities] Reminders error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, reminders: reminders || [] });
    }

    if (prospectId) {
      // Get activities for a specific prospect
      const { data: activities, error } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('prospect_id', prospectId)
        .order('date_activite', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[CRM Activities] List error:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, activities: activities || [] });
    }

    return NextResponse.json({ error: 'Paramètre prospect_id ou rappels requis' }, { status: 400 });
  } catch (error: any) {
    console.error('[CRM Activities] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Create a new activity
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

    const body = await req.json();
    const { prospect_id, type, description, resultat, date_rappel, heure_rappel } = body;

    if (!prospect_id || !type) {
      return NextResponse.json({ error: 'prospect_id et type requis' }, { status: 400 });
    }

    const activityData: Record<string, unknown> = {
      prospect_id,
      type,
      description: description || null,
      resultat: resultat || null,
      date_activite: new Date().toISOString(),
      date_rappel: date_rappel || null,
      heure_rappel: heure_rappel || null,
      rappel_fait: false,
      created_by: user.id,
    };

    const { data: activity, error } = await supabase
      .from('crm_activities')
      .insert(activityData)
      .select()
      .single();

    if (error) {
      console.error('[CRM Activities] Create error:', error);
      return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, activity });
  } catch (error: any) {
    console.error('[CRM Activities] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
