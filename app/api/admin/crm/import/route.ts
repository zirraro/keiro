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
  { keywords: ['frequence posts', 'fréquence posts', 'freq. posts', 'freq posts', 'frequence', 'fréquence', 'freq post', 'freq.'], field: 'freq_posts' },
  { keywords: ['qualite visuelle', 'qualité visuelle', 'qualite', 'qualité'], field: 'qualite_visuelle' },
  { keywords: ['date 1er contact', 'date premier contact', 'date contact', 'date_contact', '1er contact', 'premier contact'], field: 'date_contact' },
  { keywords: ['notes / angle', 'notes/angle', 'angle approche', "angle d'approche", 'angle', 'approche', 'pitch'], field: 'angle_approche' },
  { keywords: ['statut pipeline', 'statut', 'status', 'pipeline', 'etape', 'étape'], field: 'status' },
  { keywords: ['canal contact', 'canal', 'source', 'channel', 'origine', 'provenance', 'acquisition'], field: 'source' },
  { keywords: ['plan souscrit', 'plan', 'abonnement', 'subscription'], field: 'matched_plan' },
  { keywords: ['motif refus', 'motif', 'raison refus'], field: '_motif_refus' },
  { keywords: ['notes', 'commentaire', 'comment', 'remarque', 'observation'], field: 'notes' },
  { keywords: ['site web', 'site internet', 'website', 'url'], field: '_site_web' },
  { keywords: ['recommande par', 'recommandé par', 'parrain', 'referral'], field: '_recommande_par' },
  { keywords: ['adresse'], field: '_adresse' },
  // Colonnes terrain / visite
  { keywords: ['date visite', 'date de visite'], field: '_date_visite' },
  { keywords: ['resultat visite', 'résultat visite', 'resultat de visite', 'résultat de visite'], field: '_resultat_visite' },
  { keywords: ['zone terrain', 'zone de terrain', 'zone prospection'], field: '_zone_terrain' },
  { keywords: ['meilleur creneau', 'meilleur créneau', 'creneau visite', 'créneau visite', 'creneau', 'créneau'], field: '_creneau_visite' },
  { keywords: ['whatsapp recupere', 'whatsapp récupéré', 'whatsapp', 'numero whatsapp', 'numéro whatsapp'], field: '_whatsapp' },
  { keywords: ['sprint vendu', 'sprint'], field: '_sprint_vendu' },
  { keywords: ['converti pro', 'converti fond', 'converti', 'conversion', 'converted'], field: '_converti' },
  { keywords: ['sous-categorie', 'sous-catégorie', 'sous categorie', 'sous catégorie'], field: '_sous_categorie' },
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
    [['instagram', 'insta'], 'dm_instagram'],
    [['google', 'maps', 'thefork', 'the fork', 'tripadvisor', 'site', 'web', 'internet', 'organique', 'seo'], 'other'],
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

// ─── In-memory prospect index for fast duplicate detection ───────────────

type ProspectIndex = {
  byCompany: Map<string, Record<string, any>>;
  byInstagram: Map<string, Record<string, any>>;
  byPhone: Map<string, Record<string, any>>;
  byEmail: Map<string, Record<string, any>>;
};

function buildProspectIndex(prospects: Record<string, any>[]): ProspectIndex {
  const idx: ProspectIndex = {
    byCompany: new Map(),
    byInstagram: new Map(),
    byPhone: new Map(),
    byEmail: new Map(),
  };
  for (const p of prospects) {
    if (p.company) idx.byCompany.set(p.company.toLowerCase().trim(), p);
    if (p.instagram) {
      const ig = normalizeInstagram(p.instagram);
      if (ig) idx.byInstagram.set(ig, p);
    }
    if (p.phone) {
      const digits = normalizePhone(p.phone);
      if (digits.length >= 8) idx.byPhone.set(digits.slice(-9), p);
    }
    if (p.email) idx.byEmail.set(p.email.toLowerCase().trim(), p);
  }
  return idx;
}

function findExistingInMemory(idx: ProspectIndex, data: Record<string, unknown>): Record<string, any> | null {
  if (data.company && typeof data.company === 'string') {
    const match = idx.byCompany.get(data.company.toLowerCase().trim());
    if (match) return match;
  }
  if (data.instagram && typeof data.instagram === 'string') {
    const ig = normalizeInstagram(data.instagram);
    if (ig) {
      const match = idx.byInstagram.get(ig);
      if (match) return match;
    }
  }
  if (data.phone && typeof data.phone === 'string') {
    const digits = normalizePhone(data.phone);
    if (digits.length >= 8) {
      const match = idx.byPhone.get(digits.slice(-9));
      if (match) return match;
    }
  }
  if (data.email && typeof data.email === 'string') {
    const match = idx.byEmail.get(data.email.toLowerCase().trim());
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
    const mappedFields = new Set<string>();
    for (const [colIdx, field] of Object.entries(columnMapping)) {
      mappedHeaders[String(headers[parseInt(colIdx)])] = field;
      mappedFields.add(field);
    }

    // Auto-detect file type for source default
    const isTerrainFile = mappedFields.has('_zone_terrain') || mappedFields.has('_date_visite') || mappedFields.has('_resultat_visite') || mappedFields.has('_creneau_visite');
    const defaultSource = isTerrainFile ? 'terrain' : 'import';

    if (Object.keys(columnMapping).length === 0) {
      return NextResponse.json({
        error: `Aucune colonne reconnue. En-têtes : ${headers.filter(Boolean).join(', ')}`,
      }, { status: 400 });
    }

    // ─── Pre-load ALL existing prospects + profiles (paginated, Supabase max 1000/page) ────
    const allProspects: any[] = [];
    let pgFrom = 0;
    const PG_SIZE = 1000;
    while (true) {
      const { data: pg } = await supabase.from('crm_prospects').select('*').range(pgFrom, pgFrom + PG_SIZE - 1).order('created_at', { ascending: true });
      if (!pg || pg.length === 0) break;
      allProspects.push(...pg);
      if (pg.length < PG_SIZE) break;
      pgFrom += PG_SIZE;
    }
    const prospectIdx = buildProspectIndex(allProspects);

    const allProfiles: any[] = [];
    let pfFrom = 0;
    while (true) {
      const { data: pf } = await supabase.from('profiles').select('id, email, subscription_plan, is_admin').range(pfFrom, pfFrom + PG_SIZE - 1);
      if (!pf || pf.length === 0) break;
      allProfiles.push(...pf);
      if (pf.length < PG_SIZE) break;
      pfFrom += PG_SIZE;
    }
    const profilesByEmail = new Map<string, { id: string; subscription_plan: string; is_admin?: boolean }>();
    for (const p of allProfiles || []) {
      if (p.email) profilesByEmail.set(p.email.toLowerCase().trim(), p);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let alreadyUpToDate = 0;
    let mergedInFile = 0;
    const errors: string[] = [];
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; updates: Record<string, unknown> }[] = [];

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

      // Special fields → extra notes or smart field mapping
      const SPECIAL_LABELS: Record<string, string> = {
        '_site_web': 'Site web', '_recommande_par': 'Recommandé par', '_adresse': 'Adresse',
        '_motif_refus': 'Motif refus', '_zone_terrain': 'Zone terrain',
        '_creneau_visite': 'Meilleur créneau visite', '_sous_categorie': 'Sous-catégorie',
      };
      for (const [key, label] of Object.entries(SPECIAL_LABELS)) {
        if (record[key]) {
          extraData.unshift(`${label}: ${record[key]}`);
          delete record[key];
        }
      }

      // Date visite → date_contact (si pas déjà rempli)
      if (record['_date_visite']) {
        if (!record.date_contact) record.date_contact = record['_date_visite'];
        else extraData.unshift(`Date visite: ${record['_date_visite']}`);
        delete record['_date_visite'];
      }

      // Résultat visite → notes + smart status detection
      if (record['_resultat_visite']) {
        const rv = normalize(record['_resultat_visite']);
        extraData.unshift(`Résultat visite: ${record['_resultat_visite']}`);
        // Smart status: si le résultat indique un intérêt/vente
        if (['interesse', 'a rappeler', 'rappeler', 'rdv', 'positif'].some(k => rv.includes(k))) {
          if (!record.status || normalizeStatus(record.status) === 'identifie') {
            record.status = 'repondu';
          }
        }
        delete record['_resultat_visite'];
      }

      // WhatsApp → phone (si pas de phone) ou notes
      if (record['_whatsapp']) {
        const wa = record['_whatsapp'].trim();
        if (wa && wa.toLowerCase() !== 'non' && wa !== '0' && wa !== '-') {
          if (!record.phone) {
            record.phone = wa;
          } else {
            extraData.unshift(`WhatsApp: ${wa}`);
          }
        }
        delete record['_whatsapp'];
      }

      // Sprint vendu → matched_plan + status
      if (record['_sprint_vendu']) {
        const sv = normalize(record['_sprint_vendu']);
        if (['oui', 'yes', '1', 'vrai', 'true', 'vendu', 'ok', 'fait'].some(k => sv.includes(k))) {
          record.matched_plan = record.matched_plan || 'sprint';
          if (!record.status || ['identifie', 'contacte', 'repondu', 'demo'].includes(normalizeStatus(record.status || ''))) {
            record.status = 'sprint';
          }
        }
        delete record['_sprint_vendu'];
      }

      // Converti Pro/Fond → matched_plan + status client
      if (record['_converti']) {
        const cv = normalize(record['_converti']);
        if (['oui', 'yes', '1', 'vrai', 'true', 'converti', 'ok'].some(k => cv.includes(k))) {
          // Détecter le plan depuis la valeur
          if (cv.includes('fond') || cv.includes('fondateur')) {
            record.matched_plan = 'fondateurs';
          } else if (cv.includes('pro') || cv.includes('standard')) {
            record.matched_plan = 'standard';
          } else if (!record.matched_plan) {
            record.matched_plan = 'client';
          }
          record.status = 'client';
        }
        delete record['_converti'];
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
      const normalizedSource = record.source ? normalizeSource(record.source) : defaultSource;

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

      // Auto-match email with profiles (in-memory, skip admin emails)
      const ADMIN_EMAILS = ['contact@keiroai.com'];
      if (record.email && !ADMIN_EMAILS.includes(record.email.toLowerCase().trim())) {
        const matchedProfile = profilesByEmail.get(record.email.toLowerCase().trim());
        if (matchedProfile && !matchedProfile.is_admin) {
          prospectData.matched_user_id = matchedProfile.id;
          prospectData.matched_plan = matchedProfile.subscription_plan;
        }
      }

      // Check for existing prospect (in-memory, zero queries)
      const existing = findExistingInMemory(prospectIdx, prospectData);

      if (existing) {
        const updates = mergeProspect(existing, prospectData);
        if (Object.keys(updates).length > 0) {
          const existingId = existing.id as string;
          if (existingId.startsWith('pending-')) {
            // Duplicate within same file — merge into the pending insert
            Object.assign(existing, updates);
            mergedInFile++;
          } else {
            // Existing in DB — schedule an update
            toUpdate.push({ id: existingId, updates });
            Object.assign(existing, updates);
          }
        } else {
          alreadyUpToDate++;
        }
      } else {
        const insertIdx = toInsert.length;
        toInsert.push(prospectData);
        // Add to in-memory index to detect duplicates within the same import file
        // Use the same reference as toInsert so merges update the actual insert data
        const indexRef = toInsert[insertIdx];
        (indexRef as any).id = `pending-${rowIdx}`;
        if (prospectData.company && typeof prospectData.company === 'string') {
          prospectIdx.byCompany.set(prospectData.company.toLowerCase().trim(), indexRef);
        }
        if (prospectData.instagram && typeof prospectData.instagram === 'string') {
          const ig = normalizeInstagram(prospectData.instagram);
          if (ig) prospectIdx.byInstagram.set(ig, indexRef);
        }
        if (prospectData.phone && typeof prospectData.phone === 'string') {
          const digits = normalizePhone(prospectData.phone);
          if (digits.length >= 8) prospectIdx.byPhone.set(digits.slice(-9), indexRef);
        }
        if (prospectData.email && typeof prospectData.email === 'string') {
          prospectIdx.byEmail.set(prospectData.email.toLowerCase().trim(), indexRef);
        }
      }
    }

    // ─── Batch insert new prospects (chunks of 100) ─────────────────────
    // Strip fake IDs used for in-memory dedup
    for (const rec of toInsert) {
      delete (rec as any).id;
    }
    const BATCH_SIZE = 100;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase.from('crm_prospects').insert(batch);
      if (insertError) {
        errors.push(`Batch insert ${i + 1}-${i + batch.length}: ${insertError.message}`);
      } else {
        created += batch.length;
      }
    }

    // ─── Batch update existing prospects (individual updates needed for different data per row) ──
    // Group updates to minimize queries - but each update has unique data, so we parallel them
    const UPDATE_BATCH = 50;
    for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
      const batch = toUpdate.slice(i, i + UPDATE_BATCH);
      const results = await Promise.all(
        batch.map(({ id, updates }) =>
          supabase.from('crm_prospects').update(updates).eq('id', id).then(r => r.error)
        )
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j]) {
          errors.push(`Update ${batch[j].id}: ${results[j]!.message}`);
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      skipped,
      alreadyUpToDate,
      mergedInFile,
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
