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
const FIELD_RULES: { keywords: string[]; field: string }[] = [
  // Prenom BEFORE nom
  { keywords: ['prenom', 'prénom', 'first name', 'first_name', 'firstname'], field: 'first_name' },
  // "nom de/du" = company
  { keywords: ['nom de', 'nom du', 'raison sociale', 'enseigne'], field: 'company' },
  // "nom" alone — will be routed to company or last_name based on context (see below)
  { keywords: ['nom'], field: 'last_name' },
  // Email — NOT "adresse" alone
  { keywords: ['email', 'e-mail', 'adresse mail', 'adresse email', 'adresse e-mail', 'courriel'], field: 'email' },
  // Phone
  { keywords: ['telephone', 'téléphone', 'phone', 'portable', 'mobile'], field: 'phone' },
  // Company
  { keywords: ['entreprise', 'company', 'societe', 'société', 'etablissement', 'établissement', 'restaurant', 'commerce', 'boutique', 'salon', 'magasin'], field: 'company' },
  // Type — specific first
  { keywords: ['type activite', 'type activité', 'sous-categorie', 'sous-catégorie', 'sous categorie', 'type', 'categorie', 'catégorie', 'activite', 'activité', 'secteur', 'metier', 'métier'], field: 'type' },
  // Quartier — "ville" and "quartier" only, NOT "adresse"
  { keywords: ['ville / quartier', 'ville/quartier', 'quartier', 'arrondissement', 'ville', 'city'], field: 'quartier' },
  // Instagram
  { keywords: ['instagram', 'insta', 'compte instagram', 'compte insta'], field: 'instagram' },
  // Followers
  { keywords: ['abonnes ig', 'abonnés ig', 'abonne ig', 'abonné ig', 'abonnes', 'abonnés', 'follower', 'followers'], field: 'abonnes' },
  // Google rating
  { keywords: ['note google', 'rating google', 'google rating'], field: 'note_google' },
  // Google reviews
  { keywords: ['nb avis google', 'nombre avis google', 'avis google', 'nb avis', 'nombre avis'], field: 'avis_google' },
  // Priority
  { keywords: ['priorite', 'priorité', 'priority', 'prio'], field: 'priorite' },
  // Score
  { keywords: ['score prospect', 'score', 'points'], field: 'score' },
  // Freq posts
  { keywords: ['frequence posts', 'fréquence posts', 'frequence', 'fréquence', 'freq post'], field: 'freq_posts' },
  // Visual quality
  { keywords: ['qualite visuelle', 'qualité visuelle', 'qualite', 'qualité'], field: 'qualite_visuelle' },
  // Date contact — specific first
  { keywords: ['date 1er contact', 'date premier contact', 'date contact', 'date_contact', '1er contact', 'premier contact'], field: 'date_contact' },
  // Angle
  { keywords: ['angle approche', "angle d'approche", 'angle', 'approche', 'pitch'], field: 'angle_approche' },
  // Status
  { keywords: ['statut pipeline', 'statut', 'status', 'pipeline', 'etape', 'étape'], field: 'status' },
  // Source / Canal
  { keywords: ['canal contact', 'canal', 'source', 'channel', 'origine', 'provenance', 'acquisition'], field: 'source' },
  // Plan
  { keywords: ['plan souscrit', 'plan', 'abonnement', 'subscription'], field: 'matched_plan' },
  // Motif refus → goes to notes as extra data
  { keywords: ['motif refus', 'motif', 'raison refus'], field: '_motif_refus' },
  // Notes (last)
  { keywords: ['notes', 'commentaire', 'comment', 'remarque', 'observation'], field: 'notes' },
  // Extra fields → go to notes
  { keywords: ['site web', 'site internet', 'website', 'url'], field: '_site_web' },
  { keywords: ['recommande par', 'recommandé par', 'parrain', 'referral'], field: '_recommande_par' },
  // Adresse physique → goes to notes (not quartier)
  { keywords: ['adresse'], field: '_adresse' },
];

// Normalize: lowercase + remove accents
function normalize(str: string): string {
  return str.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectColumnMapping(headers: string[]): { mapping: Record<number, string>; unmapped: string[]; hasPrenom: boolean } {
  const mapping: Record<number, string> = {};
  const usedFields = new Set<string>();
  const unmapped: string[] = [];

  // Pre-scan: check if "Prénom" exists to determine if "Nom" = person or business
  const hasPrenom = headers.some(h => {
    const n = normalize(h || '');
    return n === 'prenom' || n === 'prénom' || n.includes('prenom') || n.includes('prénom');
  });

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
        // Only forward match: header contains keyword
        if (h.includes(nkw)) {
          let field = rule.field;
          // Special: if "Nom" matches last_name but no Prénom column → route to company
          if (field === 'last_name' && !hasPrenom) {
            field = 'company';
            if (usedFields.has('company')) continue;
          }
          mapping[i] = field;
          usedFields.add(field);
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

  return { mapping, unmapped, hasPrenom };
}

// ─── Value normalization ──────────────────────────────────────────────────

function normalizePriority(val: string): string {
  const v = normalize(val);
  // Check for keywords (no single-letter matching to avoid false positives)
  if (['haute', 'elevee', 'high', 'hot', 'chaud', 'chaude', 'urgente', 'urgent'].some(k => v.includes(k))) return 'A';
  if (['basse', 'faible', 'low', 'cold', 'froid', 'froide'].some(k => v.includes(k))) return 'C';
  if (['moyenne', 'moyen', 'medium', 'warm', 'tiede'].some(k => v.includes(k))) return 'B';
  // Exact single-letter or number check (after removing spaces and dashes)
  const clean = v.replace(/[^a-z0-9]/g, '');
  if (clean.startsWith('a') || clean === '1') return 'A';
  if (clean.startsWith('c') || clean === '3') return 'C';
  if (clean.startsWith('b') || clean === '2') return 'B';
  return 'B';
}

function normalizeStatus(val: string): string {
  const v = normalize(val);
  const STATUS_MAP: [string[], string][] = [
    [['identifie', 'nouveau', 'new', 'prospect', 'a contacter'], 'identifie'],
    [['contacte', 'contacted', 'en attente', 'message envoye'], 'contacte'],
    [['repondu', 'replied', 'reponse', 'interesse'], 'repondu'],
    [['demo', 'demonstration', 'rdv', 'rendez-vous'], 'demo'],
    [['sprint', 'essai', 'trial', 'test', 'en cours'], 'sprint'],
    [['client', 'converti', 'converted', 'gagne', 'won', 'signe'], 'client'],
    [['perdu', 'lost', 'refuse', 'annule', 'churne'], 'perdu'],
  ];
  for (const [keywords, status] of STATUS_MAP) {
    for (const kw of keywords) {
      if (v.includes(kw)) return status;
    }
  }
  return 'identifie';
}

function normalizeSource(val: string): string {
  const v = normalize(val);
  const SOURCE_MAP: [string[], string][] = [
    [['dm instagram', 'dm insta', 'instagram dm', 'message instagram', 'msg insta'], 'dm_instagram'],
    [['email', 'e-mail', 'mail', 'courriel'], 'email'],
    [['telephone', 'tel', 'appel', 'phone', 'sms'], 'telephone'],
    [['linkedin', 'linked in'], 'linkedin'],
    [['terrain', 'porte a porte', 'visite', 'en personne', 'physique', 'sur place'], 'terrain'],
    [['facebook', 'fb', 'messenger'], 'facebook'],
    [['tiktok', 'tik tok'], 'tiktok'],
    [['recommandation', 'recommande', 'referral', 'bouche a oreille', 'parrainage'], 'recommandation'],
    // Google Maps, site web, etc. → other
    [['google', 'maps', 'site', 'web', 'internet', 'organique', 'seo'], 'other'],
  ];
  for (const [keywords, source] of SOURCE_MAP) {
    for (const kw of keywords) {
      if (v.includes(kw)) return source;
    }
  }
  return 'other';
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
    const { mapping: columnMapping, unmapped, hasPrenom } = detectColumnMapping(headers);

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
      const extraData: string[] = [];

      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const value = row[colIdx];
        if (value === undefined || value === null || value === '') continue;
        const strValue = String(value).trim();
        if (!strValue) continue;

        if (columnMapping[colIdx]) {
          record[columnMapping[colIdx]] = strValue;
        } else if (headers[colIdx]) {
          extraData.push(`${headers[colIdx]}: ${strValue}`);
        }
      }

      // Handle combined "nom" for person names (when Prénom column exists)
      if (record.last_name && !hasPrenom) {
        // No prénom column → "Nom" was already routed to company
        // (handled in detectColumnMapping)
      } else if (record.last_name && hasPrenom && !record.first_name) {
        // Has prénom column but it wasn't filled → try to split
        const parts = record.last_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          record.first_name = parts[0];
          record.last_name = parts.slice(1).join(' ');
        }
      }

      // Handle special mapped fields → add to extra notes
      if (record._site_web) {
        extraData.unshift(`Site web: ${record._site_web}`);
        delete record._site_web;
      }
      if (record._recommande_par) {
        extraData.unshift(`Recommandé par: ${record._recommande_par}`);
        delete record._recommande_par;
      }
      if (record._adresse) {
        extraData.unshift(`Adresse: ${record._adresse}`);
        delete record._adresse;
      }
      if (record._motif_refus) {
        extraData.unshift(`Motif refus: ${record._motif_refus}`);
        delete record._motif_refus;
      }

      // Skip only truly empty rows
      const hasAnyData = record.first_name || record.last_name || record.email ||
        record.phone || record.company || record.instagram || record.type;
      if (!hasAnyData) {
        skipped++;
        continue;
      }

      // Normalize values
      const normalizedPriority = record.priorite ? normalizePriority(record.priorite) : 'B';
      const normalizedStatus = record.status ? normalizeStatus(record.status) : 'identifie';
      const normalizedSource = record.source ? normalizeSource(record.source) : 'import';

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
        status: normalizedStatus,
        source: normalizedSource,
        notes: notes || null,
        type: record.type || null,
        quartier: record.quartier || null,
        instagram: record.instagram || null,
        abonnes: record.abonnes ? Number(String(record.abonnes).replace(/[^\d]/g, '')) || null : null,
        note_google: record.note_google ? Number(String(record.note_google).replace(',', '.')) || null : null,
        avis_google: record.avis_google ? Number(String(record.avis_google).replace(/[^\d]/g, '')) || null : null,
        priorite: normalizedPriority,
        score: record.score ? Number(String(record.score).replace(/[^\d]/g, '')) || 0 : 0,
        freq_posts: record.freq_posts || null,
        qualite_visuelle: record.qualite_visuelle || null,
        date_contact: record.date_contact || null,
        angle_approche: record.angle_approche || null,
        matched_plan: record.matched_plan || null,
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
