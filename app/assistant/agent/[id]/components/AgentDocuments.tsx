'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * AgentDocuments — File manager for agent-generated documents.
 * Client can create folders, rename, delete, and download files.
 * Documents are saved to localStorage + API when generated from chat.
 */

interface DocFile {
  id: string;
  name: string;
  content: string;
  type: 'document' | 'excel' | 'report';
  folder: string;
  agentId: string;
  createdAt: string;
}

function getStorageKey(agentId: string) {
  return `keiro_docs_${agentId}`;
}

function loadDocs(agentId: string): DocFile[] {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey(agentId)) || '[]');
  } catch { return []; }
}

function saveDocs(agentId: string, docs: DocFile[]) {
  localStorage.setItem(getStorageKey(agentId), JSON.stringify(docs));
}

export default function AgentDocuments({ agentId, gradientFrom }: { agentId: string; gradientFrom: string }) {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>('Tous');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Load docs from localStorage
  useEffect(() => {
    const loaded = loadDocs(agentId);
    setDocs(loaded);
    const uniqueFolders = [...new Set(loaded.map(d => d.folder).filter(Boolean))];
    setFolders(uniqueFolders);
  }, [agentId]);

  // Listen for new documents from chat
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as DocFile;
      if (detail && detail.agentId === agentId) {
        setDocs(prev => {
          const updated = [detail, ...prev];
          saveDocs(agentId, updated);
          return updated;
        });
      }
    };
    window.addEventListener('keiro-doc-saved', handler);
    return () => window.removeEventListener('keiro-doc-saved', handler);
  }, [agentId]);

  const filteredDocs = activeFolder === 'Tous'
    ? docs
    : docs.filter(d => d.folder === activeFolder);

  const createFolder = useCallback(() => {
    if (!newFolderName.trim()) return;
    setFolders(prev => [...prev, newFolderName.trim()]);
    setNewFolderName('');
    setShowNewFolder(false);
  }, [newFolderName]);

  const moveToFolder = useCallback((docId: string, folder: string) => {
    setDocs(prev => {
      const updated = prev.map(d => d.id === docId ? { ...d, folder } : d);
      saveDocs(agentId, updated);
      return updated;
    });
  }, [agentId]);

  const deleteDoc = useCallback((docId: string) => {
    setDocs(prev => {
      const updated = prev.filter(d => d.id !== docId);
      saveDocs(agentId, updated);
      return updated;
    });
  }, [agentId]);

  const renameDoc = useCallback((docId: string, name: string) => {
    setDocs(prev => {
      const updated = prev.map(d => d.id === docId ? { ...d, name } : d);
      saveDocs(agentId, updated);
      return updated;
    });
    setRenaming(null);
  }, [agentId]);

  const downloadDoc = useCallback((doc: DocFile) => {
    const ext = doc.type === 'excel' ? 'csv' : 'md';
    const mime = doc.type === 'excel' ? 'text/csv' : 'text/markdown';
    const blob = new Blob([doc.content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const typeIcon = (type: string) => {
    if (type === 'excel') return '\u{1F4CA}';
    if (type === 'report') return '\u{1F4CB}';
    return '\u{1F4C4}';
  };

  return (
    <div className="space-y-4">
      {/* Folder bar */}
      <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide pb-1">
        <button
          onClick={() => setActiveFolder('Tous')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeFolder === 'Tous' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
        >
          {'\u{1F4C1}'} Tous ({docs.length})
        </button>
        {folders.map(f => (
          <button
            key={f}
            onClick={() => setActiveFolder(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeFolder === f ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
          >
            {'\u{1F4C2}'} {f} ({docs.filter(d => d.folder === f).length})
          </button>
        ))}
        {showNewFolder ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
              placeholder="Nom du dossier..."
              className="px-2 py-1 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder-white/30 w-32 focus:outline-none"
              autoFocus
            />
            <button onClick={createFolder} className="text-emerald-400 text-xs font-bold">{'\u2713'}</button>
            <button onClick={() => setShowNewFolder(false)} className="text-white/30 text-xs">{'\u2717'}</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewFolder(true)}
            className="px-2 py-1.5 rounded-lg text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition"
          >
            + Dossier
          </button>
        )}
      </div>

      {/* Document list */}
      {filteredDocs.length === 0 ? (
        <div className="text-center py-12 text-white/20">
          <div className="text-3xl mb-3">{'\u{1F4C1}'}</div>
          <p className="text-sm">Aucun document</p>
          <p className="text-xs text-white/15 mt-1">Les documents generes dans le chat apparaitront ici</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.06] transition group">
              <span className="text-lg">{typeIcon(doc.type)}</span>
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
                <p className="text-[10px] text-white/30">
                  {new Date(doc.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {doc.folder && <span> · {doc.folder}</span>}
                </p>
              </div>
              {/* Actions — visible on hover */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => downloadDoc(doc)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white/80 transition" title="Telecharger">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
                <button onClick={() => { setRenaming(doc.id); setRenameValue(doc.name); }} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white/80 transition" title="Renommer">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                {folders.length > 0 && (
                  <select
                    onChange={e => moveToFolder(doc.id, e.target.value)}
                    value={doc.folder || ''}
                    className="bg-white/10 border border-white/10 rounded text-[9px] text-white/50 px-1 py-0.5 cursor-pointer"
                    title="Deplacer"
                  >
                    <option value="">Sans dossier</option>
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
