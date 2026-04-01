import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── GET: List user's prospects ─────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const temperature = searchParams.get('temperature') || '';
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    // Query scoped to user — try org_id first, fallback to created_by/user_id
    let query = supabase
      .from('crm_prospects')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Check org membership for multi-tenant filtering
    const { data: orgMember } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (orgMember?.org_id) {
      query = query.eq('org_id', orgMember.org_id);
    } else {
      query = query.or(`created_by.eq.${user.id},user_id.eq.${user.id}`);
    }

    if (status) query = query.eq('status', status);
    if (temperature) query = query.eq('temperature', temperature);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: prospects, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Load activities for these prospects
    const prospectIds = (prospects || []).map((p: any) => p.id);
    let activities: any[] = [];
    if (prospectIds.length > 0) {
      const { data: acts } = await supabase
        .from('crm_activities')
        .select('*')
        .in('prospect_id', prospectIds)
        .order('date_activite', { ascending: false })
        .limit(500);
      activities = acts || [];
    }

    return NextResponse.json({
      ok: true,
      prospects: prospects || [],
      activities,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 });
  }
}

// ─── POST: Create prospect or add activity ──────────────────

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const body = await req.json();

    // ─── Add activity to existing prospect ──────────────
    if (body.action === 'add_activity' && body.prospect_id) {
      // Verify prospect belongs to user
      const { data: prospect } = await supabase
        .from('crm_prospects')
        .select('id, created_by')
        .eq('id', body.prospect_id)
        .single();

      if (!prospect || prospect.created_by !== user.id) {
        return NextResponse.json({ error: 'Prospect non trouve' }, { status: 404 });
      }

      const { data: activity, error } = await supabase
        .from('crm_activities')
        .insert({
          prospect_id: body.prospect_id,
          type: body.type || 'note',
          description: body.description || '',
          resultat: body.resultat || null,
          date_activite: new Date().toISOString(),
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Auto-advance pipeline based on activity type
      const contactTypes = ['appel', 'message', 'email', 'dm_instagram', 'visite', 'relance'];
      if (contactTypes.includes(body.type)) {
        await supabase
          .from('crm_prospects')
          .update({ status: 'contacte', updated_at: new Date().toISOString() })
          .eq('id', body.prospect_id)
          .eq('status', 'identifie');
      }

      // Advance based on result
      if (body.resultat === 'interesse' || body.resultat === 'demande_infos') {
        await supabase
          .from('crm_prospects')
          .update({ temperature: 'warm', updated_at: new Date().toISOString() })
          .eq('id', body.prospect_id);
      }
      if (body.resultat === 'rdv_pris') {
        await supabase
          .from('crm_prospects')
          .update({ status: 'demo', temperature: 'hot', updated_at: new Date().toISOString() })
          .eq('id', body.prospect_id);
      }
      if (body.resultat === 'pas_interesse') {
        await supabase
          .from('crm_prospects')
          .update({ status: 'perdu', temperature: 'dead', updated_at: new Date().toISOString() })
          .eq('id', body.prospect_id);
      }

      return NextResponse.json({ ok: true, activity });
    }

    // ─── Create new prospect ────────────────────────────
    const { data: prospect, error } = await supabase
      .from('crm_prospects')
      .insert({
        first_name: body.first_name || '',
        last_name: body.last_name || '',
        email: body.email || null,
        phone: body.phone || null,
        company: body.company || null,
        source: body.source || 'other',
        status: body.status || 'identifie',
        temperature: body.temperature || 'cold',
        priorite: body.priorite || 'C',
        score: body.score || 0,
        notes: body.notes || null,
        tags: body.tags || [],
        type: body.type || null,
        instagram: body.instagram || null,
        quartier: body.quartier || null,
        website: body.website || null,
        note_google: body.note_google ? parseFloat(body.note_google) || null : null,
        avis_google: body.avis_google ? parseInt(body.avis_google) || null : null,
        abonnes: body.abonnes ? parseInt(body.abonnes) || null : null,
        created_by: user.id,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, prospect });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 });
  }
}

// ─── PUT: Update prospect ───────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('crm_prospects')
      .select('id, created_by')
      .eq('id', body.id)
      .single();

    if (!existing || existing.created_by !== user.id) {
      return NextResponse.json({ error: 'Prospect non trouve' }, { status: 404 });
    }

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) updateData.status = body.status;
    if (body.temperature !== undefined) updateData.temperature = body.temperature;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.priorite !== undefined) updateData.priorite = body.priorite;
    if (body.score !== undefined) updateData.score = body.score;
    if (body.first_name !== undefined) updateData.first_name = body.first_name;
    if (body.last_name !== undefined) updateData.last_name = body.last_name;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.company !== undefined) updateData.company = body.company;

    const { data: prospect, error } = await supabase
      .from('crm_prospects')
      .update(updateData)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, prospect });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erreur serveur' }, { status: 500 });
  }
}
