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

// Column mapping: normalized header → field name
const COLUMN_MAPPINGS: Record<string, string> = {
  'prénom': 'first_name',
  'prenom': 'first_name',
  'first_name': 'first_name',
  'first name': 'first_name',
  'nom': 'last_name',
  'last_name': 'last_name',
  'last name': 'last_name',
  'name': 'last_name',
  'email': 'email',
  'e-mail': 'email',
  'mail': 'email',
  'téléphone': 'phone',
  'telephone': 'phone',
  'phone': 'phone',
  'tel': 'phone',
  'tél': 'phone',
  'entreprise': 'company',
  'société': 'company',
  'societe': 'company',
  'company': 'company',
  'notes': 'notes',
  'note': 'notes',
  'commentaire': 'notes',
  'comment': 'notes',
  'source': 'source',
  'statut': 'status',
  'status': 'status',
  'type': 'type',
  'catégorie': 'type',
  'category': 'type',
  'quartier': 'quartier',
  'arrondissement': 'quartier',
  'district': 'quartier',
  'zone': 'quartier',
  'instagram': 'instagram',
  'insta': 'instagram',
  '@': 'instagram',
  'abonnés': 'abonnes',
  'abonnes': 'abonnes',
  'followers': 'abonnes',
  'note google': 'note_google',
  'rating': 'note_google',
  'avis': 'avis_google',
  'reviews': 'avis_google',
  'avis google': 'avis_google',
  'priorité': 'priorite',
  'priorite': 'priorite',
  'priority': 'priorite',
  'prio': 'priorite',
  'score': 'score',
  'fréquence': 'freq_posts',
  'frequence': 'freq_posts',
  'freq': 'freq_posts',
  'frequency': 'freq_posts',
  'qualité': 'qualite_visuelle',
  'qualite': 'qualite_visuelle',
  'quality': 'qualite_visuelle',
  'date contact': 'date_contact',
  'date_contact': 'date_contact',
  '1er contact': 'date_contact',
  'angle': 'angle_approche',
  'approche': 'angle_approche',
  'angle approche': 'angle_approche',
};

function detectColumnMapping(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const normalized = (headers[i] || '').toString().trim().toLowerCase();
    if (COLUMN_MAPPINGS[normalized]) {
      mapping[i] = COLUMN_MAPPINGS[normalized];
    }
  }
  return mapping;
}

// POST: Importer des prospects depuis Excel/CSV
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

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      return NextResponse.json(
        { error: 'Format de fichier non supporté. Utilisez .xlsx, .xls ou .csv' },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse with XLSX
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return NextResponse.json({ error: 'Le fichier ne contient aucune feuille' }, { status: 400 });
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Le fichier est vide ou ne contient que des en-têtes' }, { status: 400 });
    }

    // Detect column mapping from headers
    const headers = rows[0] as string[];
    const columnMapping = detectColumnMapping(headers);

    if (Object.keys(columnMapping).length === 0) {
      return NextResponse.json(
        { error: 'Impossible de détecter les colonnes. Vérifiez les en-têtes du fichier.' },
        { status: 400 }
      );
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process each data row (skip header)
    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      if (!row || row.length === 0) {
        skipped++;
        continue;
      }

      // Map columns to fields
      const record: any = {};
      for (const [colIdx, field] of Object.entries(columnMapping)) {
        const value = row[parseInt(colIdx)];
        if (value !== undefined && value !== null && value !== '') {
          record[field] = String(value).trim();
        }
      }

      // Skip rows without at least a name or email
      const hasName = record.first_name || record.last_name;
      const hasEmail = record.email;
      if (!hasName && !hasEmail) {
        skipped++;
        continue;
      }

      // Build prospect data
      const prospectData: any = {
        first_name: record.first_name || null,
        last_name: record.last_name || null,
        email: record.email || null,
        phone: record.phone || null,
        company: record.company || null,
        status: record.status || 'identifie',
        source: record.source || 'import',
        notes: record.notes || null,
        type: record.type || null,
        quartier: record.quartier || null,
        instagram: record.instagram || null,
        abonnes: record.abonnes ? Number(record.abonnes) : null,
        note_google: record.note_google ? Number(record.note_google) : null,
        avis_google: record.avis_google ? Number(record.avis_google) : null,
        priorite: record.priorite || 'B',
        score: record.score ? Number(record.score) : 0,
        freq_posts: record.freq_posts || null,
        qualite_visuelle: record.qualite_visuelle || null,
        date_contact: record.date_contact || null,
        angle_approche: record.angle_approche || null,
        created_by: user.id,
      };

      // Auto-match email with profiles
      if (record.email) {
        const { data: matchedProfile } = await supabase
          .from('profiles')
          .select('id, subscription_plan')
          .eq('email', record.email)
          .single();

        if (matchedProfile) {
          prospectData.matched_user_id = matchedProfile.id;
          prospectData.matched_plan = matchedProfile.subscription_plan;
        }
      }

      // Insert prospect
      const { error: insertError } = await supabase
        .from('crm_prospects')
        .insert(prospectData);

      if (insertError) {
        errors.push(`Ligne ${rowIdx + 1}: ${insertError.message}`);
        skipped++;
      } else {
        imported++;
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      skipped,
      errors,
    });
  } catch (error: any) {
    console.error('[Admin CRM Import] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
