'use client';

import { useEffect, useState } from 'react';

type Template = {
  id: string;
  name: string;
  category: string;
  palette: string[];
  notes: string | null;
  created_at: string;
};

/**
 * "Import from Claude Design" page.
 *
 * Workflow: the user designs a landing page / social template / onboarding
 * card in Claude Design (claude.ai/design), exports as standalone HTML,
 * then drops the HTML into this page. It's stored in design_templates and
 * surfaced to Lena / Clara / Marketing agents as a brand reference.
 *
 * No drag-and-drop yet — plain textarea paste to keep the integration
 * honest (Claude Design doesn't have a webhook / push API).
 */
export default function DesignImportPage() {
  const [html, setHtml] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('landing');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; palette?: string[] } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  const refresh = async () => {
    try {
      const r = await fetch('/api/design/handoff', { credentials: 'include' });
      const j = await r.json();
      if (j.ok) setTemplates(j.templates || []);
    } catch {}
  };

  useEffect(() => { refresh(); }, []);

  const submit = async () => {
    if (!html.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetch('/api/design/handoff', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: html.trim(),
          name: name.trim() || undefined,
          category,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        setResult({ ok: true, msg: j.message || 'Template importé.', palette: j.palette });
        setHtml('');
        setName('');
        setNotes('');
        refresh();
      } else {
        setResult({ ok: false, msg: j.error || 'Erreur inconnue' });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060b18] text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Import depuis Claude Design</h1>
          <p className="text-white/50 text-sm mt-1">
            Design un template dans <a href="https://claude.ai/design" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300 underline">claude.ai/design</a>,
            exporte en HTML standalone, puis colle le contenu ici. Lena, Clara et Ami
            utiliseront ce template comme référence brand pour tes prochains contenus.
          </p>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Nom</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Landing v2 hero"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm placeholder-white/30 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Catégorie</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="landing" className="bg-[#060b18]">Landing page</option>
                <option value="social" className="bg-[#060b18]">Template social</option>
                <option value="email" className="bg-[#060b18]">Email / newsletter</option>
                <option value="onepager" className="bg-[#060b18]">One-pager / case study</option>
                <option value="deck" className="bg-[#060b18]">Slide / deck</option>
                <option value="general" className="bg-[#060b18]">Autre</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-white/60 mb-1 block">Notes (optionnel)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex : à utiliser pour les clients restos — palette chaude"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm placeholder-white/30 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-[11px] text-white/60 mb-1 block">HTML exporté depuis Claude Design</label>
            <textarea
              value={html}
              onChange={e => setHtml(e.target.value)}
              rows={10}
              placeholder="<!DOCTYPE html><html>…"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-mono placeholder-white/30 focus:outline-none focus:border-purple-500 resize-y"
            />
            <p className="text-[10px] text-white/40 mt-1">
              Le HTML est nettoyé côté serveur (scripts, iframes et handlers JS sont strippés).
              Taille max : 600 kB.
            </p>
          </div>

          <button
            onClick={submit}
            disabled={submitting || !html.trim()}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition"
          >
            {submitting ? 'Import en cours…' : 'Importer ce template'}
          </button>

          {result && (
            <div className={`mt-2 p-3 rounded-lg text-xs ${result.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
              {result.msg}
              {result.palette && result.palette.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-white/60 text-[10px]">Palette extraite :</span>
                  {result.palette.map((c, i) => (
                    <span key={i} className="w-4 h-4 rounded border border-white/20" style={{ background: c }} title={c} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Templates list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Tes templates ({templates.length})</h2>
            <button onClick={refresh} className="text-xs text-white/60 hover:text-white">\u21BB Rafraîchir</button>
          </div>
          {templates.length === 0 && (
            <p className="text-white/40 text-sm text-center py-8">
              Aucun template importé pour le moment. Va sur{' '}
              <a href="https://claude.ai/design" target="_blank" rel="noopener" className="text-purple-400 hover:text-purple-300 underline">
                claude.ai/design
              </a>{' '}
              pour en créer un.
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {templates.map(t => (
              <div key={t.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-medium">{t.category}</span>
                </div>
                {t.notes && <p className="text-xs text-white/60 mb-2">{t.notes}</p>}
                {t.palette.length > 0 && (
                  <div className="flex items-center gap-1 mb-2">
                    {t.palette.slice(0, 6).map((c, i) => (
                      <span key={i} className="w-4 h-4 rounded border border-white/20" style={{ background: c }} title={c} />
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-white/40">
                  Importé {new Date(t.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
