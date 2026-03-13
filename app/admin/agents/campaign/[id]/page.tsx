'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

type AgentLog = {
  id: string;
  agent: string;
  action: string;
  data: any;
  status: string | null;
  error_message: string | null;
  created_at: string;
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [log, setLog] = useState<AgentLog | null>(null);
  const [contentPosts, setContentPosts] = useState<any[]>([]);
  const [seoArticle, setSeoArticle] = useState<any>(null);
  const [dmQueue, setDmQueue] = useState<any[]>([]);
  // Edit states
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<any>({});
  const [reviseInstructions, setReviseInstructions] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [seoEditFields, setSeoEditFields] = useState<any>({});
  const [editingSeo, setEditingSeo] = useState(false);
  const [seoReviseInstructions, setSeoReviseInstructions] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) { router.push('/'); return; }

      const { data, error } = await supabase.from('agent_logs').select('*').eq('id', id).single();
      if (error || !data) { setLoading(false); return; }
      setLog(data);
      const d = data.data || {};

      // Load related data based on agent type
      if (data.agent === 'content') {
        if (d.weekStart) {
          const endDate = new Date(d.weekStart);
          endDate.setDate(endDate.getDate() + 7);
          const { data: posts } = await supabase.from('content_calendar').select('*')
            .gte('scheduled_date', d.weekStart).lte('scheduled_date', endDate.toISOString().split('T')[0])
            .order('scheduled_date', { ascending: true });
          if (posts) setContentPosts(posts);
        } else {
          const logDate = data.created_at.split('T')[0];
          const { data: posts } = await supabase.from('content_calendar').select('*')
            .gte('scheduled_date', logDate).order('scheduled_date', { ascending: true }).limit(10);
          if (posts) setContentPosts(posts);
        }
      }

      if (data.agent === 'seo' && d.article_id) {
        const { data: article } = await supabase.from('blog_posts').select('*').eq('id', d.article_id).single();
        if (article) setSeoArticle(article);
      }

      if (data.agent === 'dm_instagram' || data.agent === 'tiktok_comments') {
        const logDate = data.created_at.split('T')[0];
        const nextDay = new Date(logDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const channel = data.agent === 'dm_instagram' ? 'instagram' : 'tiktok';
        const { data: queue } = await supabase.from('dm_queue')
          .select('*, prospect:crm_prospects(company, type, quartier, instagram, tiktok_handle)')
          .eq('channel', channel)
          .gte('created_at', logDate)
          .lte('created_at', nextDay.toISOString().split('T')[0])
          .order('created_at', { ascending: false }).limit(20);
        if (queue) setDmQueue(queue);
      }

      setLoading(false);
    })();
  }, [id]);

  // === Action helpers ===
  const doAction = async (url: string, body: any, loadingKey: string) => {
    setActionLoading(loadingKey);
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(body),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error(await res.text().then(t => t.substring(0, 200)));
      return await res.json();
    } finally {
      setActionLoading(null);
    }
  };

  const handleContentAction = async (postId: string, action: 'approve' | 'publish' | 'skip') => {
    const data = await doAction('/api/agents/content', { action, postId }, `${action}_${postId}`);
    if (data?.ok) {
      setContentPosts(prev => prev.map(p => p.id === postId ? { ...p, status: action === 'approve' ? 'approved' : action === 'publish' ? 'published' : 'skipped', ...(action === 'publish' ? { published_at: new Date().toISOString() } : {}) } : p));
    }
  };

  const handleContentUpdate = async (postId: string) => {
    const data = await doAction('/api/agents/content', { action: 'update_post', postId, ...editFields }, `update_${postId}`);
    if (data?.ok && data.post) {
      setContentPosts(prev => prev.map(p => p.id === postId ? data.post : p));
      setEditingPostId(null);
      setEditFields({});
    }
  };

  const handleContentRevise = async (postId: string) => {
    if (!reviseInstructions.trim()) return;
    const data = await doAction('/api/agents/content', { action: 'revise_post', postId, instructions: reviseInstructions }, `revise_${postId}`);
    if (data?.ok && data.post) {
      setContentPosts(prev => prev.map(p => p.id === postId ? data.post : p));
      setReviseInstructions('');
    }
  };

  const handleGenerateVisual = async (postId: string) => {
    const data = await doAction('/api/agents/content', { action: 'generate_visual', postId }, `visual_${postId}`);
    if (data?.ok && data.visual_url) {
      setContentPosts(prev => prev.map(p => p.id === postId ? { ...p, visual_url: data.visual_url } : p));
    }
  };

  const handleSeoPublish = async () => {
    if (!seoArticle) return;
    const data = await doAction('/api/agents/seo', { action: 'publish', article_id: seoArticle.id }, 'seo_publish');
    if (data?.ok) setSeoArticle((prev: any) => ({ ...prev, status: 'published', published_at: new Date().toISOString() }));
  };

  const handleSeoUpdate = async () => {
    if (!seoArticle) return;
    const data = await doAction('/api/agents/seo', { action: 'update_article', article_id: seoArticle.id, updates: seoEditFields }, 'seo_update');
    if (data?.ok && data.article) {
      setSeoArticle(data.article);
      setEditingSeo(false);
      setSeoEditFields({});
    }
  };

  const handleSeoRevise = async () => {
    if (!seoArticle || !seoReviseInstructions.trim()) return;
    const data = await doAction('/api/agents/seo', { action: 'revise_article', article_id: seoArticle.id, instructions: seoReviseInstructions }, 'seo_revise');
    if (data?.ok && data.article) {
      setSeoArticle(data.article);
      setSeoReviseInstructions('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!log) {
    return (
      <div className="min-h-screen bg-neutral-50 p-6">
        <Link href="/admin/agents?tab=campagnes" className="text-sm text-purple-600 hover:underline mb-4 inline-block">Retour aux campagnes</Link>
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-neutral-400">Campagne introuvable</div>
      </div>
    );
  }

  const d = log.data || {};

  const ACTION_LABELS: Record<string, string> = {
    daily_cold: 'Email Cold', daily_warm: 'Email Warm',
    daily_preparation: 'DM Instagram', comments_prepared: 'TikTok Comments',
    enrichment_run: 'Enrichissement CRM', daily_post_generated: 'Post du jour',
    weekly_plan_generated: 'Plan hebdomadaire', execute_publication: 'Publication',
    article_generated: 'Article SEO', article_published: 'Article publié',
    calendar_planned: 'Calendrier SEO', queue_processed: 'Onboarding',
    sequence_scheduled: 'Onboarding', daily_check: 'Check rétention',
    daily_brief: 'Brief CEO', report_to_ceo: 'Rapport CEO',
  };

  const AGENT_COLORS: Record<string, string> = {
    email: 'bg-green-100 text-green-700', content: 'bg-orange-100 text-orange-700',
    commercial: 'bg-purple-100 text-purple-700', dm_instagram: 'bg-pink-100 text-pink-700',
    tiktok_comments: 'bg-neutral-900 text-white', seo: 'bg-blue-100 text-blue-700',
    ceo: 'bg-amber-100 text-amber-700', onboarding: 'bg-teal-100 text-teal-700',
    retention: 'bg-cyan-100 text-cyan-700',
  };

  const StatusBadge = ({ status }: { status: string }) => (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
      status === 'published' ? 'bg-green-100 text-green-700' :
      status === 'approved' ? 'bg-blue-100 text-blue-700' :
      status === 'skipped' ? 'bg-neutral-100 text-neutral-500' :
      status === 'sent' ? 'bg-green-100 text-green-700' :
      status === 'pending' ? 'bg-amber-100 text-amber-700' :
      'bg-amber-100 text-amber-700'
    }`}>{status}</span>
  );

  const PlatformBadge = ({ platform }: { platform: string }) => (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
      platform === 'instagram' ? 'bg-pink-100 text-pink-700' :
      platform === 'tiktok' ? 'bg-neutral-900 text-white' :
      'bg-blue-100 text-blue-700'
    }`}>{platform}</span>
  );

  const LoadingBtn = ({ loading: isLoading, onClick, children, className = '' }: { loading: boolean; onClick: () => void; children: React.ReactNode; className?: string }) => (
    <button onClick={onClick} disabled={isLoading || actionLoading !== null} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${className}`}>
      {isLoading ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/admin/agents?tab=campagnes" className="text-sm text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Campagnes
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${AGENT_COLORS[log.agent] || 'bg-neutral-100 text-neutral-600'}`}>{log.agent}</span>
              <span className="text-xs px-3 py-1 rounded-full font-medium bg-neutral-100 text-neutral-600">{ACTION_LABELS[log.action] || log.action}</span>
              {log.status === 'error' && <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-700 font-medium">Erreur</span>}
            </div>
            <span className="text-sm text-neutral-500">
              {new Date(log.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {d.message && <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3"><p className="text-sm text-blue-800">{d.message}</p></div>}
          {log.error_message && <div className="bg-red-50 border border-red-100 rounded-lg p-3"><p className="text-sm text-red-700">{log.error_message}</p></div>}
        </div>

        {/* ===== EMAIL AGENT ===== */}
        {log.agent === 'email' && (
          <div className="space-y-4">
            {d.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total', value: d.stats.total || 0, color: 'text-neutral-900' },
                  { label: 'Envoyés', value: d.stats.success || 0, color: 'text-green-600' },
                  { label: 'Echoués', value: d.stats.failed || 0, color: 'text-red-600' },
                  { label: 'IA générés', value: d.stats.ai_generated || 0, color: 'text-purple-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl shadow-sm border p-4 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-neutral-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            {d.diagnostic && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-amber-700 uppercase mb-2">Diagnostic CRM</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(d.diagnostic).filter(([k]) => k !== 'reason' && k !== 'sample_statuses').map(([k, v]) => (
                    <span key={k} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800">{k}: {String(v)}</span>
                  ))}
                </div>
                {d.diagnostic.reason && <p className="text-xs text-amber-600 mt-2">{d.diagnostic.reason}</p>}
                {d.diagnostic.sample_statuses && (
                  <details className="mt-2"><summary className="text-[10px] text-amber-600 cursor-pointer">Exemples de prospects</summary>
                    <div className="mt-1 space-y-1">
                      {d.diagnostic.sample_statuses.map((s: any, i: number) => (
                        <div key={i} className="text-[10px] text-amber-700">status: {s.status || 'null'}, seq: {s.seq || 'null'}, temp: {s.temp || 'null'}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
            {d.results && d.results.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b border-neutral-100"><h3 className="text-sm font-semibold text-neutral-900">Emails envoyés ({d.results.length})</h3></div>
                <div className="divide-y divide-neutral-100">
                  {d.results.map((r: any, i: number) => (
                    <div key={i} className={`flex items-center gap-3 px-4 py-3 ${r.success ? '' : 'bg-red-50'}`}>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r.success ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-sm text-neutral-800 font-medium flex-1 min-w-0 truncate">{r.email || r.prospect_id?.slice(0, 12)}</span>
                      {r.type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">{r.type}</span>}
                      <span className="text-xs text-neutral-500">Step {r.step}</span>
                      {r.ai_generated && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">IA</span>}
                      {r.error && <span className="text-xs text-red-500 truncate max-w-[200px]">{r.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== CONTENT AGENT ===== */}
        {log.agent === 'content' && (
          <div className="space-y-4">
            {contentPosts.length > 0 ? (
              contentPosts.map((post: any) => (
                <div key={post.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  {/* Post header */}
                  <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={post.platform} />
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{post.format}</span>
                      {post.pillar && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">{post.pillar}</span>}
                      <StatusBadge status={post.status} />
                    </div>
                    <span className="text-xs text-neutral-400">{post.scheduled_date} {post.scheduled_time}</span>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Visual */}
                    {post.visual_url ? (
                      <a href={post.visual_url} target="_blank" rel="noopener noreferrer">
                        <img src={post.visual_url} alt="Visuel" className="w-full max-w-sm rounded-lg border hover:opacity-90 transition-opacity" />
                      </a>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-400">Pas de visuel</span>
                        <LoadingBtn loading={actionLoading === `visual_${post.id}`} onClick={() => handleGenerateVisual(post.id)} className="bg-purple-100 text-purple-700 hover:bg-purple-200">
                          Générer le visuel
                        </LoadingBtn>
                      </div>
                    )}

                    {/* Content display or edit */}
                    {editingPostId === post.id ? (
                      <div className="space-y-3 bg-neutral-50 rounded-lg p-4 border">
                        <div>
                          <label className="text-xs font-medium text-neutral-600">Hook</label>
                          <input type="text" defaultValue={post.hook || ''} onChange={e => setEditFields((f: any) => ({ ...f, hook: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-neutral-600">Caption</label>
                          <textarea defaultValue={post.caption || ''} onChange={e => setEditFields((f: any) => ({ ...f, caption: e.target.value }))}
                            rows={6} className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-neutral-600">Description visuelle</label>
                          <textarea defaultValue={post.visual_description || ''} onChange={e => setEditFields((f: any) => ({ ...f, visual_description: e.target.value }))}
                            rows={3} className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div className="flex gap-2">
                          <LoadingBtn loading={actionLoading === `update_${post.id}`} onClick={() => handleContentUpdate(post.id)} className="bg-purple-600 text-white hover:bg-purple-700">Sauvegarder</LoadingBtn>
                          <button onClick={() => { setEditingPostId(null); setEditFields({}); }} className="text-xs text-neutral-500 hover:underline">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {post.hook && <h4 className="text-base font-semibold text-neutral-900">{post.hook}</h4>}
                        <p className="text-sm text-neutral-700 whitespace-pre-wrap bg-neutral-50 rounded-lg p-3 border border-neutral-100">{post.caption}</p>
                        {post.visual_description && !post.visual_url && (
                          <p className="text-[10px] text-neutral-400 bg-neutral-50 rounded p-2">Visuel : {post.visual_description}</p>
                        )}
                      </>
                    )}

                    {/* Ask AI to revise */}
                    <div className="flex gap-2">
                      <input type="text" placeholder="Demander une modification à l'IA..." value={editingPostId === post.id ? '' : reviseInstructions}
                        onChange={e => setReviseInstructions(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-purple-500" />
                      <LoadingBtn loading={actionLoading === `revise_${post.id}`} onClick={() => handleContentRevise(post.id)} className="bg-blue-100 text-blue-700 hover:bg-blue-200">
                        Modifier via IA
                      </LoadingBtn>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                      {editingPostId !== post.id && (
                        <button onClick={() => { setEditingPostId(post.id); setEditFields({}); }} className="text-xs text-neutral-600 hover:underline">Editer manuellement</button>
                      )}
                      {(post.status === 'draft' || post.status === 'approved') && (
                        <>
                          {post.status === 'draft' && (
                            <LoadingBtn loading={actionLoading === `approve_${post.id}`} onClick={() => handleContentAction(post.id, 'approve')} className="bg-blue-100 text-blue-700 hover:bg-blue-200">Approuver</LoadingBtn>
                          )}
                          <LoadingBtn loading={actionLoading === `publish_${post.id}`} onClick={() => handleContentAction(post.id, 'publish')} className="bg-green-100 text-green-700 hover:bg-green-200">Publier</LoadingBtn>
                          <LoadingBtn loading={actionLoading === `skip_${post.id}`} onClick={() => handleContentAction(post.id, 'skip')} className="bg-neutral-100 text-neutral-500 hover:bg-neutral-200">Ignorer</LoadingBtn>
                        </>
                      )}
                      {post.status === 'published' && <span className="text-xs text-green-600 font-medium">Publié</span>}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-neutral-400">Aucun post associé</div>
            )}
          </div>
        )}

        {/* ===== SEO AGENT ===== */}
        {log.agent === 'seo' && (
          <div className="space-y-4">
            {seoArticle ? (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={seoArticle.status} />
                    {seoArticle.keywords_primary && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{seoArticle.keywords_primary}</span>}
                    {seoArticle.slug && (
                      <a href={`/blog/${seoArticle.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline">/blog/{seoArticle.slug}</a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {seoArticle.status === 'draft' && (
                      <LoadingBtn loading={actionLoading === 'seo_publish'} onClick={handleSeoPublish} className="bg-green-100 text-green-700 hover:bg-green-200">Publier</LoadingBtn>
                    )}
                    <button onClick={() => { setEditingSeo(!editingSeo); setSeoEditFields({}); }} className="text-xs text-neutral-600 hover:underline">
                      {editingSeo ? 'Annuler édition' : 'Editer'}
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {editingSeo ? (
                    <div className="space-y-3 bg-neutral-50 rounded-lg p-4 border">
                      <div>
                        <label className="text-xs font-medium text-neutral-600">Titre</label>
                        <input type="text" defaultValue={seoArticle.title} onChange={e => setSeoEditFields((f: any) => ({ ...f, title: e.target.value }))}
                          className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-neutral-600">Meta description</label>
                        <textarea defaultValue={seoArticle.meta_description} onChange={e => setSeoEditFields((f: any) => ({ ...f, meta_description: e.target.value }))}
                          rows={2} className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-neutral-600">Contenu HTML</label>
                        <textarea defaultValue={seoArticle.content_html} onChange={e => setSeoEditFields((f: any) => ({ ...f, content_html: e.target.value }))}
                          rows={15} className="w-full mt-1 px-3 py-2 text-xs font-mono border rounded-lg focus:ring-2 focus:ring-purple-500" />
                      </div>
                      <LoadingBtn loading={actionLoading === 'seo_update'} onClick={handleSeoUpdate} className="bg-purple-600 text-white hover:bg-purple-700">Sauvegarder</LoadingBtn>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-bold text-neutral-900">{seoArticle.title}</h2>
                      {seoArticle.meta_description && <p className="text-sm text-neutral-500 italic">{seoArticle.meta_description}</p>}
                      {/* Article preview */}
                      <div className="prose prose-sm max-w-none border rounded-lg p-5 bg-white"
                        dangerouslySetInnerHTML={{ __html: seoArticle.content_html || '' }} />
                    </>
                  )}

                  {/* Ask AI to revise */}
                  <div className="flex gap-2 pt-3 border-t border-neutral-100">
                    <input type="text" placeholder="Demander une modification à l'IA (ex: rendre plus concis, ajouter un CTA...)" value={seoReviseInstructions}
                      onChange={e => setSeoReviseInstructions(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-purple-500" />
                    <LoadingBtn loading={actionLoading === 'seo_revise'} onClick={handleSeoRevise} className="bg-blue-100 text-blue-700 hover:bg-blue-200">
                      Modifier via IA
                    </LoadingBtn>
                  </div>

                  {/* FAQ Schema */}
                  {seoArticle.schema_faq && seoArticle.schema_faq.length > 0 && (
                    <details className="pt-3 border-t border-neutral-100">
                      <summary className="text-xs font-semibold text-neutral-500 cursor-pointer">FAQ Schema ({seoArticle.schema_faq.length})</summary>
                      <div className="mt-2 space-y-2">
                        {seoArticle.schema_faq.map((faq: any, i: number) => (
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
            ) : d.title || d.slug ? (
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="text-lg font-bold text-neutral-900 mb-2">{d.title || d.meta_title}</h3>
                {d.slug && <p className="text-sm text-purple-600">/blog/{d.slug}</p>}
                {d.keyword && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 mt-2 inline-block">{d.keyword}</span>}
              </div>
            ) : null}
          </div>
        )}

        {/* ===== DM INSTAGRAM + TIKTOK ===== */}
        {(log.agent === 'dm_instagram' || log.agent === 'tiktok_comments') && (
          <div className="space-y-4">
            {d.prepared !== undefined && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                  <p className="text-2xl font-bold text-neutral-900">{d.prepared || d.total || 0}</p>
                  <p className="text-xs text-neutral-500 mt-1">Préparés</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{d.sent || 0}</p>
                  <p className="text-xs text-neutral-500 mt-1">Envoyés</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{d.failed || 0}</p>
                  <p className="text-xs text-neutral-500 mt-1">Echoués</p>
                </div>
              </div>
            )}

            {/* DM Queue items */}
            {dmQueue.length > 0 ? (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b border-neutral-100">
                  <h3 className="text-sm font-semibold text-neutral-900">
                    {log.agent === 'dm_instagram' ? 'DMs' : 'Commentaires'} préparés ({dmQueue.length})
                  </h3>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    <Link href="/admin/dm-queue" className="text-purple-600 hover:underline">Ouvrir la file DM complète</Link>
                  </p>
                </div>
                <div className="divide-y divide-neutral-100">
                  {dmQueue.map((item: any) => (
                    <div key={item.id} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-neutral-800">{item.prospect?.company || item.handle}</span>
                        <span className="text-xs text-neutral-400">@{item.handle}</span>
                        {item.prospect?.type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">{item.prospect.type}</span>}
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="text-sm text-neutral-700 bg-blue-50 rounded-lg p-3 border border-blue-100 whitespace-pre-wrap">{item.message}</p>
                      {item.personalization && (
                        <p className="text-[10px] text-neutral-400 mt-1">{item.personalization}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : d.comments && d.comments.length > 0 ? (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b border-neutral-100"><h3 className="text-sm font-semibold text-neutral-900">Messages ({d.comments.length})</h3></div>
                <div className="divide-y divide-neutral-100">
                  {d.comments.map((c: any, i: number) => (
                    <div key={i} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-neutral-800">{c.name || c.handle}</span>
                        {c.type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">{c.type}</span>}
                      </div>
                      <p className="text-sm text-neutral-700 bg-blue-50 rounded-lg p-3 border border-blue-100 whitespace-pre-wrap">{c.comment || c.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {d.by_business_type && Object.keys(d.by_business_type).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-3">Par type</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(d.by_business_type).map(([type, data]: [string, any]) => (
                    <div key={type} className="bg-neutral-50 rounded-lg p-3">
                      <p className="text-lg font-bold text-neutral-900">{data.sent || data.count || 0}</p>
                      <p className="text-xs text-neutral-600 capitalize">{type}</p>
                      {data.handles && <p className="text-[10px] text-neutral-400 mt-1">{data.handles.map((h: string) => `@${h}`).join(', ')}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== COMMERCIAL AGENT ===== */}
        {log.agent === 'commercial' && (
          <div className="space-y-4">
            {d.phase1_enrichment && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-3">Phase 1 — Enrichissement</h3>
                  <div className="space-y-2">
                    {[
                      ['Prospects analysés', d.phase1_enrichment.prospects_found, ''],
                      ['Enrichis', d.phase1_enrichment.enriched, 'text-green-600'],
                      ['Promus contacté', d.phase1_enrichment.advanced_to_contact, 'text-blue-600'],
                      ['Disqualifiés', d.phase1_enrichment.flagged_dead, 'text-red-600'],
                      ['Ignorés', d.phase1_enrichment.skipped, 'text-neutral-400'],
                    ].map(([label, val, color]) => (
                      <div key={label as string} className="flex justify-between"><span className="text-sm text-neutral-600">{label}</span><span className={`text-sm font-bold ${color}`}>{val as number}</span></div>
                    ))}
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase mb-3">Phase 2 — Google Search</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between"><span className="text-sm text-neutral-600">Recherchés</span><span className="text-sm font-bold">{d.phase2_social_search?.searched || 0}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-neutral-600">Enrichis</span><span className="text-sm font-bold text-green-600">{d.phase2_social_search?.enriched || 0}</span></div>
                  </div>
                  {d.crm_stats && (
                    <div className="mt-4 pt-3 border-t space-y-1">
                      <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">CRM</h4>
                      {[['Total', d.crm_stats.total], ['Prêts', d.crm_stats.ready_to_contact], ['Instagram', d.crm_stats.with_instagram], ['TikTok', d.crm_stats.with_tiktok]].map(([l, v]) => (
                        <div key={l as string} className="flex justify-between"><span className="text-xs text-neutral-600">{l}</span><span className="text-xs font-bold">{v as number}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {d.details && d.details.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b border-neutral-100"><h3 className="text-sm font-semibold text-neutral-900">Détails ({d.details.length})</h3></div>
                <div className="divide-y divide-neutral-100">
                  {d.details.map((detail: any, i: number) => (
                    <div key={i} className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-neutral-800">{detail.company || detail.prospect_id?.slice(0, 12)}</span>
                        {detail.updates?.type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">{detail.updates.type}</span>}
                        {detail.updates?.temperature === 'dead' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">disqualifié</span>}
                        {detail.updates?.status === 'contacte' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-600">contacté</span>}
                      </div>
                      {detail.reasoning && <p className="text-xs text-neutral-500 mt-1">{detail.reasoning}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== CEO / REPORT ===== */}
        {(log.agent === 'ceo' || log.action === 'report_to_ceo') && (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            {d.phase && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium mb-3 inline-block">{d.phase}</span>}
            {d.message ? <p className="text-sm text-neutral-700 whitespace-pre-wrap">{d.message}</p>
              : <pre className="text-xs text-neutral-600 whitespace-pre-wrap bg-neutral-50 rounded-lg p-4 border overflow-x-auto">{JSON.stringify(d, null, 2)}</pre>}
          </div>
        )}

        {/* ===== ONBOARDING / RETENTION ===== */}
        {(log.agent === 'onboarding' || log.agent === 'retention') && (
          <div className="space-y-4">
            {d.total !== undefined && (
              <div className="grid grid-cols-3 gap-3">
                {[['Total', d.total, ''], ['Succès', d.success, 'text-green-600'], ['Echoués', d.failed, 'text-red-600']].map(([l, v, c]) => (
                  <div key={l as string} className="bg-white rounded-xl shadow-sm border p-4 text-center">
                    <p className={`text-2xl font-bold ${c}`}>{v as number}</p>
                    <p className="text-xs text-neutral-500 mt-1">{l}</p>
                  </div>
                ))}
              </div>
            )}
            {d.results && d.results.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b"><h3 className="text-sm font-semibold text-neutral-900">Résultats ({d.results.length})</h3></div>
                <div className="divide-y divide-neutral-100">
                  {d.results.map((r: any, i: number) => (
                    <div key={i} className={`flex items-center gap-3 px-4 py-3 ${r.success !== false ? '' : 'bg-red-50'}`}>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r.success !== false ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-sm text-neutral-800">{r.email || r.user_id || JSON.stringify(r).slice(0, 80)}</span>
                      {r.error && <span className="text-xs text-red-500 ml-auto">{r.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raw JSON toggle */}
        <details className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <summary className="p-4 text-xs text-neutral-500 cursor-pointer hover:text-neutral-700 font-medium">Données brutes (JSON)</summary>
          <pre className="p-4 text-xs text-neutral-600 whitespace-pre-wrap bg-neutral-50 border-t overflow-x-auto">{JSON.stringify(d, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}
