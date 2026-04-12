import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET /api/agents/documents?agent_id=xxx
 * List all documents for a client's agent, organized by folder.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get('agent_id');
  const supabase = getSupabase();

  const query = supabase
    .from('agent_documents')
    .select('id, name, type, folder, agent_id, file_url, file_size, mime_type, source, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (agentId) query.eq('agent_id', agentId);

  const { data: docs, error: dbError } = await query.limit(500);

  if (dbError) {
    // Table might not exist yet — return empty
    console.error('[Documents] Query error:', dbError.message);
    return NextResponse.json({ ok: true, documents: [], folders: [] });
  }

  // Extract unique folders
  const folders = [...new Set((docs || []).map(d => d.folder).filter(Boolean))].sort();

  return NextResponse.json({ ok: true, documents: docs || [], folders });
}

/**
 * POST /api/agents/documents
 * Upload a file or create a document entry.
 * Supports: file upload (multipart) or text document (JSON body)
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const contentType = req.headers.get('content-type') || '';
  const supabase = getSupabase();

  if (contentType.includes('multipart/form-data')) {
    // File upload
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const agentId = formData.get('agent_id') as string || 'general';
    const folder = formData.get('folder') as string || '';
    const docName = formData.get('name') as string || file?.name || 'Document';

    if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Fichier trop lourd (max 10MB)' }, { status: 400 });

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `${user.id}/${agentId}/${Date.now()}_${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('business-assets')
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error('[Documents] Upload error:', uploadError.message);
      return NextResponse.json({ error: 'Erreur upload: ' + uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('business-assets').getPublicUrl(path);
    const fileUrl = urlData?.publicUrl || '';

    // Detect type
    const docType = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image'
      : ['pdf'].includes(ext) ? 'pdf'
      : ['xlsx', 'xls', 'csv'].includes(ext) ? 'excel'
      : ['doc', 'docx'].includes(ext) ? 'document'
      : 'other';

    // Save metadata to DB
    const { data: doc, error: insertError } = await supabase.from('agent_documents').insert({
      user_id: user.id,
      agent_id: agentId,
      name: docName,
      type: docType,
      folder,
      file_url: fileUrl,
      file_size: file.size,
      mime_type: file.type,
      source: 'upload',
    }).select().single();

    if (insertError) {
      console.error('[Documents] Insert error:', insertError.message);
      return NextResponse.json({ error: 'Erreur sauvegarde: ' + insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, document: doc });
  } else {
    // JSON body — text document (from chat [DOCUMENT_READY] or [EXCEL_READY])
    const body = await req.json();
    const { agent_id, name, content, type, folder } = body;

    if (!name || !content) return NextResponse.json({ error: 'name et content requis' }, { status: 400 });

    // Upload content as file to Supabase Storage
    const ext = type === 'excel' ? 'csv' : 'md';
    const mime = type === 'excel' ? 'text/csv' : 'text/markdown';
    const path = `${user.id}/${agent_id || 'general'}/${Date.now()}_${name}.${ext}`;
    const buffer = Buffer.from(content, 'utf-8');

    await supabase.storage.from('business-assets').upload(path, buffer, { contentType: mime, upsert: false });
    const { data: urlData } = supabase.storage.from('business-assets').getPublicUrl(path);

    const { data: doc, error: insertError } = await supabase.from('agent_documents').insert({
      user_id: user.id,
      agent_id: agent_id || 'general',
      name,
      type: type || 'document',
      folder: folder || '',
      file_url: urlData?.publicUrl || '',
      file_size: buffer.length,
      mime_type: mime,
      source: 'agent_chat',
    }).select().single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, document: doc });
  }
}

/**
 * PATCH /api/agents/documents
 * Update document: rename, move to folder, etc.
 */
export async function PATCH(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const body = await req.json();
  const { id, name, folder } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const supabase = getSupabase();
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = name;
  if (folder !== undefined) update.folder = folder;

  await supabase.from('agent_documents').update(update).eq('id', id).eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/agents/documents
 * Delete a document.
 */
export async function DELETE(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const supabase = getSupabase();

  // Get file URL to delete from storage
  const { data: doc } = await supabase.from('agent_documents').select('file_url').eq('id', id).eq('user_id', user.id).single();
  if (doc?.file_url) {
    const path = doc.file_url.split('/business-assets/')[1];
    if (path) await supabase.storage.from('business-assets').remove([path]);
  }

  await supabase.from('agent_documents').delete().eq('id', id).eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
