import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/crm/import
 * Import prospects from Excel/CSV file.
 * Louis (comptable) parses and maps columns intelligently.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
    return NextResponse.json({ error: 'Format accepte: CSV, XLSX, XLS' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rawData: string[][] = [];

  // Parse file
  if (ext === 'csv') {
    const text = buffer.toString('utf-8');
    rawData = text.split('\n').map(line =>
      line.split(/[,;]/).map(cell => cell.replace(/^["']|["']$/g, '').trim())
    ).filter(row => row.some(cell => cell.length > 0));
  } else {
    // XLSX parsing via jszip
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buffer);
      const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string') || '';
      const sharedStrings = (sharedStringsXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, ''));

      const sheet1Xml = await zip.file('xl/worksheets/sheet1.xml')?.async('string') || '';
      const rows = sheet1Xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];

      for (const row of rows) {
        const cells = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
        const rowData: string[] = [];
        for (const cell of cells) {
          const isShared = cell.includes('t="s"');
          const valueMatch = cell.match(/<v>(\d+)<\/v>/);
          if (valueMatch) {
            rowData.push(isShared ? (sharedStrings[parseInt(valueMatch[1])] || '') : valueMatch[1]);
          } else {
            rowData.push('');
          }
        }
        if (rowData.some(c => c.length > 0)) rawData.push(rowData);
      }
    } catch (e: any) {
      return NextResponse.json({ error: `Erreur lecture fichier: ${e.message}` }, { status: 400 });
    }
  }

  if (rawData.length < 2) {
    return NextResponse.json({ error: 'Fichier vide ou invalide (min 2 lignes: header + data)' }, { status: 400 });
  }

  const headers = rawData[0];
  const dataRows = rawData.slice(1); // No row limit — process all rows

  // Use Claude (Louis) to map columns intelligently
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let mapping: Record<string, string> = {};

  if (apiKey) {
    try {
      const anthropic = new Anthropic({ apiKey });
      const sampleRows = dataRows.slice(0, 3).map(r => r.join(' | ')).join('\n');

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Tu es Louis, agent comptable IA. Analyse ces colonnes d'un fichier Excel importe dans un CRM et mappe chaque colonne au bon champ CRM.

COLONNES DU FICHIER: ${headers.join(', ')}

EXEMPLES DE DONNEES:
${sampleRows}

CHAMPS CRM DISPONIBLES:
first_name, last_name, email, phone, company, type (restaurant/boutique/coach/etc), quartier, instagram, status (identifie/contacte/client), source, notes, tags

Reponds UNIQUEMENT avec un JSON mappant chaque colonne du fichier au champ CRM correspondant.
Exemple: {"Nom": "last_name", "Prenom": "first_name", "Mail": "email", "Societe": "company"}
Si une colonne ne correspond a rien, ne l'inclus pas.`,
        }],
      });

      const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) mapping = JSON.parse(jsonMatch[0]);
    } catch {}
  }

  // Fallback mapping if AI fails
  if (Object.keys(mapping).length === 0) {
    const autoMap: Record<string, string> = {
      'nom': 'last_name', 'name': 'last_name', 'last_name': 'last_name',
      'prenom': 'first_name', 'firstname': 'first_name', 'first_name': 'first_name',
      'email': 'email', 'mail': 'email', 'e-mail': 'email',
      'telephone': 'phone', 'tel': 'phone', 'phone': 'phone', 'mobile': 'phone',
      'societe': 'company', 'entreprise': 'company', 'company': 'company', 'commerce': 'company',
      'type': 'type', 'categorie': 'type', 'category': 'type', 'secteur': 'type',
      'ville': 'quartier', 'quartier': 'quartier', 'city': 'quartier', 'adresse': 'quartier',
      'instagram': 'instagram', 'ig': 'instagram',
      'source': 'source', 'origine': 'source',
      'notes': 'notes', 'commentaire': 'notes', 'note': 'notes',
      'statut': 'status', 'status': 'status',
    };
    for (const header of headers) {
      const key = header.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (autoMap[key]) mapping[header] = autoMap[key];
    }
  }

  // Resolve org_id
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  // Pre-load existing emails for fast dedup (single query instead of N queries)
  const allEmails = dataRows
    .map(row => {
      const emailIdx = headers.findIndex(h => mapping[h] === 'email');
      return emailIdx >= 0 ? row[emailIdx]?.trim().toLowerCase() : null;
    })
    .filter(Boolean) as string[];

  const existingEmails = new Set<string>();
  if (allEmails.length > 0) {
    // Batch check in chunks of 200
    for (let i = 0; i < allEmails.length; i += 200) {
      const chunk = allEmails.slice(i, i + 200);
      const { data: existing } = await supabase
        .from('crm_prospects')
        .select('email')
        .in('email', chunk);
      (existing || []).forEach((e: any) => { if (e.email) existingEmails.add(e.email.toLowerCase()); });
    }
  }

  // Build prospects and batch insert
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const batch: Record<string, any>[] = [];
  const seenEmails = new Set<string>();

  for (const row of dataRows) {
    const prospect: Record<string, any> = {
      created_by: user.id,
      user_id: user.id,
      status: 'identifie',
      temperature: 'cold',
      score: 0,
      source: `import_excel_${file.name}`,
    };

    if (orgMember?.org_id) prospect.org_id = orgMember.org_id;

    for (let i = 0; i < headers.length; i++) {
      const crmField = mapping[headers[i]];
      const value = row[i]?.trim();
      if (crmField && value) {
        if (crmField === 'score') prospect[crmField] = parseInt(value) || 0;
        else prospect[crmField] = value;
      }
    }

    // Skip if no email AND no company
    if (!prospect.email && !prospect.company) { skipped++; continue; }

    // Dedup within same file
    const email = prospect.email?.toLowerCase();
    if (email && seenEmails.has(email)) { skipped++; continue; }
    if (email) seenEmails.add(email);

    // If email exists in DB → UPDATE existing prospect with new data (merge)
    if (email && existingEmails.has(email)) {
      try {
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        // Only update fields that have values (don't overwrite with empty)
        if (prospect.company) updateData.company = prospect.company;
        if (prospect.phone) updateData.phone = prospect.phone;
        if (prospect.type) updateData.type = prospect.type;
        if (prospect.quartier) updateData.quartier = prospect.quartier;
        if (prospect.instagram) updateData.instagram = prospect.instagram;
        if (prospect.website) updateData.website = prospect.website;
        if (prospect.notes) updateData.notes = prospect.notes;
        if (prospect.first_name) updateData.first_name = prospect.first_name;
        if (prospect.last_name) updateData.last_name = prospect.last_name;
        if (Object.keys(updateData).length > 1) {
          await supabase.from('crm_prospects').update(updateData).eq('email', email);
          imported++; // Count as imported (updated)
        } else {
          skipped++;
        }
      } catch { skipped++; }
      continue;
    }

    batch.push(prospect);
  }

  // Batch insert in chunks of 100
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100);
    const { error: insertErr, data: inserted } = await supabase.from('crm_prospects').insert(chunk).select('id');
    if (insertErr) {
      errors.push(`Batch ${Math.floor(i / 100) + 1}: ${insertErr.message.substring(0, 100)}`);
      // Fallback: insert one by one for this batch to identify bad rows
      for (const p of chunk) {
        const { error: singleErr } = await supabase.from('crm_prospects').insert(p);
        if (singleErr) { skipped++; errors.push(`Row: ${singleErr.message.substring(0, 60)}`); }
        else { imported++; }
      }
    } else {
      imported += inserted?.length || chunk.length;
    }
  }

  // Log import for Louis
  await supabase.from('agent_logs').insert({
    agent: 'comptable',
    action: 'crm_import',
    status: 'success',
    data: { file: file.name, total_rows: dataRows.length, imported, skipped, mapping, errors: errors.slice(0, 5) },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    total: dataRows.length,
    mapping,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
