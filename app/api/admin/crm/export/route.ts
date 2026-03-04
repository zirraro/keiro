import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

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

    if (status) {
      query = query.eq('status', status);
    }

    if (source) {
      query = query.eq('source', source);
    }

    const { data: prospects, error } = await query;

    if (error) {
      console.error('[Admin CRM Export] Query error:', error);
      return NextResponse.json({ error: 'Erreur lors de la récupération des prospects' }, { status: 500 });
    }

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
