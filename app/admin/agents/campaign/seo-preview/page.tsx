'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

function SeoPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get('article_id');
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [article, setArticle] = useState<any>(null);
  const [editingSeo, setEditingSeo] = useState(false);
  const [seoEditFields, setSeoEditFields] = useState<any>({});
  const [seoReviseInstructions, setSeoReviseInstructions] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) { router.push('/'); return; }

      if (!articleId) { setLoading(false); return; }
      const { data } = await supabase.from('blog_posts').select('*').eq('id', articleId).single();
      if (data) setArticle(data);
      setLoading(false);
    })();
  }, [articleId]);

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

  const handleUpdate = async () => {
    const data = await doAction('/api/agents/seo', { action: 'update_article', article_id: article.id, updates: seoEditFields }, 'update');
    if (data?.ok && data.article) { setArticle(data.article); setEditingSeo(false); setSeoEditFields({}); }
  };

  const handleRevise = async () => {
    if (!seoReviseInstructions.trim()) return;
    const data = await doAction('/api/agents/seo', { action: 'revise_article', article_id: article.id, instructions: seoReviseInstructions }, 'revise');
    if (data?.ok && data.article) { setArticle(data.article); setSeoReviseInstructions(''); }
  };

  if (loading) return <div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!article) return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <Link href="/admin/agents?tab=seo" className="text-sm text-purple-600 hover:underline">Retour au SEO</Link>
      <div className="mt-4 bg-white rounded-xl shadow-sm border p-8 text-center text-neutral-400">Article introuvable</div>
    </div>
  );

  const LoadingBtn = ({ loading: l, onClick, children, className = '' }: any) => (
    <button onClick={onClick} disabled={l || actionLoading !== null} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${className}`}>
      {l ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/agents?tab=seo" className="text-sm text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            SEO Blog
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{article.status === 'published' ? 'Publié' : 'Brouillon'}</span>
              {article.keywords_primary && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{article.keywords_primary}</span>}
              {article.slug && article.status === 'published' && (
                <a href={`/blog/${article.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline">/blog/{article.slug}</a>
              )}
            </div>
            <div className="flex items-center gap-2">
              {article.status === 'draft' && <LoadingBtn loading={actionLoading === 'publish'} onClick={handlePublish} className="bg-green-600 text-white hover:bg-green-700">Publier</LoadingBtn>}
              <button onClick={() => { setEditingSeo(!editingSeo); setSeoEditFields({}); }} className="text-xs text-neutral-600 hover:underline">{editingSeo ? 'Annuler' : 'Editer'}</button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {editingSeo ? (
              <div className="space-y-3 bg-neutral-50 rounded-lg p-4 border">
                <div>
                  <label className="text-xs font-medium text-neutral-600">Titre</label>
                  <input type="text" defaultValue={article.title} onChange={e => setSeoEditFields((f: any) => ({ ...f, title: e.target.value }))} className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600">Meta description</label>
                  <textarea defaultValue={article.meta_description} onChange={e => setSeoEditFields((f: any) => ({ ...f, meta_description: e.target.value }))} rows={2} className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600">Contenu HTML</label>
                  <textarea defaultValue={article.content_html} onChange={e => setSeoEditFields((f: any) => ({ ...f, content_html: e.target.value }))} rows={15} className="w-full mt-1 px-3 py-2 text-xs font-mono border rounded-lg focus:ring-2 focus:ring-purple-500" />
                </div>
                <LoadingBtn loading={actionLoading === 'update'} onClick={handleUpdate} className="bg-purple-600 text-white hover:bg-purple-700">Sauvegarder</LoadingBtn>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-neutral-900">{article.title}</h2>
                {article.meta_description && <p className="text-sm text-neutral-500 italic">{article.meta_description}</p>}
                <div className="prose prose-sm max-w-none border rounded-lg p-5 bg-white" dangerouslySetInnerHTML={{ __html: article.content_html || '' }} />
              </>
            )}

            <div className="flex gap-2 pt-3 border-t border-neutral-100">
              <input type="text" placeholder="Demander une modification à l'IA..." value={seoReviseInstructions} onChange={e => setSeoReviseInstructions(e.target.value)} className="flex-1 px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-purple-500" />
              <LoadingBtn loading={actionLoading === 'revise'} onClick={handleRevise} className="bg-blue-100 text-blue-700 hover:bg-blue-200">Modifier via IA</LoadingBtn>
            </div>

            {article.schema_faq && article.schema_faq.length > 0 && (
              <details className="pt-3 border-t border-neutral-100">
                <summary className="text-xs font-semibold text-neutral-500 cursor-pointer">FAQ Schema ({article.schema_faq.length})</summary>
                <div className="mt-2 space-y-2">
                  {article.schema_faq.map((faq: any, i: number) => (
                    <div key={i} className="bg-neutral-50 rounded-lg p-3">
                      <p className="text-sm font-medium text-neutral-800">{faq.question}</p>
                      <p className="text-xs text-neutral-600 mt-1">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
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
