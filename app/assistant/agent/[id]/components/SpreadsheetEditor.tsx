'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * SpreadsheetEditor — Collaborative Excel-like editor with AI assistant.
 * User edits cells directly, asks Louis to calculate/modify via chat,
 * Louis returns updated grid in [GRID_UPDATE] tags which auto-applies.
 */

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function parseCsv(csv: string): string[][] {
  const lines = csv.trim().split('\n');
  return lines.map(line => {
    // Simple CSV parsing — handles quoted fields with commas
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function gridToCsv(grid: string[][]): string {
  return grid.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\n');
}

const DEFAULT_GRID: string[][] = [
  ['Element', 'Quantite', 'Prix unitaire', 'Total'],
  ['', '', '', ''],
  ['', '', '', ''],
  ['', '', '', ''],
];

export default function SpreadsheetEditor({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [grid, setGrid] = useState<string[][]>(DEFAULT_GRID);
  const [sheetName, setSheetName] = useState<string>('Tableau sans titre');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateCell = useCallback((row: number, col: number, value: string) => {
    setGrid(prev => {
      const newGrid = prev.map(r => [...r]);
      newGrid[row][col] = value;
      return newGrid;
    });
  }, []);

  const addRow = useCallback(() => {
    setGrid(prev => {
      const cols = prev[0]?.length || 4;
      return [...prev, Array(cols).fill('')];
    });
  }, []);

  const addColumn = useCallback(() => {
    setGrid(prev => prev.map(row => [...row, '']));
  }, []);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      try {
        const parsed = parseCsv(text);
        if (parsed.length > 0) setGrid(parsed);
        setSheetName(file.name.replace(/\.[^.]+$/, ''));
      } catch {}
    };
    reader.readAsText(file);
  }, []);

  const handleSave = useCallback(() => {
    const csv = gridToCsv(grid);
    const doc = {
      id: `xls_${Date.now()}`,
      name: sheetName,
      content: csv,
      type: 'excel' as const,
      folder: '',
      agentId,
      createdAt: new Date().toISOString(),
    };
    const key = `keiro_docs_${agentId}`;
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const idx = existing.findIndex((d: any) => d.name === sheetName);
      if (idx >= 0) existing[idx] = doc;
      else existing.unshift(doc);
      localStorage.setItem(key, JSON.stringify(existing));
      window.dispatchEvent(new CustomEvent('keiro-doc-saved', { detail: doc }));
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [grid, sheetName, agentId]);

  const handleDownload = useCallback(() => {
    const csv = gridToCsv(grid);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheetName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [grid, sheetName]);

  const sendMessage = useCallback(async () => {
    if (!chatInput.trim() || sending) return;
    const userMsg: ChatMsg = { id: `u_${Date.now()}`, role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setSending(true);

    try {
      const csv = gridToCsv(grid);
      const messageWithContext = `${chatInput}\n\n## TABLEAU ACTUEL :\n${csv}`;
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent: agentId, message: messageWithContext, history: chatMessages.slice(-6) }),
      });
      const data = await res.json();
      const reply = data.reply || data.message || 'Pas de reponse';

      // Check for [GRID_UPDATE] tags
      const gridMatch = reply.match(/\[GRID_UPDATE\]([\s\S]*?)\[\/GRID_UPDATE\]/);
      if (gridMatch) {
        const newCsv = gridMatch[1].trim();
        const newGrid = parseCsv(newCsv);
        if (newGrid.length > 0) setGrid(newGrid);
        const explanation = reply.split('[GRID_UPDATE]')[0].trim();
        setChatMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: explanation || 'Tableau mis a jour.' }]);
      } else {
        setChatMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: reply }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: 'Erreur de connexion. Reessaye.' }]);
    } finally {
      setSending(false);
    }
  }, [chatInput, sending, grid, agentId, chatMessages]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-280px)] min-h-[500px]">
      {/* Spreadsheet — 2 cols */}
      <div className="lg:col-span-2 flex flex-col bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/[0.02]">
          <input
            type="text"
            value={sheetName}
            onChange={e => setSheetName(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm font-medium focus:outline-none px-2 py-1 rounded hover:bg-white/5 focus:bg-white/5"
          />
          <button onClick={addRow} className="px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition" title="Ajouter une ligne">+ ligne</button>
          <button onClick={addColumn} className="px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition" title="Ajouter une colonne">+ col</button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={handleUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition" title="Importer un CSV">{'\u{1F4C2}'}</button>
          <button onClick={handleSave} className={`px-3 py-1 text-xs font-medium rounded transition ${saved ? 'bg-emerald-500/30 text-emerald-300' : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'}`}>
            {saved ? `${'\u2713'} Sauve` : `${'\u{1F4BE}'} Sauver`}
          </button>
          <button onClick={handleDownload} className="px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition" title="Telecharger CSV">{'\u2B07\uFE0F'}</button>
        </div>
        {/* Spreadsheet grid */}
        <div className="flex-1 overflow-auto p-3">
          <table className="border-collapse w-full">
            <tbody>
              {grid.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  <td className="text-[10px] text-white/30 px-1 py-0.5 text-center select-none w-8">{rowIdx + 1}</td>
                  {row.map((cell, colIdx) => (
                    <td key={colIdx} className="border border-white/10 p-0">
                      <input
                        type="text"
                        value={cell}
                        onChange={e => updateCell(rowIdx, colIdx, e.target.value)}
                        className={`w-full px-2 py-1.5 text-xs bg-transparent text-white/90 focus:bg-cyan-500/10 focus:outline-none ${rowIdx === 0 ? 'font-semibold text-white' : ''}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chat sidebar */}
      <div className="flex flex-col bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02]">
          <p className="text-xs font-semibold text-white">Demande a {agentName}</p>
          <p className="text-[10px] text-white/40">Il calcule et modifie en live</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chatMessages.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-xs">
              <p className="mb-2">Exemples :</p>
              <div className="space-y-1.5">
                {[
                  'Calcule les totaux de chaque ligne',
                  'Ajoute une colonne TVA 20%',
                  'Genere un inventaire restaurant complet',
                  'Cree un previsionnel mensuel sur 12 mois',
                ].map(ex => (
                  <button key={ex} onClick={() => setChatInput(ex)} className="block w-full text-[10px] text-white/40 hover:text-white/70 hover:bg-white/5 px-2 py-1.5 rounded transition text-left">
                    {`\u201C${ex}\u201D`}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chatMessages.map(msg => (
              <div key={msg.id} className={`text-xs ${msg.role === 'user' ? 'ml-4 text-right' : 'mr-4'}`}>
                <div className={`inline-block px-2.5 py-1.5 rounded-xl ${msg.role === 'user' ? 'bg-cyan-600/30 text-white' : 'bg-white/10 text-white/80'}`}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="text-xs text-white/40 italic">{agentName} calcule...</div>
          )}
        </div>
        <div className="border-t border-white/10 p-2 flex gap-1.5">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Que veux-tu calculer ?"
            disabled={sending}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !chatInput.trim()}
            className="px-3 py-1.5 bg-cyan-600 text-white text-xs font-bold rounded-lg hover:bg-cyan-700 transition disabled:opacity-30"
          >
            {'\u279C'}
          </button>
        </div>
      </div>
    </div>
  );
}
