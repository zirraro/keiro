import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'xlsx', 'xls', 'csv', 'txt', 'doc', 'docx',
  'png', 'jpg', 'jpeg',
]);
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

    return NextResponse.json({
      ok: true,
      file: {
        name: safeName,
        url: urlData.publicUrl,
        type: ext,
        size: file.size,
        uploaded_at: now,
      },
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
