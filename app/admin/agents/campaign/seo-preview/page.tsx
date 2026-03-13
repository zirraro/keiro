'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

type ArticleVersion = {
  title: string;
  meta_description: string;
  content_html: string;
  excerpt?: string;
  timestamp: string;
  label: string;
};

function SeoPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get('article_id');
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [article, setArticle] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [inlineEditing, setInlineEditing] = useState<'title' | 'content' | 'meta' | null>(null);
  const [editFields, setEditFields] = useState<any>({});
  const [reviseInstructions, setReviseInstructions] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [previewMode, setPreviewMode] = useState<'blog' | 'google'>('blog');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const reviseRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) { router.push('/'); return; }

      if (!articleId) { setLoading(false); return; }
      const { data } = await supabase.from('blog_posts').select('*').eq('id', articleId).single();
      if (data) {
        setArticle(data);
        setVersions([{
          title: data.title,
          meta_description: data.meta_description || '',
          content_html: data.content_html || '',
          excerpt: data.excerpt || '',
          timestamp: data.updated_at || data.created_at,
          label: 'Version originale',
        }]);
      }
      setLoading(false);
    })();
  }, [articleId]);

  const saveVersion = (art: any, label: string) => {
    setVersions(prev => [...prev, {
      title: art.title,
      meta_description: art.meta_description || '',
      content_html: art.content_html || '',
      excerpt: art.excerpt || '',
      timestamp: new Date().toISOString(),
      label,
    }]);
  };

  const restoreVersion = async (version: ArticleVersion) => {
    const updates = {
      title: version.title,
      meta_description: version.meta_description,
      content_html: version.content_html,
      excerpt: version.excerpt,
    };
    setActionLoading('restore');
    try {
      const res = await fetch('/api/agents/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'update_article', article_id: article.id, updates }),
      });
      const data = await res.json();
      if (data?.ok && data.article) {
        setArticle(data.article);
        saveVersion(data.article, 'Restauration');
      }
    } finally { setActionLoading(null); }
    setShowVersions(false);
  };

  const doAction = async (url: string, body: any, key: string) => {
    setActionLoading(key);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error(await res.text().then(t => t.substring(0, 200)));
      return await res.json();
    } finally { setActionLoading(null); }
  };

  const handlePublish = async () => {
    const data = await doAction('/api/agents/seo', { action: 'publish', article_id: article.id }, 'publish');
    if (data?.ok) setArticle((a: any) => ({ ...a, status: 'published', published_at: new Date().toISOString() }));
  };

  // Save inline edits (title or content)
  const handleInlineSave = useCallback(async () => {
    if (!hasUnsavedChanges || Object.keys(editFields).length === 0) {
      setInlineEditing(null);
      setHasUnsavedChanges(false);
      return;
    }
    saveVersion(article, 'Avant edition inline');
    const data = await doAction('/api/agents/seo', { action: 'update_article', article_id: article.id, updates: editFields }, 'update');
    if (data?.ok && data.article) {
      setArticle(data.article);
      saveVersion(data.article, 'Edition inline');
    }
    setInlineEditing(null);
    setEditFields({});
    setHasUnsavedChanges(false);
  }, [article, editFields, hasUnsavedChanges]);

  const handleUpdate = async () => {
    saveVersion(article, 'Avant edition manuelle');
    const data = await doAction('/api/agents/seo', { action: 'update_article', article_id: article.id, updates: editFields }, 'update');
    if (data?.ok && data.article) {
      setArticle(data.article);
      saveVersion(data.article, 'Edition manuelle');
      setEditMode(false);
      setEditFields({});
    }
  };

  const handleRevise = async () => {
    if (!reviseInstructions.trim()) return;
    saveVersion(article, `Avant IA: "${reviseInstructions.substring(0, 40)}..."`);
    const data = await doAction('/api/agents/seo', { action: 'revise_article', article_id: article.id, instructions: reviseInstructions }, 'revise');
    if (data?.ok && data.article) {
      setArticle(data.article);
      saveVersion(data.article, `IA: "${reviseInstructions.substring(0, 40)}..."`);
      setReviseInstructions('');
    }
  };

  const cleanHtml = (html: string) => {
    if (!html) return '';
    // Remove img tags with broken/placeholder URLs but keep Unsplash images
    return html.replace(/<img[^>]*src=["'](?:https?:\/\/(?:placeholder|via\.placeholder|placehold|example\.com|image\.))[^"']*["'][^>]*\/?>/gi, '');
  };

  if (loading) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!article) return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <Link href="/admin/dm-queue" className="text-sm text-purple-600 hover:underline">Retour</Link>
      <div className="mt-4 bg-white rounded-xl shadow-sm border p-8 text-center text-neutral-400">Article introuvable</div>
    </div>
  );

  const publishedDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(article.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const LoadingBtn = ({ loading: l, onClick, children, className = '' }: any) => (
    <button onClick={onClick} disabled={l || actionLoading !== null} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${className}`}>
      {l ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  );

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Admin toolbar - sticky */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-neutral-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin/dm-queue?tab=seo" className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Retour
            </Link>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {article.status === 'published' ? 'Publie' : 'Brouillon'}
            </span>
            {article.slug && article.status === 'published' && (
              <a href={`/blog/${article.slug}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-600 hover:underline">/blog/{article.slug}</a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Unsaved indicator */}
            {hasUnsavedChanges && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium animate-pulse">Non sauvegarde</span>
            )}

            {/* Preview mode toggle */}
            <div className="flex bg-neutral-100 rounded-lg p-0.5">
              <button onClick={() => setPreviewMode('blog')} className={`text-[10px] px-2 py-1 rounded-md transition ${previewMode === 'blog' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}>Blog</button>
              <button onClick={() => setPreviewMode('google')} className={`text-[10px] px-2 py-1 rounded-md transition ${previewMode === 'google' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}>Google</button>
            </div>

            {/* Version history */}
            <div className="relative">
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="text-[10px] px-2 py-1 rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition"
              >
                Versions ({versions.length})
              </button>
              {showVersions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowVersions(false)} />
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl shadow-xl border z-20 py-2 max-h-64 overflow-y-auto">
                    {versions.map((v, i) => (
                      <div key={i} className="px-3 py-2 hover:bg-neutral-50 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-neutral-800 truncate">{v.label}</p>
                          <p className="text-[10px] text-neutral-400">{new Date(v.timestamp).toLocaleString('fr-FR')}</p>
                        </div>
                        {i < versions.length - 1 && (
                          <button
                            onClick={() => restoreVersion(v)}
                            disabled={actionLoading !== null}
                            className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 shrink-0 disabled:opacity-50"
                          >
                            Restaurer
                          </button>
                        )}
                        {i === versions.length - 1 && (
                          <span className="text-[10px] text-green-600 font-medium shrink-0">Actuel</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button onClick={() => { setEditMode(!editMode); setEditFields({}); setInlineEditing(null); setHasUnsavedChanges(false); }} className={`text-[10px] px-2 py-1 rounded-lg transition ${editMode ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
              {editMode ? 'Annuler HTML' : 'Editer HTML'}
            </button>
            {hasUnsavedChanges && (
              <LoadingBtn loading={actionLoading === 'update'} onClick={handleInlineSave} className="bg-green-600 text-white hover:bg-green-700">
                Sauvegarder
              </LoadingBtn>
            )}
            {article.status === 'draft' && (
              <LoadingBtn loading={actionLoading === 'publish'} onClick={handlePublish} className="bg-green-600 text-white hover:bg-green-700">
                Publier
              </LoadingBtn>
            )}
          </div>
        </div>

        {/* AI revision bar */}
        <div className="max-w-4xl mx-auto px-4 pb-2.5">
          <div className="flex gap-2">
            <input
              ref={reviseRef}
              type="text"
              placeholder="Demander une modification a l'IA (ex: ajoute plus d'images, raccourcis l'intro, plus de donnees chiffrees...)"
              value={reviseInstructions}
              onChange={e => setReviseInstructions(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRevise(); }}
              className="flex-1 px-3 py-1.5 text-xs border border-neutral-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-300 bg-neutral-50"
            />
            <LoadingBtn loading={actionLoading === 'revise'} onClick={handleRevise} className="bg-purple-600 text-white hover:bg-purple-700">
              Modifier via IA
            </LoadingBtn>
          </div>
        </div>
      </div>

      {/* Inline editing hint */}
      {!editMode && previewMode === 'blog' && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-2">
          <p className="text-[10px] text-neutral-400 text-center">Cliquez sur le titre ou le contenu pour modifier directement</p>
        </div>
      )}

      {/* Edit HTML mode */}
      {editMode && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-neutral-600">Titre</label>
              <input type="text" defaultValue={article.title} onChange={e => setEditFields((f: any) => ({ ...f, title: e.target.value }))} className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600">Meta description</label>
              <textarea defaultValue={article.meta_description} onChange={e => setEditFields((f: any) => ({ ...f, meta_description: e.target.value }))} rows={2} className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600">Contenu HTML</label>
              <textarea defaultValue={article.content_html} onChange={e => setEditFields((f: any) => ({ ...f, content_html: e.target.value }))} rows={20} className="w-full mt-1 px-3 py-2 text-xs font-mono border rounded-lg focus:ring-2 focus:ring-purple-500 leading-relaxed" />
            </div>
            <LoadingBtn loading={actionLoading === 'update'} onClick={handleUpdate} className="bg-purple-600 text-white hover:bg-purple-700">
              Sauvegarder
            </LoadingBtn>
          </div>
        </div>
      )}

      {/* Google SERP Preview */}
      {previewMode === 'google' && !editMode && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-xs text-neutral-400 mb-4 font-medium">Apercu Google (SERP)</p>
          <div className="bg-white rounded-xl shadow-sm border p-6 space-y-1">
            <p className="text-xs text-green-700">keiroai.com/blog/{article.slug}</p>
            <h3 className="text-xl text-blue-800 font-normal leading-snug cursor-pointer hover:underline">{article.meta_title || article.title}</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">{article.meta_description}</p>
          </div>

          {/* Meta info */}
          <div className="mt-6 bg-white rounded-xl shadow-sm border p-5 space-y-3">
            <p className="text-xs font-semibold text-neutral-500">Infos SEO</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-neutral-400">Mot-cle principal :</span> <span className="font-medium text-neutral-800">{article.keywords_primary}</span></div>
              <div><span className="text-neutral-400">Slug :</span> <span className="font-mono text-neutral-800">{article.slug}</span></div>
              <div><span className="text-neutral-400">Meta title :</span> <span className="text-neutral-800">{(article.meta_title || '').length} car.</span></div>
              <div><span className="text-neutral-400">Meta desc :</span> <span className="text-neutral-800">{(article.meta_description || '').length} car.</span></div>
            </div>
            {article.keywords_secondary && article.keywords_secondary.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] text-neutral-400">Secondaires :</span>
                {article.keywords_secondary.map((kw: string, i: number) => (
                  <span key={i} className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">{kw}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blog Preview with inline editing */}
      {previewMode === 'blog' && !editMode && (
        <div className="bg-white min-h-screen">
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white py-12">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <div className="flex items-center gap-3 mb-4">
                {article.keywords_primary && (
                  <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
                    {article.keywords_primary}
                  </span>
                )}
                <time className="text-white/70 text-sm">{publishedDate}</time>
                {article.status === 'draft' && (
                  <span className="bg-amber-400/30 text-amber-100 text-xs font-medium px-3 py-1 rounded-full">BROUILLON</span>
                )}
              </div>
              {/* Inline editable title */}
              <h1
                ref={titleRef}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setInlineEditing('title')}
                onBlur={(e) => {
                  const newTitle = e.currentTarget.textContent || '';
                  if (newTitle !== article.title) {
                    setEditFields((f: any) => ({ ...f, title: newTitle }));
                    setHasUnsavedChanges(true);
                  }
                }}
                className={`text-3xl sm:text-4xl font-bold leading-tight outline-none ${
                  inlineEditing === 'title' ? 'ring-2 ring-white/50 rounded-lg px-2 -mx-2 bg-white/10' : 'hover:ring-2 hover:ring-white/30 hover:rounded-lg hover:px-2 hover:-mx-2 cursor-text'
                }`}
              >
                {article.title}
              </h1>
            </div>
          </div>

          {/* Content - inline editable */}
          <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              onFocus={() => setInlineEditing('content')}
              onBlur={(e) => {
                const newHtml = e.currentTarget.innerHTML;
                if (newHtml !== cleanHtml(article.content_html || '')) {
                  setEditFields((f: any) => ({ ...f, content_html: newHtml }));
                  setHasUnsavedChanges(true);
                }
              }}
              className={`prose prose-lg prose-neutral max-w-none
                prose-headings:text-neutral-900 prose-headings:font-bold
                prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-neutral-700 prose-p:leading-relaxed prose-p:mb-4
                prose-a:text-purple-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                prose-ul:my-4 prose-li:text-neutral-700
                prose-strong:text-neutral-900
                prose-blockquote:border-purple-500 prose-blockquote:bg-purple-50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg
                prose-img:rounded-lg prose-img:shadow-md
                outline-none ${inlineEditing === 'content' ? 'ring-2 ring-purple-200 rounded-xl p-4 -m-4' : 'hover:ring-1 hover:ring-purple-100 hover:rounded-xl hover:p-4 hover:-m-4 cursor-text'}`}
              dangerouslySetInnerHTML={{ __html: cleanHtml(article.content_html || '') }}
            />

            {/* Meta description - inline editable */}
            <div className="mt-8 bg-neutral-50 rounded-xl border border-neutral-200 p-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase mb-2">Meta description</p>
              <p
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setInlineEditing('meta')}
                onBlur={(e) => {
                  const newMeta = e.currentTarget.textContent || '';
                  if (newMeta !== (article.meta_description || '')) {
                    setEditFields((f: any) => ({ ...f, meta_description: newMeta }));
                    setHasUnsavedChanges(true);
                  }
                }}
                className={`text-sm text-neutral-600 leading-relaxed outline-none ${
                  inlineEditing === 'meta' ? 'ring-2 ring-purple-200 rounded-lg p-2 -m-2 bg-white' : 'hover:ring-1 hover:ring-purple-100 hover:rounded-lg hover:p-2 hover:-m-2 cursor-text'
                }`}
              >
                {article.meta_description}
              </p>
              <p className="text-[10px] text-neutral-400 mt-1">{(article.meta_description || '').length} caracteres</p>
            </div>

            {/* FAQ section */}
            {article.schema_faq && article.schema_faq.length > 0 && (
              <section className="mt-12 border-t border-neutral-200 pt-8">
                <h2 className="text-2xl font-bold text-neutral-900 mb-6">Questions frequentes</h2>
                <div className="space-y-6">
                  {article.schema_faq.map((faq: any, i: number) => (
                    <div key={i} className="bg-neutral-50 rounded-lg p-5">
                      <h3 className="font-semibold text-neutral-900 mb-2">{faq.question}</h3>
                      <p className="text-neutral-700 text-sm leading-relaxed">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* CTA section */}
            <section className="mt-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-center text-white">
              <h2 className="text-2xl font-bold mb-3">Pret a booster ton marketing ?</h2>
              <p className="text-white/90 mb-6 max-w-lg mx-auto">
                Genere des visuels marketing professionnels en quelques secondes grace a l&apos;IA. Essai gratuit, sans carte bancaire.
              </p>
              <span className="inline-block bg-white text-purple-700 font-bold px-8 py-3 rounded-lg">
                Essayer gratuitement
              </span>
            </section>
          </article>
        </div>
      )}
    </div>
  );
}

export default function SeoPreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <SeoPreviewContent />
    </Suspense>
  );
}
