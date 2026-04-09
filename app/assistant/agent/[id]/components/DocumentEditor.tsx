'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * DocumentEditor — Collaborative document editor with AI assistant.
 * Supports import: .md, .txt, .pdf, .docx
 * Export: .md, .pdf, .docx
 * AI agent (Sara) can modify the document via [DOC_UPDATE] tags.
 */

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

type DocFormat = 'md' | 'pdf' | 'docx' | 'txt';

export default function DocumentEditor({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [content, setContent] = useState<string>('# Nouveau document\n\nEcris ici ou demande a ' + agentName + ' de generer un document...');
  const [docName, setDocName] = useState<string>('Document sans titre');
  const [originalFormat, setOriginalFormat] = useState<DocFormat>('md');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const ext = file.name.split('.').pop()?.toLowerCase() as DocFormat;
    const cleanName = file.name.replace(/\.[^.]+$/, '');

    try {
      if (ext === 'md' || ext === 'txt') {
        // Plain text
        const text = await file.text();
        setContent(text);
        setOriginalFormat(ext);
      } else if (ext === 'pdf') {
        // PDF — extract text via pdfjs
        const pdfjs: any = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n';
        }
        setContent(fullText.trim());
        setOriginalFormat('pdf');
      } else if (ext === 'docx') {
        // DOCX — extract text via mammoth
        const mammoth: any = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setContent(result.value);
        setOriginalFormat('docx');
      } else {
        alert('Format non supporte. Utilise .md, .txt, .pdf ou .docx');
        setImporting(false);
        return;
      }
      setDocName(cleanName);
    } catch (err: any) {
      alert('Erreur lors de l\'import : ' + (err?.message || 'inconnue'));
    } finally {
      setImporting(false);
    }
  }, []);

  const handleSave = useCallback(() => {
    const doc = {
      id: `doc_${Date.now()}`,
      name: docName,
      content,
      type: 'document' as const,
      folder: '',
      agentId,
      createdAt: new Date().toISOString(),
    };
    const key = `keiro_docs_${agentId}`;
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const idx = existing.findIndex((d: any) => d.name === docName);
      if (idx >= 0) existing[idx] = doc;
      else existing.unshift(doc);
      localStorage.setItem(key, JSON.stringify(existing));
      window.dispatchEvent(new CustomEvent('keiro-doc-saved', { detail: doc }));
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [content, docName, agentId]);

  const handleDownload = useCallback(async (format?: DocFormat) => {
    const fmt = format || originalFormat || 'md';
    try {
      if (fmt === 'md' || fmt === 'txt') {
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docName}.${fmt}`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (fmt === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        const lines = doc.splitTextToSize(content, 180);
        let y = 20;
        for (const line of lines) {
          if (y > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, 15, y);
          y += 6;
        }
        doc.save(`${docName}.pdf`);
      } else if (fmt === 'docx') {
        const { Document, Packer, Paragraph, TextRun } = await import('docx');
        const paragraphs = content.split('\n').map(line =>
          new Paragraph({ children: [new TextRun(line)] })
        );
        const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docName}.docx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert('Erreur export : ' + (err?.message || 'inconnue'));
    }
  }, [content, docName, originalFormat]);

  const sendMessage = useCallback(async () => {
    if (!chatInput.trim() || sending) return;
    const userMsg: ChatMsg = { id: `u_${Date.now()}`, role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setSending(true);

    try {
      const messageWithContext = `${chatInput}\n\n## DOCUMENT ACTUEL :\n${content}`;
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent: agentId, message: messageWithContext, history: chatMessages.slice(-6) }),
      });
      const data = await res.json();
      const reply = data.reply || data.message || 'Pas de reponse';

      const docMatch = reply.match(/\[DOC_UPDATE\]([\s\S]*?)\[\/DOC_UPDATE\]/);
      if (docMatch) {
        setContent(docMatch[1].trim());
        const explanation = reply.split('[DOC_UPDATE]')[0].trim();
        setChatMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: explanation || 'Document mis a jour.' }]);
      } else {
        setChatMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: reply }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: 'Erreur de connexion. Reessaye.' }]);
    } finally {
      setSending(false);
    }
  }, [chatInput, sending, content, agentId, chatMessages]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-280px)] min-h-[500px]">
      {/* Editor */}
      <div className="lg:col-span-2 flex flex-col bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-white/[0.02] flex-wrap">
          <input
            type="text"
            value={docName}
            onChange={e => setDocName(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-white text-sm font-medium focus:outline-none px-2 py-1 rounded hover:bg-white/5 focus:bg-white/5"
          />
          {originalFormat && (
            <span className="text-[9px] text-white/30 uppercase">{originalFormat}</span>
          )}
          <input ref={fileInputRef} type="file" accept=".md,.txt,.pdf,.docx" onChange={handleUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition disabled:opacity-50">
            {importing ? '...' : `${'\u{1F4C2}'} Importer`}
          </button>
          <button onClick={handleSave} className={`px-3 py-1 text-xs font-medium rounded transition ${saved ? 'bg-emerald-500/30 text-emerald-300' : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'}`}>
            {saved ? `${'\u2713'} Sauve` : `${'\u{1F4BE}'} Sauver`}
          </button>
          <div className="relative group">
            <button className="px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition">
              {'\u2B07\uFE0F'} Export
            </button>
            <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition z-50 min-w-[100px]">
              <button onClick={() => handleDownload('md')} className="block w-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 text-left">Markdown (.md)</button>
              <button onClick={() => handleDownload('pdf')} className="block w-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 text-left">PDF (.pdf)</button>
              <button onClick={() => handleDownload('docx')} className="block w-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 text-left">Word (.docx)</button>
            </div>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 bg-transparent text-white/90 text-sm p-4 font-mono leading-relaxed resize-none focus:outline-none whitespace-pre-wrap"
          spellCheck={false}
        />
      </div>

      {/* Chat sidebar */}
      <div className="flex flex-col bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02]">
          <p className="text-xs font-semibold text-white">Demande a {agentName}</p>
          <p className="text-[10px] text-white/40">Elle modifie ton document en live</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chatMessages.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-xs">
              <p className="mb-2">Exemples :</p>
              <div className="space-y-1.5">
                {[
                  'Genere un contrat CDI complet',
                  'Ajoute une clause de non-concurrence',
                  'Reformule l\'article 3 plus simplement',
                  'Verifie la conformite RGPD',
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
                <div className={`inline-block px-2.5 py-1.5 rounded-xl ${msg.role === 'user' ? 'bg-purple-600/30 text-white' : 'bg-white/10 text-white/80'}`}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="text-xs text-white/40 italic">{agentName} reflechit...</div>
          )}
        </div>
        <div className="border-t border-white/10 p-2 flex gap-1.5">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Que veux-tu modifier ?"
            disabled={sending}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !chatInput.trim()}
            className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition disabled:opacity-30"
          >
            {'\u279C'}
          </button>
        </div>
      </div>
    </div>
  );
}
