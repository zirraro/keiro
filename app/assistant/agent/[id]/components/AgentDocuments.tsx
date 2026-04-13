'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * AgentDocuments — Real file manager for agent workspace.
 * Stored in Supabase (not localStorage). Supports:
 * - Upload files (images, PDF, DOCX, Excel, CSV)
 * - Create/rename/delete folders
 * - Move files between folders
 * - Download files
 * - Auto-save documents from agent chat
 */

interface DocFile {
  id: string;
  name: string;
  type: string;
  folder: string;
  agent_id: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  source: string;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  image: '\u{1F5BC}\uFE0F',
  pdf: '\u{1F4C4}',
  document: '\u{1F4DD}',
  excel: '\u{1F4CA}',
  other: '\u{1F4CE}',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function AgentDocuments({ agentId, gradientFrom }: { agentId: string; gradientFrom: string }) {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load documents from API
  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/documents?agent_id=${agentId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents || []);
        setFolders(data.folders || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Listen for new docs from chat
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.agentId === agentId && detail?.content) {
        // Save to API instead of localStorage
        try {
          await fetch('/api/agents/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              agent_id: agentId,
              name: detail.name || `Document ${new Date().toLocaleDateString('fr-FR')}`,
              content: detail.content,
              type: detail.type || 'document',
              folder: detail.folder || '',
            }),
          });
          loadDocs(); // Refresh
        } catch {}
      }
    };
    window.addEventListener('keiro-doc-saved', handler);
    return () => window.removeEventListener('keiro-doc-saved', handler);
  }, [agentId, loadDocs]);

  const filteredDocs = activeFolder === ''
    ? docs
    : docs.filter(d => d.folder === activeFolder);

  // Upload file
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('agent_id', agentId);
        formData.append('folder', activeFolder);
        formData.append('name', file.name.replace(/\.[^.]+$/, ''));

        await fetch('/api/agents/documents', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
      } catch {}
    }

    setUploading(false);
    loadDocs();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [agentId, activeFolder, loadDocs]);

  // Create folder
  const createFolder = useCallback(() => {
    if (!newFolderName.trim()) return;
    setFolders(prev => [...new Set([...prev, newFolderName.trim()])]);
    setActiveFolder(newFolderName.trim());
    setNewFolderName('');
    setShowNewFolder(false);
  }, [newFolderName]);

  // Move to folder
  const moveToFolder = useCallback(async (docId: string, folder: string) => {
    try {
      await fetch('/api/agents/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: docId, folder }),
      });
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, folder } : d));
    } catch {}
  }, []);

  // Rename
  const renameDoc = useCallback(async (docId: string, name: string) => {
    try {
      await fetch('/api/agents/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: docId, name }),
      });
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, name } : d));
    } catch {}
    setRenaming(null);
  }, []);

  // Delete
  const deleteDoc = useCallback(async (docId: string) => {
    try {
      await fetch('/api/agents/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: docId }),
      });
      setDocs(prev => prev.filter(d => d.id !== docId));
    } catch {}
  }, []);

  // Drop handler for drag & drop
  const handleDrop = useCallback((e: React.DragEvent, targetFolder: string) => {
    e.preventDefault();
    const docId = e.dataTransfer.getData('doc-id');
    if (docId) moveToFolder(docId, targetFolder);
  }, [moveToFolder]);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.png,.jpg,.jpeg,.gif" onChange={handleUpload} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {uploading ? (
            <><div className="animate-spin rounded-full h-3 w-3 border-b border-white" /> Upload...</>
          ) : (
            <>{'\u2B06\uFE0F'} Importer des fichiers</>
          )}
        </button>
        {showNewFolder ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
              placeholder="Nom du dossier..."
              className="px-2.5 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder-white/30 w-36 focus:outline-none"
              autoFocus
            />
            <button onClick={createFolder} className="text-emerald-400 text-sm font-bold px-1">{'\u2713'}</button>
            <button onClick={() => setShowNewFolder(false)} className="text-white/30 text-sm px-1">{'\u2717'}</button>
          </div>
        ) : (
          <button onClick={() => setShowNewFolder(true)} className="px-3 py-2 bg-white/10 text-white/70 text-xs rounded-xl hover:bg-white/15 transition">
            {'\u{1F4C1}'} Nouveau dossier
          </button>
        )}
        <span className="text-[10px] text-white/30 ml-auto">{docs.length} fichier{docs.length > 1 ? 's' : ''}</span>
      </div>

      {/* Folder tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-hide pb-1">
        <button
          onClick={() => setActiveFolder('')}
          onDragOver={e => e.preventDefault()}
          onDrop={e => handleDrop(e, '')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${activeFolder === '' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
        >
          Tous ({docs.length})
        </button>
        {folders.map(f => (
          <button
            key={f}
            onClick={() => setActiveFolder(f)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop(e, f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${activeFolder === f ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
          >
            {'\u{1F4C2}'} {f} ({docs.filter(d => d.folder === f).length})
          </button>
        ))}
      </div>

      {/* File list */}
      {filteredDocs.length === 0 ? (
        <div
          className="border-2 border-dashed border-white/10 rounded-2xl p-12 text-center cursor-pointer hover:border-white/20 transition"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-cyan-500/50'); }}
          onDragLeave={e => e.currentTarget.classList.remove('border-cyan-500/50')}
          onDrop={e => {
            e.preventDefault();
            e.currentTarget.classList.remove('border-cyan-500/50');
            const dt = e.dataTransfer;
            if (dt.files.length > 0) {
              // Direct file drop from desktop
              const fakeInput = { target: { files: dt.files } } as any;
              handleUpload(fakeInput);
            }
          }}
        >
          <div className="text-3xl mb-3">{'\u{1F4C1}'}</div>
          <p className="text-sm text-white/40">Glisse tes fichiers ici ou clique pour importer</p>
          <p className="text-xs text-white/20 mt-1">PDF, Word, Excel, images, CSV...</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredDocs.map(doc => (
            <div
              key={doc.id}
              draggable
              onDragStart={e => e.dataTransfer.setData('doc-id', doc.id)}
              className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.06] transition group cursor-grab active:cursor-grabbing"
            >
              {/* Preview thumbnail for images */}
              {doc.type === 'image' && doc.file_url ? (
                <img src={doc.file_url} alt={doc.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="text-lg shrink-0 w-10 text-center">{TYPE_ICONS[doc.type] || TYPE_ICONS.other}</span>
              )}

              <div className="flex-1 min-w-0">
                {renaming === doc.id ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameDoc(doc.id, renameValue); if (e.key === 'Escape') setRenaming(null); }}
                    onBlur={() => renameDoc(doc.id, renameValue)}
                    className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs text-white w-full focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <p className="text-sm text-white/80 font-medium truncate">{doc.name}</p>
                )}
                <div className="flex items-center gap-2 text-[10px] text-white/30">
                  <span>{new Date(doc.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                  {doc.file_size > 0 && <span>{formatSize(doc.file_size)}</span>}
                  {doc.source === 'agent_chat' && <span className="text-cyan-400/50">via chat</span>}
                  {doc.folder && <span>{'\u{1F4C2}'} {doc.folder}</span>}
                </div>
              </div>

              {/* Actions — always visible on mobile, hover on desktop */}
              <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition">
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" download={doc.name} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white/80 transition" title="Telecharger">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </a>
                )}
                <button onClick={() => { setRenaming(doc.id); setRenameValue(doc.name); }} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white/80 transition" title="Renommer">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                {folders.length > 0 && (
                  <select
                    onChange={e => moveToFolder(doc.id, e.target.value)}
                    value={doc.folder || ''}
                    className="bg-white/10 border border-white/10 rounded text-[9px] text-white/50 px-1 py-0.5 cursor-pointer max-w-[80px]"
                    title="Deplacer vers dossier"
                  >
                    <option value="">Racine</option>
                    {folders.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
                <button onClick={() => deleteDoc(doc.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-400 transition" title="Supprimer">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
