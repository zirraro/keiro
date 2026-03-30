import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'xlsx', 'xls', 'csv', 'txt', 'doc', 'docx', 'pptx', 'ppt',
  'png', 'jpg', 'jpeg',
]);

/**
 * Extract text from uploaded file buffer based on extension.
 * Supports: txt, csv, docx (XML-based), xlsx (XML-based)
 */
async function extractTextFromFile(buffer: Buffer, ext: string): Promise<string | null> {
  try {
    if (ext === 'txt' || ext === 'csv') {
      return buffer.toString('utf-8').substring(0, 15000);
    }

    if (ext === 'docx' || ext === 'pptx') {
      // DOCX/PPTX are ZIP archives with XML inside
      const JSZip = (await import('jszip')).default;
      // Robust buffer conversion — handles Buffer, ArrayBuffer, Uint8Array
      let zipInput: Uint8Array;
      if (buffer instanceof Uint8Array) {
        zipInput = buffer;
      } else if (Buffer.isBuffer(buffer)) {
        zipInput = new Uint8Array(buffer);
      } else {
        zipInput = new Uint8Array(buffer as any);
      }
      console.log(`[agent-files] JSZip loading ${ext}, input type: ${typeof zipInput}, length: ${zipInput.length}, first4: ${Array.from(zipInput.slice(0, 4)).map(b => b.toString(16)).join('')}`);
      const zip = await JSZip.loadAsync(zipInput);

      if (ext === 'docx') {
        // Try multiple XML paths (some DOCX have different structures)
        const docFile = zip.file('word/document.xml') || zip.file('word/document2.xml');
        const docXml = await docFile?.async('string');
        if (!docXml) {
          console.warn('[agent-files] DOCX: word/document.xml not found, trying raw text fallback');
          // Fallback: extract all text from all XML files in the ZIP
          const allTexts: string[] = [];
          for (const [path, file] of Object.entries(zip.files)) {
            if (path.endsWith('.xml') && !file.dir) {
              try {
                const xml = await file.async('string');
                const texts = xml.match(/<[wa]:t[^>]*>([^<]*)<\/[wa]:t>/g) || [];
                allTexts.push(...texts.map(t => t.replace(/<[^>]+>/g, '')));
              } catch {}
            }
          }
          const fallbackText = allTexts.join(' ').trim();
          console.log(`[agent-files] DOCX fallback extracted ${fallbackText.length} chars`);
          return fallbackText.length > 20 ? fallbackText.substring(0, 15000) : null;
        }
        // Primary: extract from <w:t> tags (handles xml:space="preserve" etc.)
        const texts = docXml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [];
        const extracted = texts.map(t => t.replace(/<[^>]+>/g, '')).join(' ').trim();
        console.log(`[agent-files] DOCX extracted ${extracted.length} chars from word/document.xml`);
        if (extracted.length < 20) {
          // Sometimes text is in <w:t> with newlines — try broader match
          const allText = docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          console.log(`[agent-files] DOCX broad extraction: ${allText.length} chars`);
          return allText.length > 20 ? allText.substring(0, 15000) : null;
        }
        return extracted.substring(0, 15000);
      }

      if (ext === 'pptx') {
        const slides: string[] = [];
        for (const [path, file] of Object.entries(zip.files)) {
          if (path.startsWith('ppt/slides/slide') && path.endsWith('.xml')) {
            const xml = await file.async('string');
            const texts = xml.match(/<a:t>[^<]*<\/a:t>/g) || [];
            slides.push(texts.map(t => t.replace(/<[^>]+>/g, '')).join(' '));
          }
        }
        return slides.join('\n\n').substring(0, 15000);
      }
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const JSZip = (await import('jszip')).default;
      const zipInput = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : new Uint8Array(buffer as any);
      const zip = await JSZip.loadAsync(zipInput);
      // Read shared strings
      const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
      if (!sharedStringsXml) return null;
      const strings = sharedStringsXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
      return strings.map(t => t.replace(/<[^>]+>/g, '')).join(' | ').substring(0, 15000);
    }

    // Old DOC/PPT binary formats — crude text extraction (grab readable strings)
    if (ext === 'doc' || ext === 'ppt') {
      const raw = buffer.toString('latin1');
      const strings = raw.match(/[\x20-\x7E\xC0-\xFF]{4,}/g) || [];
      const text = strings.join(' ').replace(/\s+/g, ' ').substring(0, 15000);
      return text.length > 50 ? text : null;
    }

    return null;
  } catch (e: any) {
    console.warn('[agent-files] Text extraction failed:', e.message);
    return null;
  }
}

const DOSSIER_EXTRACTION_PROMPT = `Analyse ce document (meme si le texte est brut ou mal formate) et extrais TOUTES les informations business pour remplir un dossier client. Le texte peut contenir du XML ou des caracteres speciaux — ignore-les et concentre-toi sur le contenu. Retourne UNIQUEMENT un JSON avec les champs trouves (ignore les champs vides).

Champs possibles:
company_name, company_description, business_type, founder_name, employees_count,
city, address, catchment_area, main_products, price_range, unique_selling_points, competitors,
target_audience, ideal_customer_profile, customer_pain_points,
brand_tone, visual_style, brand_colors, content_themes, preferred_channels, posting_frequency,
business_goals, marketing_goals, monthly_budget,
instagram_handle, tiktok_handle, website_url, google_maps_url, facebook_url,
phone, email, horaires_ouverture, specialite, nombre_couverts, panier_moyen, certifications, langues_parlees, modes_paiement, livraison, reservation_en_ligne

IMPORTANT: Extrais absolument TOUT ce que tu trouves, meme les champs custom. Sois exhaustif.
Reponds UNIQUEMENT avec le JSON, rien d'autre.`;

/**
 * Use Claude to extract business dossier fields from file text content.
 * Returns a JSON object with dossier fields to upsert.
 */
async function extractDossierFromText(text: string, fileName: string): Promise<Record<string, string> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !text || text.trim().length < 20) return null;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Fichier: "${fileName}"\n\n${DOSSIER_EXTRACTION_PROMPT}\n\nDOCUMENT:\n${text.substring(0, 10000)}`,
      }],
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e: any) {
    console.warn('[agent-files] AI extraction failed:', e.message);
  }
  return null;
}

/**
 * Use Claude Vision to extract dossier fields from PDF (base64) or images.
 * Supports: PDF documents, PNG, JPG images.
 */
async function extractDossierFromVision(buffer: Buffer, ext: string, fileName: string): Promise<Record<string, string> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const base64 = buffer.toString('base64');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let content: any[];

    if (ext === 'pdf') {
      content = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        },
        { type: 'text', text: `Fichier: "${fileName}"\n\n${DOSSIER_EXTRACTION_PROMPT}` },
      ];
    } else {
      // Image (png, jpg, jpeg)
      const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg';
      content = [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        { type: 'text', text: `Fichier: "${fileName}"\n\n${DOSSIER_EXTRACTION_PROMPT}\n\nExtrais toutes les informations visibles dans cette image (texte, logo, coordonnees, etc.).` },
      ];
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content }],
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e: any) {
    console.warn('[agent-files] Vision extraction failed:', e.message);
  }
  return null;
}
const BUCKET = 'business-assets';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return map[ext] || 'application/octet-stream';
}

function sanitizeFilename(name: string): string {
  // Keep extension, sanitize the rest
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-zA-Z0-9._-]/g, '_') // safe chars only
    .replace(/_+/g, '_')
    .substring(0, 200); // reasonable length limit
}

// ---------------------------------------------------------------------------
// POST — Upload a file for a specific agent
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const agentId = formData.get('agent_id') as string | null;

    if (!file || !agentId) {
      return NextResponse.json(
        { ok: false, error: 'Paramètres manquants: file et agent_id requis' },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mo)` },
        { status: 400 },
      );
    }

    // Validate extension
    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { ok: false, error: `Type de fichier non autorisé (.${ext}). Types acceptés: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}` },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const safeName = sanitizeFilename(file.name);
    const storagePath = `${user.id}/${agentId}/${safeName}`;

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: getMimeType(ext),
        upsert: true, // overwrite if same name
      });

    if (uploadError) {
      console.error('[agent-files] Upload error:', uploadError);
      return NextResponse.json(
        { ok: false, error: `Erreur d'upload: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const now = new Date().toISOString();

    // Try to save metadata to agent_files table (graceful if table doesn't exist)
    try {
      await supabase.from('agent_files').insert({
        user_id: user.id,
        agent_id: agentId,
        file_name: safeName,
        storage_path: storagePath,
        file_type: ext,
        file_size: file.size,
        file_url: urlData.publicUrl,
        created_at: now,
      });
    } catch {
      // Table may not exist yet — not critical
    }

    // ── Auto-extract dossier from ANY uploaded file ──
    let extracted: Record<string, string> | null = null;
    const textExts = new Set(['txt', 'csv', 'docx', 'pptx', 'xlsx', 'xls', 'doc', 'ppt']);
    const visionExts = new Set(['pdf', 'png', 'jpg', 'jpeg']);

    try {
      if (textExts.has(ext)) {
        // Text-based extraction (DOCX, XLSX, CSV, TXT, PPTX)
        console.log(`[agent-files] Starting text extraction for ${ext}: ${safeName} (${buffer.length} bytes)`);
        let text: string | null = null;
        try {
          text = await extractTextFromFile(buffer, ext);
        } catch (extractErr: any) {
          console.error(`[agent-files] extractTextFromFile crashed for ${ext}:`, extractErr.message);
        }
        console.log(`[agent-files] Text extraction result: ${text ? text.length + ' chars' : 'NULL'}`);

        // Fallback 1: if extraction failed, try crude string extraction from binary
        if (!text || text.length < 20) {
          console.warn(`[agent-files] Primary extraction failed, trying crude binary string extraction`);
          try {
            const raw = buffer.toString('utf-8').replace(/[^\x20-\x7E\xC0-\xFF\n]/g, ' ').replace(/\s+/g, ' ').trim();
            if (raw.length > 50) text = raw.substring(0, 15000);
          } catch {}
        }

        if (text && text.length > 20) {
          console.log(`[agent-files] Sending to AI for dossier extraction (${text.substring(0, 100)}...)`);
          extracted = await extractDossierFromText(text, file.name);
          console.log(`[agent-files] AI extraction result: ${extracted ? Object.keys(extracted).length + ' fields' : 'NULL'}`);
        } else {
          console.warn(`[agent-files] All text extraction failed for ${safeName}, trying vision`);
          // Fallback 2: vision for images only (DOCX can't be sent as vision)
          if (['png', 'jpg', 'jpeg'].includes(ext)) {
            extracted = await extractDossierFromVision(buffer, ext, file.name);
          }
        }
      } else if (visionExts.has(ext)) {
        // Vision-based extraction (PDF, images)
        console.log(`[agent-files] Using vision extraction for ${ext} file: ${safeName}`);
        extracted = await extractDossierFromVision(buffer, ext, file.name);
      }

      if (extracted && Object.keys(extracted).length > 0) {
        console.log(`[agent-files] AI extracted ${Object.keys(extracted).length} dossier fields:`, Object.keys(extracted).join(', '));
        const { upsertBusinessDossier } = await import('@/lib/agents/client-context');
        await upsertBusinessDossier(supabase, user.id, extracted);
        console.log(`[agent-files] Dossier auto-updated from file ${safeName}`);
      }
    } catch (e: any) {
      console.warn('[agent-files] Auto-extract error (non-fatal):', e.message);
    }

    return NextResponse.json({
      ok: true,
      file: {
        name: safeName,
        url: urlData.publicUrl,
        type: ext,
        size: file.size,
        uploaded_at: now,
      },
      ...(extracted ? { dossier_updated: true, fields_extracted: Object.keys(extracted) } : {}),
    });
  } catch (err: any) {
    console.error('[agent-files] POST error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Erreur interne' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET — List files for a specific agent
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
    }

    const agentId = req.nextUrl.searchParams.get('agent_id');
    if (!agentId) {
      return NextResponse.json(
        { ok: false, error: 'Paramètre agent_id requis' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const folderPath = `${user.id}/${agentId}`;

    const { data: storageFiles, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(folderPath, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

    if (listError) {
      console.error('[agent-files] List error:', listError);
      return NextResponse.json(
        { ok: false, error: `Erreur de listage: ${listError.message}` },
        { status: 500 },
      );
    }

    const files = (storageFiles || [])
      .filter((f) => f.name && f.name !== '.emptyFolderPlaceholder')
      .map((f) => {
        const ext = getFileExtension(f.name);
        const { data: urlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(`${folderPath}/${f.name}`);

        return {
          name: f.name,
          url: urlData.publicUrl,
          type: ext,
          size: f.metadata?.size ?? 0,
          uploaded_at: f.created_at ?? f.updated_at ?? null,
        };
      });

    return NextResponse.json({ ok: true, files });
  } catch (err: any) {
    console.error('[agent-files] GET error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Erreur interne' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Delete a file
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
    }

    const body = await req.json();
    const { agent_id: agentId, file_name: fileName } = body;

    if (!agentId || !fileName) {
      return NextResponse.json(
        { ok: false, error: 'Paramètres manquants: agent_id et file_name requis' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const storagePath = `${user.id}/${agentId}/${fileName}`;

    const { error: deleteError } = await supabase.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (deleteError) {
      console.error('[agent-files] Delete error:', deleteError);
      return NextResponse.json(
        { ok: false, error: `Erreur de suppression: ${deleteError.message}` },
        { status: 500 },
      );
    }

    // Try to remove metadata from agent_files table (graceful)
    try {
      await supabase
        .from('agent_files')
        .delete()
        .eq('user_id', user.id)
        .eq('agent_id', agentId)
        .eq('file_name', fileName);
    } catch {
      // Table may not exist yet — not critical
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[agent-files] DELETE error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Erreur interne' },
      { status: 500 },
    );
  }
}
