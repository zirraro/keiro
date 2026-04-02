import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET: Exporter les prospects en Excel
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
    const type = searchParams.get('type') || '';
    const quartier = searchParams.get('quartier') || '';
    const priorite = searchParams.get('priorite') || '';

    // Build query with same filters as list
    let query = supabase
      .from('crm_prospects')
      .select('*')
      .order('created_at', { ascending: false });

    if (search) {
      const s = `%${search}%`;
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},company.ilike.${s},notes.ilike.${s}`
      );
    }

    if (status) query = query.eq('status', status);
    if (source) query = query.eq('source', source);
    if (type) query = query.eq('type', type);
    if (quartier) query = query.eq('quartier', quartier);
    if (priorite) query = query.eq('priorite', priorite);

    // Paginate to fetch ALL prospects (Supabase caps at 1000 per request)
    let allProspects: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;
    while (hasMore) {
      const pageQuery = supabase.from('crm_prospects').select('*').order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (search) { const s = `%${search}%`; pageQuery.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},company.ilike.${s},notes.ilike.${s}`); }
      if (status) pageQuery.eq('status', status);
      if (source) pageQuery.eq('source', source);
      if (type) pageQuery.eq('type', type);
      if (quartier) pageQuery.eq('quartier', quartier);
      if (priorite) pageQuery.eq('priorite', priorite);
      const { data, error: pageError } = await pageQuery;
      if (pageError) {
        console.error('[Admin CRM Export] Query error:', pageError);
        return NextResponse.json({ error: 'Erreur lors de la récupération des prospects' }, { status: 500 });
      }
      allProspects = allProspects.concat(data || []);
      hasMore = (data?.length || 0) === PAGE_SIZE;
      from += PAGE_SIZE;
      if (from >= 100000) break; // Safety cap
    }
    const prospects = allProspects;

    // Build Excel data
    const exportData = (prospects || []).map((p: any) => ({
      'Prénom': p.first_name || '',
      'Nom': p.last_name || '',
      'Email': p.email || '',
      'Téléphone': p.phone || '',
      'Entreprise': p.company || '',
      'Statut': p.status || '',
      'Source': p.source || '',
      'Plan Keiro': p.matched_plan || '',
      'Notes': p.notes || '',
      'Tags': Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
      'Type': p.type || '',
      'Quartier': p.quartier || '',
      'Instagram': p.instagram || '',
      'Abonnés': p.abonnes != null ? p.abonnes : '',
      'Note Google': p.note_google != null ? p.note_google : '',
      'Avis Google': p.avis_google != null ? p.avis_google : '',
      'Priorité': p.priorite || '',
      'Score': p.score != null ? p.score : '',
      'Fréq. Posts': p.freq_posts || '',
      'Qualité Visuelle': p.qualite_visuelle || '',
      'Date Contact': p.date_contact || '',
      "Angle d'approche": p.angle_approche || '',
      'Créé le': p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : '',
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Prénom
      { wch: 15 }, // Nom
      { wch: 30 }, // Email
      { wch: 18 }, // Téléphone
      { wch: 25 }, // Entreprise
      { wch: 12 }, // Statut
      { wch: 15 }, // Source
      { wch: 15 }, // Plan Keiro
      { wch: 40 }, // Notes
      { wch: 25 }, // Tags
      { wch: 15 }, // Type
      { wch: 12 }, // Quartier
      { wch: 18 }, // Instagram
      { wch: 10 }, // Abonnés
      { wch: 12 }, // Note Google
      { wch: 12 }, // Avis Google
      { wch: 10 }, // Priorité
      { wch: 8 },  // Score
      { wch: 15 }, // Fréq. Posts
      { wch: 18 }, // Qualité Visuelle
      { wch: 14 }, // Date Contact
      { wch: 30 }, // Angle d'approche
      { wch: 12 }, // Créé le
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Prospects');

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=crm-prospects-${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });
  } catch (error: any) {
    console.error('[Admin CRM Export] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
