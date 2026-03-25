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

// GET: Liste des prospects OU activités/rappels
export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = getAdminClient();
    if (!(await checkAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    // ─── Activities & Reminders ────────────────────────────────────────
    if (type === 'activities') {
      const prospectId = searchParams.get('prospect_id');
      const rappels = searchParams.get('rappels');

      if (rappels === 'true' || rappels === 'jour' || rappels === 'semaine') {
        let cutoffDate: Date;
        if (rappels === 'semaine') {
          const now = new Date();
          const dayOfWeek = now.getDay();
          const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
          cutoffDate = new Date(now);
          cutoffDate.setDate(now.getDate() + daysUntilSunday);
          cutoffDate.setHours(23, 59, 59, 999);
        } else {
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
    }

    // ─── Prospects list ────────────────────────────────────────────────
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const source = searchParams.get('source') || '';
    const temperature = searchParams.get('temperature') || '';
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') || 'desc';

    // Supabase PostgREST caps at 1000 rows per request regardless of .limit()
    // Paginate to fetch ALL prospects
    const PAGE_SIZE = 1000;
    let allProspects: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let pageQuery = supabase
        .from('crm_prospects')
        .select('*')
        .order(sort, { ascending: order === 'asc' })
        .range(from, from + PAGE_SIZE - 1);

      if (search) {
        const s = `%${search}%`;
        pageQuery = pageQuery.or(
          `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},company.ilike.${s},notes.ilike.${s}`
        );
      }
      if (status) pageQuery = pageQuery.eq('status', status);
      if (source) pageQuery = pageQuery.eq('source', source);
      if (temperature) {
        const temps = temperature.split(',');
        pageQuery = temps.length > 1 ? pageQuery.in('temperature', temps) : pageQuery.eq('temperature', temperature);
      }

      const { data, error } = await pageQuery;
      if (error) {
        console.error('[Admin CRM] List error:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des prospects' }, { status: 500 });
      }

      allProspects = allProspects.concat(data || []);
      hasMore = (data?.length || 0) === PAGE_SIZE;
      from += PAGE_SIZE;

      // Safety: max 10 pages (10,000 prospects)
      if (from >= 10000) break;
    }
    const byStatus: Record<string, number> = {
      identifie: 0, contacte: 0, relance_1: 0, relance_2: 0, relance_3: 0, relance_finale: 0, repondu: 0, demo: 0, sprint: 0, client: 0, perdu: 0,
    };
    const byChannel: Record<string, number> = {};
    const byPriorite: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const p of allProspects) {
      byStatus[p.status || 'identifie'] = (byStatus[p.status || 'identifie'] || 0) + 1;
      if (p.source) byChannel[p.source] = (byChannel[p.source] || 0) + 1;
      byPriorite[p.priorite || 'B'] = (byPriorite[p.priorite || 'B'] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      prospects: allProspects,
      stats: { total: allProspects.length, byStatus, byChannel, byPriorite },
    });
  } catch (error: any) {
    console.error('[Admin CRM] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Créer un prospect OU une activité
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = getAdminClient();
    if (!(await checkAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const body = await req.json();

    // ─── Recalculate all temperatures based on real engagement ──────────
    if (body.action === 'recalculate_temperatures') {
      // Only use columns that exist in DB (no 'events' column)
      const { data: allProspects, error: fetchErr } = await supabase.from('crm_prospects').select('id, last_email_opened_at, last_email_clicked_at, temperature, score, source');
      if (fetchErr || !allProspects) {
        console.error('[Admin CRM] Recalculate fetch error:', fetchErr);
        return NextResponse.json({ ok: false, error: fetchErr?.message || 'Fetch failed', updated: 0, total: 0 });
      }

      let updated = 0;
      const now = new Date().toISOString();
      for (const p of allProspects) {
        if (p.temperature === 'dead') continue;

        // Temperature based on real engagement signals from DB columns
        const hasClicked = !!p.last_email_clicked_at;
        const hasOpened = !!p.last_email_opened_at;

        let newTemp: string;
        if (hasClicked) newTemp = 'hot';
        else if (hasOpened) newTemp = 'warm';
        else newTemp = 'cold';

        if (newTemp !== p.temperature) {
          await supabase.from('crm_prospects').update({ temperature: newTemp, updated_at: now }).eq('id', p.id);
          updated++;
        }
      }
      return NextResponse.json({ ok: true, updated, total: allProspects.length });
    }

    // ─── Purge prospects (all or by status) ─────────────────────────────
    if (body.action === 'purge' || body.action === 'purge_all') {
      let query = supabase.from('crm_prospects').delete();
      if (body.status) {
        query = query.eq('status', body.status);
      } else {
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }
      const { data, error } = await query.select('id');
      if (error) {
        console.error('[Admin CRM] Purge error:', error);
        return NextResponse.json({ error: 'Erreur lors de la purge' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: data?.length || 0 });
    }

    // ─── Create Activity ───────────────────────────────────────────────
    if (body.action === 'add_activity') {
      const { prospect_id, type, description, resultat, date_rappel, heure_rappel } = body;
      if (!prospect_id || !type) {
        return NextResponse.json({ error: 'prospect_id et type requis' }, { status: 400 });
      }

      const { data: activity, error } = await supabase
        .from('crm_activities')
        .insert({
          prospect_id,
          type,
          description: description || null,
          resultat: resultat || null,
          date_activite: new Date().toISOString(),
          date_rappel: date_rappel || null,
          heure_rappel: heure_rappel || null,
          rappel_fait: false,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('[CRM Activities] Create error:', error);
        return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
      }

      // Auto-advance pipeline status
      const CONTACT_TYPES = ['appel', 'appel_manque', 'message', 'email', 'dm_instagram', 'visite', 'relance'];
      const STATUS_ORDER: Record<string, number> = {
        identifie: 0, contacte: 1, repondu: 2, demo: 3, sprint: 4, client: 5, perdu: -1,
      };

      const { data: prospect } = await supabase
        .from('crm_prospects')
        .select('status')
        .eq('id', prospect_id)
        .single();

      if (prospect && prospect.status !== 'perdu') {
        const currentOrder = STATUS_ORDER[prospect.status] ?? 0;
        let newStatus: string | null = null;

        // Auto-advance pipeline based on activity type + result
        if (CONTACT_TYPES.includes(type) && currentOrder < 1) newStatus = 'contacte';
        if ((resultat === 'interesse' || resultat === 'demande_infos') && currentOrder < 2) newStatus = 'repondu';
        if (resultat === 'rdv_pris' && currentOrder < 3) newStatus = 'demo';
        if (type === 'rdv' && currentOrder < 3) newStatus = 'demo';
        if (resultat === 'demo_ok' && currentOrder < 3) newStatus = 'demo';
        if (resultat === 'essai_gratuit' && currentOrder < 4) newStatus = 'sprint';
        if (resultat === 'client_signe') newStatus = 'client';
        // Negative outcomes → perdu
        if (resultat === 'pas_interesse') newStatus = 'perdu';
        if (resultat === 'concurrent') newStatus = 'perdu';
        if (resultat === 'budget_ko') newStatus = 'perdu';

        const updateData: any = { date_contact: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() };
        if (newStatus) updateData.status = newStatus;
        // Update temperature based on result
        if (resultat === 'interesse' || resultat === 'demande_infos' || resultat === 'rdv_pris' || resultat === 'demo_ok') {
          updateData.temperature = 'hot';
        } else if (resultat === 'rappeler' || resultat === 'mauvais_moment') {
          updateData.temperature = 'warm';
        } else if (resultat === 'pas_interesse' || resultat === 'concurrent' || resultat === 'budget_ko') {
          updateData.temperature = 'dead';
        }
        await supabase.from('crm_prospects').update(updateData).eq('id', prospect_id);
      }

      return NextResponse.json({ ok: true, activity });
    }

    // ─── Create Prospect ───────────────────────────────────────────────
    const {
      first_name, last_name, email, phone, company, status, source, notes, tags,
      type, quartier, instagram, abonnes, note_google, avis_google,
      priorite, score, freq_posts, qualite_visuelle, date_contact, angle_approche,
    } = body;

    const prospectData: any = {
      first_name: first_name || null, last_name: last_name || null,
      email: email || null, phone: phone || null, company: company || null,
      status: status || 'identifie', source: source || null,
      notes: notes || null, tags: tags || null,
      type: type || null, quartier: quartier || null,
      instagram: instagram || null,
      abonnes: abonnes != null ? Number(abonnes) : null,
      note_google: note_google != null ? Number(note_google) : null,
      avis_google: avis_google != null ? Number(avis_google) : null,
      priorite: priorite || 'B', score: score != null ? Number(score) : 0,
      freq_posts: freq_posts || null, qualite_visuelle: qualite_visuelle || null,
      date_contact: date_contact || null, angle_approche: angle_approche || null,
      created_by: user.id,
    };

    // Match prospect email to Keiro user (exclude admin emails)
    const ADMIN_EMAILS = ['contact@keiroai.com'];
    if (email && !ADMIN_EMAILS.includes(email.toLowerCase())) {
      const { data: matchedProfile } = await supabase
        .from('profiles')
        .select('id, subscription_plan, is_admin')
        .eq('email', email)
        .single();
      if (matchedProfile && !matchedProfile.is_admin) {
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
