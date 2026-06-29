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
  // Original file binary — kept for "download original" option
  const originalFileBufferRef = useRef<ArrayBuffer | null>(null);

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
        originalFileBufferRef.current = null;
      } else if (ext === 'pdf') {
        // PDF — extract text via pdfjs, keep original buffer
        const arrayBuffer = await file.arrayBuffer();
        // Keep a copy of the original PDF for download
        originalFileBufferRef.current = arrayBuffer.slice(0);
        const pdfjs: any = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
        const pdf = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
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
        // DOCX — extract text via mammoth, keep original buffer
        const arrayBuffer = await file.arrayBuffer();
        originalFileBufferRef.current = arrayBuffer.slice(0);
        const mammoth: any = await import('mammoth');
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer.slice(0) });
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

  const handleDownload = useCallback(async (format?: DocFormat | 'original') => {
    const fmt = format || originalFormat || 'md';
    try {
      // Special: download original file untouched
      if (fmt === 'original' && originalFileBufferRef.current) {
        const mime = originalFormat === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const blob = new Blob([originalFileBufferRef.current], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docName}-original.${originalFormat}`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

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

        // Branding client : logo + couleur de marque (récupérés depuis /api/brand).
        let brand: any = {};
        try { const r = await fetch('/api/brand', { credentials: 'include' }); const d = await r.json(); brand = d.brand || d || {}; } catch {}
        const hexToRgb = (h: string) => { const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h || ''); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 12, g: 26, b: 58 }; };
        const c = hexToRgb(brand.primary_color || '#0c1a3a');

        // Bandeau couleur de marque en haut.
        doc.setFillColor(c.r, c.g, c.b); doc.rect(0, 0, 210, 4, 'F');
        let y = 18;
        // Logo client (si dispo).
        if (brand.logo_url) {
          try {
            const img = await new Promise<{ data: string; fmt: string; w: number; h: number } | null>((resolve) => {
              const image = new Image(); image.crossOrigin = 'anonymous';
              image.onload = () => { try { const cv = document.createElement('canvas'); cv.width = image.naturalWidth; cv.height = image.naturalHeight; cv.getContext('2d')!.drawImage(image, 0, 0); resolve({ data: cv.toDataURL('image/png'), fmt: 'PNG', w: image.naturalWidth, h: image.naturalHeight }); } catch { resolve(null); } };
              image.onerror = () => resolve(null); image.src = brand.logo_url;
            });
            if (img) { const w = 26; doc.addImage(img.data, img.fmt, 15, 8, w, w * (img.h / img.w)); y = 8 + w * (img.h / img.w) + 6; }
          } catch {}
        }
        // Titre.
        doc.setTextColor(c.r, c.g, c.b); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        for (const t of doc.splitTextToSize(docName, 180)) { doc.text(t, 15, y); y += 8; }
        doc.setDrawColor(c.r, c.g, c.b); doc.line(15, y - 2, 195, y - 2); y += 6;

        // Corps avec rendu markdown (titres en couleur de marque, gras).
        for (const raw of content.split('\n')) {
          if (y > 280) { doc.addPage(); y = 20; }
          let line = raw; let size = 11; let bold = false; let col = { r: 30, g: 30, b: 30 };
          if (line.startsWith('### ')) { line = line.slice(4); size = 12; bold = true; col = c; }
          else if (line.startsWith('## ')) { line = line.slice(3); size = 14; bold = true; col = c; }
          else if (line.startsWith('# ')) { line = line.slice(2); size = 15; bold = true; col = c; }
          else if (/^(\*\*\*|---|___)\s*$/.test(line.trim())) { doc.setDrawColor(220, 220, 220); doc.line(15, y, 195, y); y += 5; continue; }
          line = line.replace(/\*\*/g, '').replace(/[*_>`]/g, '');
          doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(col.r, col.g, col.b);
          for (const w of doc.splitTextToSize(line || ' ', 180)) { if (y > 282) { doc.addPage(); y = 20; } doc.text(w, 15, y); y += size * 0.55 + 1.5; }
        }
        // Pied de page.
        doc.setFontSize(8); doc.setTextColor(160, 160, 160);
        doc.text(`${brand.name || docName}`, 15, 290);
        doc.save(`${docName}.pdf`);
      } else if (fmt === 'docx') {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
        // Parse simple markdown headings into Word headings
        const paragraphs = content.split('\n').map(line => {
          if (line.startsWith('# ')) {
            return new Paragraph({ children: [new TextRun({ text: line.slice(2), bold: true, size: 32 })], heading: HeadingLevel.HEADING_1 });
          } else if (line.startsWith('## ')) {
            return new Paragraph({ children: [new TextRun({ text: line.slice(3), bold: true, size: 28 })], heading: HeadingLevel.HEADING_2 });
          } else if (line.startsWith('### ')) {
            return new Paragraph({ children: [new TextRun({ text: line.slice(4), bold: true, size: 24 })], heading: HeadingLevel.HEADING_3 });
          }
          // Bold detection: **text**
          const parts = line.split(/(\*\*[^*]+\*\*)/g);
          const runs = parts.filter(p => p).map(p => {
            if (p.startsWith('**') && p.endsWith('**')) {
              return new TextRun({ text: p.slice(2, -2), bold: true });
            }
            return new TextRun({ text: p });
          });
          return new Paragraph({ children: runs });
        });
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[400px] lg:h-[calc(100vh-280px)]">
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
            <span className="text-[10px] text-white/30 uppercase">{originalFormat}</span>
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
            <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition z-50 min-w-[160px]">
              <button onClick={() => handleDownload('md')} className="block w-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 text-left">Markdown (.md)</button>
              <button onClick={() => handleDownload('pdf')} className="block w-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 text-left">PDF (.pdf)</button>
              <button onClick={() => handleDownload('docx')} className="block w-full px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 text-left">Word (.docx)</button>
              {originalFileBufferRef.current && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <button onClick={() => handleDownload('original')} className="block w-full px-3 py-1.5 text-xs text-amber-400 hover:bg-white/10 text-left">{`${'\u{1F4C3}'} Original intact`}</button>
                </>
              )}
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
