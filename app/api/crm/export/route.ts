import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/crm/export?format=csv
 * Export CRM prospects as CSV or JSON.
 * Filtered by user's org_id.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const format = req.nextUrl.searchParams.get('format') || 'csv';

  // Resolve org_id
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  // Build query
  let query = supabase
    .from('crm_prospects')
    .select('first_name, last_name, email, phone, company, type, quartier, instagram, status, temperature, score, source, notes, tags, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (orgMember?.org_id) {
    query = query.eq('org_id', orgMember.org_id);
  } else {
    query = query.eq('created_by', user.id);
  }

  const { data: prospects } = await query;
  if (!prospects || prospects.length === 0) {
    return NextResponse.json({ error: 'Aucun prospect a exporter' }, { status: 404 });
  }

  if (format === 'json') {
    return NextResponse.json({ ok: true, prospects, count: prospects.length });
  }

  // CSV export
  const headers = ['Prenom', 'Nom', 'Email', 'Telephone', 'Entreprise', 'Type', 'Ville', 'Instagram', 'Statut', 'Temperature', 'Score', 'Source', 'Notes', 'Tags', 'Date creation'];
  const csvRows = [headers.join(';')];

  for (const p of prospects) {
    csvRows.push([
      p.first_name || '', p.last_name || '', p.email || '', p.phone || '',
      p.company || '', p.type || '', p.quartier || '', p.instagram || '',
      p.status || '', p.temperature || '', String(p.score || 0), p.source || '',
      (p.notes || '').replace(/[;\n\r]/g, ' '), (p.tags || []).join(', '),
      p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : '',
    ].map(v => `"${v}"`).join(';'));
  }

  const csv = csvRows.join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel

  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="crm_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
