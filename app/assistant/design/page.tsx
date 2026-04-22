'use client';

import { useEffect, useState } from 'react';

type Template = {
  id: string;
  name: string;
  category: string;
  palette: string[];
  notes: string | null;
  source: string;
  created_at: string;
};

/**
 * Templates page.
 *
 * Primary flow: "Générer mes templates" — KeiroAI reads the client's
 * uploads (logo, brand guide PDF, product photos…) + business dossier
 * and produces 5 production-grade HTML templates via Claude Sonnet.
 * These are stored in design_templates and referenced by Jade whenever
 * she generates a visual for this client.
 *
 * Secondary flow: paste HTML exported from Claude Design (power users
 * who've already built something custom there).
 */
export default function DesignImportPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Import form
  const [html, setHtml] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('landing');
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    try {
      const r = await fetch('/api/design/handoff', { credentials: 'include' });
      const j = await r.json();
      if (j.ok) setTemplates(j.templates || []);
    } catch {}
  };
  useEffect(() => { refresh(); }, []);

  const runAutoGen = async () => {
    if (generating) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const r = await fetch('/api/design/auto-generate', {
        method: 'POST',
        credentials: 'include',
      });
      const j = await r.json();
      if (!j.ok) {
        setGenResult(`Erreur : ${j.error || 'inconnue'}`);
      } else if ((j as any).warning === 'insufficient_brand_context') {
        setGenResult('Pas assez de contexte brand pour générer. Uploade ton logo ou ton guide de marque dans un agent d\u2019abord, puis relance.');
      } else {
        setGenResult(`${j.generated} templates générés, ${j.failed} échoués. Jade les utilisera pour tes prochains visuels.`);
        refresh();
      }
    } catch (e: any) {
      setGenResult(`Erreur : ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const importHtml = async () => {
    if (!html.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/design/handoff', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: html.trim(), name: name.trim() || undefined, category }),
      });
      const j = await r.json();
      if (j.ok) {
        setHtml('');
        setName('');
        setShowImport(false);
        refresh();
      } else {
        alert(j.error || 'Erreur import');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Supprimer ce template ?')) return;
    try {
      await fetch(`/api/design/template/${id}`, { method: 'DELETE', credentials: 'include' });
      refresh();
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#060b18] text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Templates brand</h1>
          <p className="text-white/50 text-sm mt-1">
            Templates HTML utilisés par Jade comme référence visuelle pour chaque création.
            Génère-les automatiquement depuis tes uploads, ou importe du HTML externe.
          </p>
        </div>

        {/* Primary action: auto-generate */}
        <div className="rounded-2xl bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-500/30 p-6 mb-6">
          <h2 className="text-lg font-bold mb-2">Générer mes templates depuis mes uploads</h2>
          <p className="text-sm text-white/70 mb-4">
            KeiroAI analyse ton logo, tes photos, ton guide de marque + ton dossier business,
            puis crée 5 templates production-ready en HTML (post Instagram, story, hero landing,
            header email, case study). Jade les référence ensuite à chaque visuel généré.
          </p>
          <button
            onClick={runAutoGen}
            disabled={generating}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition"
          >
            {generating ? 'Génération en cours… (1-2 min)' : '\u2728 Générer mes templates'}
          </button>
          {genResult && (
            <p className="mt-3 text-sm text-white/80">{genResult}</p>
          )}
        </div>

        {/* Secondary: manual Claude Design import */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Import manuel depuis Claude Design</h3>
              <p className="text-[11px] text-white/50 mt-0.5">
                Tu as déjà un design externe dans <a href="https://claude.ai/design" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300">claude.ai/design</a> ou ailleurs ? Colle son HTML.
              </p>
            </div>
            <button
              onClick={() => setShowImport(!showImport)}
              className="text-xs text-purple-400 hover:text-purple-300"
            >
              {showImport ? 'Fermer' : 'Importer'}
            </button>
          </div>

          {showImport && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nom du template"
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm placeholder-white/30 focus:outline-none focus:border-purple-500"
                />
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="landing" className="bg-[#060b18]">Landing</option>
                  <option value="social" className="bg-[#060b18]">Social</option>
                  <option value="email" className="bg-[#060b18]">Email</option>
                  <option value="onepager" className="bg-[#060b18]">One-pager</option>
                  <option value="deck" className="bg-[#060b18]">Slide</option>
                  <option value="general" className="bg-[#060b18]">Autre</option>
                </select>
              </div>
              <textarea
                value={html}
                onChange={e => setHtml(e.target.value)}
                rows={8}
                placeholder="<section>…</section>"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-mono placeholder-white/30 focus:outline-none focus:border-purple-500 resize-y"
              />
              <button
                onClick={importHtml}
                disabled={submitting || !html.trim()}
                className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium disabled:opacity-40 transition"
              >
                {submitting ? 'Import…' : 'Importer ce template'}
              </button>
            </div>
          )}
        </div>

        {/* Templates grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Tes templates ({templates.length})</h2>
            <button onClick={refresh} className="text-xs text-white/60 hover:text-white">\u21BB Rafraîchir</button>
          </div>
          {templates.length === 0 && (
            <p className="text-white/40 text-sm text-center py-8 border border-dashed border-white/10 rounded-xl">
              Aucun template pour l\u2019instant. Clique sur "Générer mes templates" au-dessus.
            </p>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map(t => (
              <div key={t.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden group">
                {/* Live iframe preview — sandboxed so nothing escapes */}
                <div className="relative aspect-[16/10] bg-white overflow-hidden">
                  <iframe
                    src={`/api/design/template/${t.id}?format=html`}
                    className="w-full h-full border-0 origin-top-left scale-[0.5] pointer-events-none"
                    style={{ width: '200%', height: '200%' }}
                    sandbox="allow-same-origin"
                    title={t.name}
                  />
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${t.source === 'auto_generated' ? 'bg-purple-500/80 text-white' : 'bg-blue-500/80 text-white'}`}>
                      {t.source === 'auto_generated' ? 'Auto' : 'Import'}
                    </span>
                  </div>
                </div>

                <div className="p-3">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                      <p className="text-[10px] text-white/50 capitalize">{t.category}</p>
                    </div>
                  </div>
                  {t.palette.length > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      {t.palette.slice(0, 5).map((c, i) => (
                        <span key={i} className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewId(previewId === t.id ? null : t.id)}
                      className="flex-1 py-1.5 text-[11px] bg-white/5 hover:bg-white/10 rounded-lg transition"
                    >
                      {previewId === t.id ? 'Fermer' : 'Plein écran'}
                    </button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="py-1.5 px-2.5 text-[11px] bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fullscreen preview modal */}
      {previewId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewId(null)}>
          <div className="relative w-full max-w-6xl h-[80vh] bg-white rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewId(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
            >
              ×
            </button>
            <iframe
              src={`/api/design/template/${previewId}?format=html`}
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
              title="Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
