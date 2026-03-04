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
  { keywords: ['prenom', 'prénom', 'first name', 'first_name', 'firstname'], field: 'first_name' },
  { keywords: ['nom de', 'nom du', 'raison sociale', 'enseigne'], field: 'company' },
  { keywords: ['nom'], field: 'last_name' },
  { keywords: ['email', 'e-mail', 'adresse mail', 'adresse email', 'adresse e-mail', 'courriel'], field: 'email' },
  { keywords: ['telephone', 'téléphone', 'phone', 'portable', 'mobile'], field: 'phone' },
  { keywords: ['entreprise', 'company', 'societe', 'société', 'etablissement', 'établissement', 'restaurant', 'commerce', 'boutique', 'salon', 'magasin'], field: 'company' },
  { keywords: ['type activite', 'type activité', 'sous-categorie', 'sous-catégorie', 'sous categorie', 'type', 'categorie', 'catégorie', 'activite', 'activité', 'secteur', 'metier', 'métier'], field: 'type' },
  { keywords: ['ville / quartier', 'ville/quartier', 'quartier', 'arrondissement', 'ville', 'city'], field: 'quartier' },
  { keywords: ['instagram', 'insta', 'compte instagram', 'compte insta'], field: 'instagram' },
  { keywords: ['abonnes ig', 'abonnés ig', 'abonne ig', 'abonné ig', 'abonnes', 'abonnés', 'follower', 'followers'], field: 'abonnes' },
  { keywords: ['note google', 'rating google', 'google rating'], field: 'note_google' },
  { keywords: ['nb avis google', 'nombre avis google', 'avis google', 'nb avis', 'nombre avis'], field: 'avis_google' },
  { keywords: ['priorite', 'priorité', 'priority', 'prio'], field: 'priorite' },
  { keywords: ['score prospect', 'score', 'points'], field: 'score' },
  { keywords: ['frequence posts', 'fréquence posts', 'frequence', 'fréquence', 'freq post'], field: 'freq_posts' },
  { keywords: ['qualite visuelle', 'qualité visuelle', 'qualite', 'qualité'], field: 'qualite_visuelle' },
  { keywords: ['date 1er contact', 'date premier contact', 'date contact', 'date_contact', '1er contact', 'premier contact'], field: 'date_contact' },
  { keywords: ['angle approche', "angle d'approche", 'angle', 'approche', 'pitch'], field: 'angle_approche' },
  { keywords: ['statut pipeline', 'statut', 'status', 'pipeline', 'etape', 'étape'], field: 'status' },
  { keywords: ['canal contact', 'canal', 'source', 'channel', 'origine', 'provenance', 'acquisition'], field: 'source' },
  { keywords: ['plan souscrit', 'plan', 'abonnement', 'subscription'], field: 'matched_plan' },
  { keywords: ['motif refus', 'motif', 'raison refus'], field: '_motif_refus' },
  { keywords: ['notes', 'commentaire', 'comment', 'remarque', 'observation'], field: 'notes' },
  { keywords: ['site web', 'site internet', 'website', 'url'], field: '_site_web' },
  { keywords: ['recommande par', 'recommandé par', 'parrain', 'referral'], field: '_recommande_par' },
  { keywords: ['adresse'], field: '_adresse' },
];

// Pipeline stage order (for preventing status regression)
const STATUS_ORDER: Record<string, number> = {
  identifie: 0, contacte: 1, repondu: 2, demo: 3, sprint: 4, client: 5, perdu: -1,
};

const PRIO_ORDER: Record<string, number> = { A: 3, B: 2, C: 1 };

function normalize(str: string): string {
  return str.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function normalizeInstagram(ig: string): string {
  return ig.replace(/^@/, '').toLowerCase().trim();
}

function detectColumnMapping(headers: string[]): { mapping: Record<number, string>; unmapped: string[]; hasPrenom: boolean } {
  const mapping: Record<number, string> = {};
  const usedFields = new Set<string>();
  const unmapped: string[] = [];

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
        if (h.includes(nkw)) {
          let field = rule.field;
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

    if (!matched) unmapped.push(raw);
  }

  return { mapping, unmapped, hasPrenom };
}

// ─── Value normalization ──────────────────────────────────────────────────

function normalizePriority(val: string): string {
  const v = normalize(val);
  if (['haute', 'elevee', 'high', 'hot', 'chaud', 'chaude', 'urgente', 'urgent'].some(k => v.includes(k))) return 'A';
  if (['basse', 'faible', 'low', 'cold', 'froid', 'froide'].some(k => v.includes(k))) return 'C';
  if (['moyenne', 'moyen', 'medium', 'warm', 'tiede'].some(k => v.includes(k))) return 'B';
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
    [['google', 'maps', 'site', 'web', 'internet', 'organique', 'seo'], 'other'],
  ];
  for (const [keywords, source] of SOURCE_MAP) {
    for (const kw of keywords) {
      if (v.includes(kw)) return source;
    }
  }
  return 'other';
}

// ─── Smart merge: fill empty fields, never overwrite, never regress ───────

function mergeProspect(
  existing: Record<string, any>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  // Text fields: only fill if existing is empty
  const textFields = [
    'first_name', 'last_name', 'email', 'phone', 'company', 'type',
    'quartier', 'instagram', 'freq_posts', 'qualite_visuelle',
    'date_contact', 'angle_approche', 'matched_plan',
  ];
  for (const f of textFields) {
    if (incoming[f] && !existing[f]) {
      updates[f] = incoming[f];
    }
  }

  // Numeric fields: only fill if existing is null/0
  const numFields = ['abonnes', 'note_google', 'avis_google'];
  for (const f of numFields) {
    if (incoming[f] != null && (existing[f] == null || existing[f] === 0)) {
      updates[f] = incoming[f];
    }
  }

  // Score: keep the higher value
  if (incoming.score != null && typeof incoming.score === 'number') {
    if (incoming.score > (existing.score || 0)) {
      updates.score = incoming.score;
    }
  }

  // Priority: keep the higher priority (A > B > C)
  if (incoming.priorite && typeof incoming.priorite === 'string') {
    const existingPrio = PRIO_ORDER[existing.priorite] || 0;
    const incomingPrio = PRIO_ORDER[incoming.priorite as string] || 0;
    if (incomingPrio > existingPrio) {
      updates.priorite = incoming.priorite;
    }
  }

  // Status: only advance in pipeline, never go back
  if (incoming.status && typeof incoming.status === 'string') {
    const existingOrder = STATUS_ORDER[existing.status] ?? 0;
    const incomingOrder = STATUS_ORDER[incoming.status as string] ?? 0;
    // Special: don't overwrite with 'perdu' from import, and don't regress
    if (incoming.status !== 'perdu' && incomingOrder > existingOrder && existing.status !== 'perdu') {
      updates.status = incoming.status;
    }
  }

  // Source: only fill if existing is 'import' or 'other' or empty
  if (incoming.source && typeof incoming.source === 'string') {
    if (!existing.source || existing.source === 'import' || existing.source === 'other') {
      if (incoming.source !== 'import' && incoming.source !== 'other') {
        updates.source = incoming.source;
      }
    }
  }

  // Notes: append new notes (never overwrite)
  if (incoming.notes && typeof incoming.notes === 'string') {
    if (!existing.notes) {
      updates.notes = incoming.notes;
    } else if (!existing.notes.includes(incoming.notes)) {
      // Append only if not already present
      updates.notes = `${existing.notes}\n---\n${incoming.notes}`;
    }
  }

  // updated_at
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
  }

  return updates;
}

// ─── Find existing prospect by matching identifiers ──────────────────────

async function findExistingProspect(
  supabase: ReturnType<typeof getAdminClient>,
  data: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  // 1. Match by company name (case-insensitive)
  if (data.company && typeof data.company === 'string') {
    const { data: match } = await supabase
      .from('crm_prospects')
      .select('*')
      .ilike('company', data.company as string)
      .limit(1)
      .maybeSingle();
    if (match) return match;
  }

  // 2. Match by Instagram handle
  if (data.instagram && typeof data.instagram === 'string') {
    const igNorm = normalizeInstagram(data.instagram as string);
    if (igNorm) {
      const { data: match } = await supabase
        .from('crm_prospects')
        .select('*')
        .or(`instagram.ilike.${igNorm},instagram.ilike.@${igNorm}`)
        .limit(1)
        .maybeSingle();
      if (match) return match;
    }
  }

  // 3. Match by phone (digits only)
  if (data.phone && typeof data.phone === 'string') {
    const phoneDigits = normalizePhone(data.phone as string);
    if (phoneDigits.length >= 8) {
      // Match last 9 digits to handle +33 vs 0 prefix differences
      const suffix = phoneDigits.slice(-9);
      const { data: matches } = await supabase
        .from('crm_prospects')
        .select('*')
        .not('phone', 'is', null);
      if (matches) {
        const found = matches.find(m => m.phone && normalizePhone(m.phone).slice(-9) === suffix);
        if (found) return found;
      }
    }
  }

  // 4. Match by email
  if (data.email && typeof data.email === 'string') {
    const { data: match } = await supabase
      .from('crm_prospects')
      .select('*')
      .ilike('email', data.email as string)
      .limit(1)
      .maybeSingle();
    if (match) return match;
  }

  return null;
}

// ─── POST: Import ────────────────────────────────────────────────────────

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

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    if (!validExtensions.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({ error: 'Format non supporté. Utilisez .xlsx, .xls ou .csv' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
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

    const headers = rows[0] as string[];
    const { mapping: columnMapping, unmapped, hasPrenom } = detectColumnMapping(headers);

    const mappedHeaders: Record<string, string> = {};
    for (const [colIdx, field] of Object.entries(columnMapping)) {
      mappedHeaders[String(headers[parseInt(colIdx)])] = field;
    }

    if (Object.keys(columnMapping).length === 0) {
      return NextResponse.json({
        error: `Aucune colonne reconnue. En-têtes : ${headers.filter(Boolean).join(', ')}`,
      }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      if (!row || row.every(v => v === undefined || v === null || v === '')) {
        skipped++;
        continue;
      }

      // Map columns
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

      // Handle combined "nom"
      if (record.last_name && hasPrenom && !record.first_name) {
        const parts = record.last_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          record.first_name = parts[0];
          record.last_name = parts.slice(1).join(' ');
        }
      }

      // Special fields → extra notes
      for (const key of ['_site_web', '_recommande_par', '_adresse', '_motif_refus']) {
        if (record[key]) {
          const label = key === '_site_web' ? 'Site web' : key === '_recommande_par' ? 'Recommandé par' : key === '_adresse' ? 'Adresse' : 'Motif refus';
          extraData.unshift(`${label}: ${record[key]}`);
          delete record[key];
        }
      }

      // Skip empty rows
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

      try {
        // Check for existing prospect (duplicate detection)
        const existing = await findExistingProspect(supabase, prospectData);

        if (existing) {
          // Merge: fill empty fields, advance status, never remove data
          const updates = mergeProspect(existing, prospectData);

          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from('crm_prospects')
              .update(updates)
              .eq('id', existing.id);

            if (updateError) {
              errors.push(`Ligne ${rowIdx + 1}: mise à jour échouée — ${updateError.message}`);
            } else {
              updated++;
            }
          } else {
            skipped++; // Nothing new to update
          }
        } else {
          // New prospect
          const { error: insertError } = await supabase
            .from('crm_prospects')
            .insert(prospectData);

          if (insertError) {
            errors.push(`Ligne ${rowIdx + 1}: ${insertError.message}`);
          } else {
            created++;
          }
        }
      } catch (e: any) {
        errors.push(`Ligne ${rowIdx + 1}: ${e.message || 'Erreur inconnue'}`);
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
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
