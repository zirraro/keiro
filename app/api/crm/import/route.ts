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
  const dataRows = rawData.slice(1).slice(0, 1000); // Max 1000 rows

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

  // Insert prospects
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of dataRows) {
    const prospect: Record<string, any> = {
      created_by: user.id,
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

    // Check for duplicate
    if (prospect.email) {
      const { data: existing } = await supabase
        .from('crm_prospects')
        .select('id')
        .eq('email', prospect.email)
        .limit(1)
        .maybeSingle();
      if (existing) { skipped++; continue; }
    }

    const { error: insertErr } = await supabase.from('crm_prospects').insert(prospect);
    if (insertErr) {
      errors.push(`Row ${imported + skipped + 1}: ${insertErr.message.substring(0, 80)}`);
      skipped++;
    } else {
      imported++;
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
