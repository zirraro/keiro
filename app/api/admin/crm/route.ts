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

// GET: Liste des prospects avec filtres
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
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const source = searchParams.get('source') || '';
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') || 'desc';

    // Build query
    let query = supabase
      .from('crm_prospects')
      .select('*')
      .order(sort, { ascending: order === 'asc' });

    // Text search on multiple fields
    if (search) {
      const s = `%${search}%`;
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},company.ilike.${s},notes.ilike.${s}`
      );
    }

    // Filter by status
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by source
    if (source) {
      query = query.eq('source', source);
    }

    const { data: prospects, error } = await query.limit(5000);

    if (error) {
      console.error('[Admin CRM] List error:', error);
      return NextResponse.json({ error: 'Erreur lors de la récupération des prospects' }, { status: 500 });
    }

    // Compute stats
    const allProspects = prospects || [];
    const byStatus: Record<string, number> = {
      identifie: 0, contacte: 0, repondu: 0, demo: 0, sprint: 0, client: 0, perdu: 0,
    };
    const byChannel: Record<string, number> = {};
    const byPriorite: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const p of allProspects) {
      const s = p.status || 'identifie';
      byStatus[s] = (byStatus[s] || 0) + 1;
      if (p.source) {
        byChannel[p.source] = (byChannel[p.source] || 0) + 1;
      }
      const prio = p.priorite || 'B';
      byPriorite[prio] = (byPriorite[prio] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      prospects: allProspects,
      stats: {
        total: allProspects.length,
        byStatus,
        byChannel,
        byPriorite,
      },
    });
  } catch (error: any) {
    console.error('[Admin CRM] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Créer un nouveau prospect
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
    const {
      first_name, last_name, email, phone, company, status, source, notes, tags,
      type, quartier, instagram, abonnes, note_google, avis_google,
      priorite, score, freq_posts, qualite_visuelle, date_contact, angle_approche,
    } = body;

    // Build prospect data
    const prospectData: any = {
      first_name: first_name || null,
      last_name: last_name || null,
      email: email || null,
      phone: phone || null,
      company: company || null,
      status: status || 'identifie',
      source: source || null,
      notes: notes || null,
      tags: tags || null,
      type: type || null,
      quartier: quartier || null,
      instagram: instagram || null,
      abonnes: abonnes != null ? Number(abonnes) : null,
      note_google: note_google != null ? Number(note_google) : null,
      avis_google: avis_google != null ? Number(avis_google) : null,
      priorite: priorite || 'B',
      score: score != null ? Number(score) : 0,
      freq_posts: freq_posts || null,
      qualite_visuelle: qualite_visuelle || null,
      date_contact: date_contact || null,
      angle_approche: angle_approche || null,
      created_by: user.id,
    };

    // Auto-match email with profiles
    if (email) {
      const { data: matchedProfile } = await supabase
        .from('profiles')
        .select('id, subscription_plan')
        .eq('email', email)
        .single();

      if (matchedProfile) {
        prospectData.matched_user_id = matchedProfile.id;
        prospectData.matched_plan = matchedProfile.subscription_plan;
      }
    }

    const { data: prospect, error } = await supabase
      .from('crm_prospects')
      .insert(prospectData)
      .select()
      .single();

    if (error) {
      console.error('[Admin CRM] Create error:', error);
      return NextResponse.json({ error: 'Erreur lors de la création du prospect' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, prospect });
  } catch (error: any) {
    console.error('[Admin CRM] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
