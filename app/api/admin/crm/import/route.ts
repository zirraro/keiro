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

// Keyword-based column detection (order matters: more specific first)
// Each entry: [keywords that the header must CONTAIN, target field]
const FIELD_RULES: { keywords: string[]; field: string; exact?: boolean }[] = [
  // Prenom BEFORE nom (because "prenom" contains "nom")
  { keywords: ['prénom', 'prenom', 'first name', 'first_name', 'firstname'], field: 'first_name' },
  // "nom" alone = last_name, but "nom de l'etablissement/restaurant/commerce" = company
  { keywords: ['nom de', 'nom du', 'raison sociale', 'enseigne'], field: 'company', exact: false },
  { keywords: ['nom', 'last name', 'last_name', 'lastname', 'surname'], field: 'last_name' },
  // Email
  { keywords: ['email', 'e-mail', 'mail', 'courriel', 'adresse mail', 'adresse email'], field: 'email' },
  // Phone
  { keywords: ['telephone', 'téléphone', 'phone', 'tel', 'tél', 'portable', 'mobile', 'numero', 'numéro'], field: 'phone' },
  // Company (less specific, after "nom de...")
  { keywords: ['entreprise', 'company', 'societe', 'société', 'etablissement', 'établissement', 'restaurant', 'commerce', 'boutique', 'salon', 'magasin'], field: 'company' },
  // Type
  { keywords: ['type', 'catégorie', 'categorie', 'category', 'activite', 'activité', 'secteur', 'metier', 'métier'], field: 'type' },
  // Quartier
  { keywords: ['quartier', 'arrondissement', 'district', 'zone', 'ville', 'city', 'adresse', 'address', 'location', 'localisation'], field: 'quartier' },
  // Instagram
  { keywords: ['instagram', 'insta', 'ig', 'compte instagram', 'compte insta'], field: 'instagram' },
  // Followers
  { keywords: ['abonné', 'abonne', 'abonnés', 'abonnes', 'follower', 'followers', 'subscriber'], field: 'abonnes' },
  // Google rating
  { keywords: ['note google', 'rating google', 'google rating', 'note'], field: 'note_google' },
  // Google reviews
  { keywords: ['avis google', 'google reviews', 'avis', 'reviews', 'nb avis', 'nombre avis'], field: 'avis_google' },
  // Priority
  { keywords: ['priorité', 'priorite', 'priority', 'prio'], field: 'priorite' },
  // Score
  { keywords: ['score', 'points', 'note prospect'], field: 'score' },
  // Freq posts
  { keywords: ['fréquence', 'frequence', 'freq', 'frequency', 'post', 'publication'], field: 'freq_posts' },
  // Visual quality
  { keywords: ['qualité', 'qualite', 'quality', 'visuel', 'visuelle'], field: 'qualite_visuelle' },
  // Date contact
  { keywords: ['date contact', 'date_contact', '1er contact', 'premier contact', 'date'], field: 'date_contact' },
  // Angle
  { keywords: ['angle', 'approche', 'pitch', 'angle approche'], field: 'angle_approche' },
  // Status
  { keywords: ['statut', 'status', 'état', 'etat', 'etape', 'étape', 'pipeline'], field: 'status' },
  // Source / Canal
  { keywords: ['source', 'canal', 'channel', 'origine', 'provenance', 'acquisition'], field: 'source' },
  // Notes (last, catches remaining text columns)
  { keywords: ['notes', 'commentaire', 'comment', 'remarque', 'observation', 'info', 'description', 'detail', 'détail'], field: 'notes' },
];

// Normalize: lowercase + remove accents
function normalize(str: string): string {
  return str.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectColumnMapping(headers: string[]): { mapping: Record<number, string>; unmapped: string[] } {
  const mapping: Record<number, string> = {};
  const usedFields = new Set<string>();
  const unmapped: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    const raw = (headers[i] || '').toString().trim();
    if (!raw) continue;
    const h = normalize(raw);
    if (!h) continue;

    let matched = false;
    for (const rule of FIELD_RULES) {
      if (usedFields.has(rule.field)) continue;
      for (const kw of rule.keywords) {
        const nkw = normalize(kw);
        // Check if header contains keyword or keyword contains header
        if (h.includes(nkw) || (nkw.length > 3 && nkw.includes(h))) {
          mapping[i] = rule.field;
          usedFields.add(rule.field);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      unmapped.push(raw);
    }
  }

  return { mapping, unmapped };
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
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!hasValidExtension) {
      return NextResponse.json(
        { error: 'Format non supporté. Utilisez .xlsx, .xls ou .csv' },
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
    const { mapping: columnMapping, unmapped } = detectColumnMapping(headers);

    const mappedFields = Object.values(columnMapping);
    const mappedHeaders: Record<string, string> = {};
    for (const [colIdx, field] of Object.entries(columnMapping)) {
      mappedHeaders[String(headers[parseInt(colIdx)])] = field;
    }

    if (Object.keys(columnMapping).length === 0) {
      return NextResponse.json({
        error: `Aucune colonne reconnue. En-têtes détectés : ${headers.filter(Boolean).join(', ')}`,
      }, { status: 400 });
    }

    // Check if we have first_name/last_name separate or combined "nom"
    const hasFirstName = mappedFields.includes('first_name');
    const hasLastName = mappedFields.includes('last_name');

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process each data row (skip header)
    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      if (!row || row.every(v => v === undefined || v === null || v === '')) {
        skipped++;
        continue;
      }

      // Map columns to fields
      const record: Record<string, string> = {};
      // Also collect unmapped column values for notes
      const extraData: string[] = [];

      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const value = row[colIdx];
        if (value === undefined || value === null || value === '') continue;
        const strValue = String(value).trim();
        if (!strValue) continue;

        if (columnMapping[colIdx]) {
          record[columnMapping[colIdx]] = strValue;
        } else if (headers[colIdx]) {
          // Unmapped column: save for notes
          extraData.push(`${headers[colIdx]}: ${strValue}`);
        }
      }

      // Handle combined "nom" field: if we have last_name but no first_name,
      // try to split "Jean Dupont" into first/last
      if (record.last_name && !hasFirstName) {
        const parts = record.last_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          record.first_name = parts[0];
          record.last_name = parts.slice(1).join(' ');
        }
      }

      // Skip only truly empty rows (no useful data at all)
      const hasAnyData = record.first_name || record.last_name || record.email ||
        record.phone || record.company || record.instagram || record.type;
      if (!hasAnyData) {
        skipped++;
        continue;
      }

      // Append extra data to notes if any
      let notes = record.notes || '';
      if (extraData.length > 0) {
        notes = notes ? `${notes}\n---\n${extraData.join(' | ')}` : extraData.join(' | ');
      }

      // Build prospect data
      const prospectData: Record<string, unknown> = {
        first_name: record.first_name || null,
        last_name: record.last_name || null,
        email: record.email || null,
        phone: record.phone || null,
        company: record.company || null,
        status: record.status || 'identifie',
        source: record.source || 'import',
        notes: notes || null,
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
      } else {
        imported++;
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      skipped,
      errors,
      debug: {
        totalRows: rows.length - 1,
        headersDetected: headers.filter(Boolean),
        columnMapping: mappedHeaders,
        unmappedHeaders: unmapped,
      },
    });
  } catch (error: any) {
    console.error('[Admin CRM Import] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
