'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const supabaseBrowser = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

type PersonalizationData = {
  detail?: string;
  follow_up_7d?: string;
  response_interested?: string;
  response_skeptical?: string;
  tone_notes?: string;
  business_type?: string;
  strategy?: string;
  dm_text?: string;
  follow_up?: string;
};

type DMItem = {
  id: string;
  prospect_id: string;
  channel: string;
  handle: string;
  message: string;
  followup_message: string | null;
  personalization: string | null;
  status: string;
  priority: number;
  created_at: string;
  sent_at: string | null;
  response_type: string | null;
  prospect?: {
    company: string;
    type: string | null;
    quartier: string | null;
    google_rating: number | null;
    google_reviews: number | null;
    score: number | null;
  };
};

type ContentPost = {
  id: string;
  platform: string;
  scheduled_date: string;
  scheduled_time: string | null;
  caption: string;
  hashtags: string[];
  visual_description: string | null;
  visual_url: string | null;
  status: string;
  created_at: string;
};

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  content_html: string | null;
  keywords_primary: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
};

function parsePersonalization(raw: string | null): PersonalizationData | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

type MainTab = 'dm_instagram' | 'dm_tiktok' | 'pub_instagram' | 'pub_tiktok' | 'seo';
type DMSubTab = 'pending' | 'sent' | 'responded';
type PubSubTab = 'draft' | 'published';

export default function SuiviPublicationsPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <SuiviPublicationsPage />
    </Suspense>
  );
}

function SuiviPublicationsPage() {
  const searchParams = useSearchParams();
  const initialTab = (() => {
    const t = searchParams.get('tab');
    const validTabs: MainTab[] = ['dm_instagram', 'dm_tiktok', 'pub_instagram', 'pub_tiktok', 'seo'];
    if (t && validTabs.includes(t as MainTab)) return t as MainTab;
    return 'dm_instagram' as MainTab;
  })();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>(initialTab);
  const [dmSubTab, setDmSubTab] = useState<DMSubTab>('pending');
  const [pubSubTab, setPubSubTab] = useState<PubSubTab>('draft');

  // Data
  const [dmItems, setDmItems] = useState<DMItem[]>([]);
  const [contentPosts, setContentPosts] = useState<ContentPost[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);

  // UI
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const router = useRouter();

  const isDmTab = mainTab === 'dm_instagram' || mainTab === 'dm_tiktok';
  const isPubTab = mainTab === 'pub_instagram' || mainTab === 'pub_tiktok';
  const isSeoTab = mainTab === 'seo';

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = supabaseBrowser();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) { router.push('/'); return; }
    setIsAdmin(true);

    if (isDmTab) {
      const channel = mainTab === 'dm_instagram' ? 'instagram' : 'tiktok';
      let query = supabase
        .from('dm_queue')
        .select('*, prospect:crm_prospects(company, type, quartier, google_rating, google_reviews, score)')
        .eq('channel', channel)
        .order('priority', { ascending: false });

      if (dmSubTab === 'pending') {
        query = query.eq('status', 'pending');
      } else if (dmSubTab === 'sent') {
        query = query.in('status', ['sent', 'no_response']);
      } else {
        query = query.eq('status', 'responded');
      }

      const { data } = await query.limit(50);
      setDmItems((data as any) || []);
    } else if (isPubTab) {
      const network = mainTab === 'pub_instagram' ? 'instagram' : 'tiktok';
      let query = supabase
        .from('content_calendar')
        .select('*')
        .eq('platform', network)
        .order('scheduled_date', { ascending: false });

      if (pubSubTab === 'draft') {
        query = query.in('status', ['draft', 'pending', 'scheduled', 'approved']);
      } else {
        query = query.eq('status', 'published');
      }

      const { data } = await query.limit(50);
      setContentPosts((data as any) || []);
    } else if (isSeoTab) {
      let query = supabase
        .from('blog_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (pubSubTab === 'draft') {
        query = query.eq('status', 'draft');
      } else {
        query = query.eq('status', 'published');
      }

      const { data } = await query.limit(50);
      setBlogPosts((data as any) || []);
    }

    setLoading(false);
  }, [mainTab, dmSubTab, pubSubTab, router, isDmTab, isPubTab, isSeoTab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateDmStatus = async (id: string, status: string, responseType?: string) => {
    const supabase = supabaseBrowser();
    const updates: any = { status };
    if (status === 'sent') updates.sent_at = new Date().toISOString();
    if (responseType) updates.response_type = responseType;

    await supabase.from('dm_queue').update(updates).eq('id', id);

    const item = dmItems.find(i => i.id === id);
    if (item?.prospect_id) {
      const prospectUpdates: any = { updated_at: new Date().toISOString() };
      if (status === 'sent') {
        prospectUpdates.dm_status = 'sent';
        prospectUpdates.dm_sent_at = new Date().toISOString();
        prospectUpdates.dm_followup_date = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
        prospectUpdates.status = 'contacte';
      } else if (status === 'responded' && responseType === 'interested') {
        prospectUpdates.dm_status = 'responded_positive';
        prospectUpdates.temperature = 'hot';
        prospectUpdates.status = 'repondu';
      } else if (status === 'responded' && responseType === 'not_interested') {
        prospectUpdates.dm_status = 'responded_negative';
        prospectUpdates.status = 'perdu';
      } else if (status === 'skipped') {
        prospectUpdates.dm_status = 'none';
      }
      await supabase.from('crm_prospects').update(prospectUpdates).eq('id', item.prospect_id);
    }

    fetchData();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isAdmin) return null;

  const MAIN_TABS: { key: MainTab; label: string; icon: string }[] = [
    { key: 'dm_instagram', label: 'DM Instagram', icon: '📸' },
    { key: 'dm_tiktok', label: 'DM TikTok', icon: '🎵' },
    { key: 'pub_instagram', label: 'Publi. Instagram', icon: '📷' },
    { key: 'pub_tiktok', label: 'Publi. TikTok', icon: '🎬' },
    { key: 'seo', label: 'Articles SEO', icon: '📝' },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Suivi & Publications</h1>
            <p className="text-sm text-neutral-500 mt-1">
              DMs, publications et articles SEO
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fetchData()} className="px-3 py-1.5 text-xs bg-white border rounded-lg hover:bg-neutral-50">
              Actualiser
            </button>
            <Link href="/admin/agents" className="px-3 py-1.5 text-xs bg-white border rounded-lg hover:bg-neutral-50">
              Agents IA
            </Link>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl mb-4 overflow-x-auto">
          {MAIN_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setMainTab(t.key); setDmSubTab('pending'); setPubSubTab('draft'); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                mainTab === t.key ? 'bg-white shadow text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Sub Tabs */}
        {isDmTab && (
          <div className="flex gap-1 bg-neutral-100/50 p-1 rounded-lg mb-6 w-fit">
            {([
              { key: 'pending' as const, label: 'En attente' },
              { key: 'sent' as const, label: 'Envoyés' },
              { key: 'responded' as const, label: 'Réponses' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setDmSubTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  dmSubTab === t.key ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {(isPubTab || isSeoTab) && (
          <div className="flex gap-1 bg-neutral-100/50 p-1 rounded-lg mb-6 w-fit">
            {([
              { key: 'draft' as const, label: 'Brouillons' },
              { key: 'published' as const, label: 'Publiés' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setPubSubTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  pubSubTab === t.key ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <>
            {/* DM Items */}
            {isDmTab && (
              dmItems.length === 0 ? (
                <div className="text-center py-12 text-neutral-400">
                  {dmSubTab === 'pending'
                    ? `Aucun DM ${mainTab === 'dm_instagram' ? 'Instagram' : 'TikTok'} en attente. Lancez l'agent DM.`
                    : 'Aucun élément.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {dmItems.map((item, i) => {
                    const prospect = Array.isArray(item.prospect) ? item.prospect[0] : item.prospect;
                    const perso = parsePersonalization(item.personalization);
                    const persoText = perso?.detail || perso?.strategy || item.personalization;

                    return (
                      <div key={item.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-neutral-50 border-b flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-neutral-400">#{i + 1}</span>
                            <div>
                              <p className="text-sm font-semibold text-neutral-900">{prospect?.company || 'Inconnu'}</p>
                              <p className="text-xs text-neutral-500">
                                {item.handle}
                                {prospect?.quartier && ` · ${prospect.quartier}`}
                                {prospect?.type && ` · ${prospect.type}`}
                                {prospect?.google_rating && ` · ${prospect.google_rating}/5`}
                                {prospect?.google_reviews && ` (${prospect.google_reviews} avis)`}
                              </p>
                            </div>
                          </div>
                          {prospect?.score && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              prospect.score >= 50 ? 'bg-red-100 text-red-700' :
                              prospect.score >= 25 ? 'bg-orange-100 text-orange-700' :
                              'bg-neutral-100 text-neutral-600'
                            }`}>Score {prospect.score}</span>
                          )}
                        </div>

                        <div className="px-4 py-3">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
                            {item.message}
                          </div>
                          {persoText && (
                            <p className="text-[10px] text-neutral-400 mt-1.5 italic">
                              Personnalisation : {persoText}
                              {perso?.tone_notes && ` · Ton : ${perso.tone_notes}`}
                            </p>
                          )}
                          <button
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            className="text-[10px] text-blue-500 hover:underline mt-1"
                          >
                            {expandedId === item.id ? 'Masquer' : 'Relances & réponses types'}
                          </button>
                          {expandedId === item.id && (
                            <div className="mt-3 space-y-2">
                              {item.followup_message && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-orange-600 mb-1">Relance J+3 :</p>
                                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">{item.followup_message}</div>
                                  <button onClick={() => copyToClipboard(item.followup_message!, `${item.id}-f3`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-f3` ? 'bg-green-500 text-white' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'}`}>
                                    {copiedId === `${item.id}-f3` ? 'Copié' : 'Copier'}
                                  </button>
                                </div>
                              )}
                              {perso?.follow_up_7d && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-red-600 mb-1">Relance J+7 :</p>
                                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">{perso.follow_up_7d}</div>
                                  <button onClick={() => copyToClipboard(perso.follow_up_7d!, `${item.id}-f7`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-f7` ? 'bg-green-500 text-white' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                                    {copiedId === `${item.id}-f7` ? 'Copié' : 'Copier'}
                                  </button>
                                </div>
                              )}
                              {perso?.response_interested && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-green-600 mb-1">Si intéressé :</p>
                                  <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">{perso.response_interested}</div>
                                  <button onClick={() => copyToClipboard(perso.response_interested!, `${item.id}-ri`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-ri` ? 'bg-green-500 text-white' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}>
                                    {copiedId === `${item.id}-ri` ? 'Copié' : 'Copier'}
                                  </button>
                                </div>
                              )}
                              {perso?.response_skeptical && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-amber-600 mb-1">Si sceptique :</p>
                                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">{perso.response_skeptical}</div>
                                  <button onClick={() => copyToClipboard(perso.response_skeptical!, `${item.id}-rs`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-rs` ? 'bg-green-500 text-white' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}>
                                    {copiedId === `${item.id}-rs` ? 'Copié' : 'Copier'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="px-4 py-3 border-t bg-neutral-50">
                          {dmSubTab === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => copyToClipboard(item.message, item.id)}
                                className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${
                                  copiedId === item.id ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {copiedId === item.id ? 'Copié !' : 'Copier le texte'}
                              </button>
                              <a
                                href={item.channel === 'tiktok'
                                  ? `https://tiktok.com/@${item.handle.replace('@', '')}`
                                  : `https://instagram.com/${item.handle.replace('@', '')}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex-1 py-2 text-xs font-medium text-white text-center rounded-lg hover:opacity-90 transition ${
                                  item.channel === 'tiktok' ? 'bg-gradient-to-r from-cyan-600 to-blue-600' : 'bg-gradient-to-r from-purple-600 to-pink-600'
                                }`}
                              >
                                Ouvrir {item.channel === 'tiktok' ? 'TikTok' : 'Instagram'}
                              </a>
                              <button
                                onClick={() => updateDmStatus(item.id, 'sent')}
                                className="px-4 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                              >
                                Envoyé
                              </button>
                              <button
                                onClick={() => updateDmStatus(item.id, 'skipped')}
                                className="px-3 py-2 text-xs text-neutral-500 border rounded-lg hover:bg-neutral-100 transition"
                              >
                                Passer
                              </button>
                            </div>
                          )}
                          {dmSubTab === 'sent' && (
                            <div className="space-y-2">
                              {item.followup_message && (
                                <button
                                  onClick={() => copyToClipboard(item.followup_message!, `${item.id}-followup`)}
                                  className={`w-full py-2 text-xs font-medium rounded-lg transition ${
                                    copiedId === `${item.id}-followup` ? 'bg-green-600 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                  }`}
                                >
                                  {copiedId === `${item.id}-followup` ? 'Copié !' : 'Copier la relance'}
                                </button>
                              )}
                              <div className="flex gap-2">
                                <button onClick={() => updateDmStatus(item.id, 'responded', 'interested')} className="flex-1 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">A répondu OUI</button>
                                <button onClick={() => updateDmStatus(item.id, 'responded', 'not_interested')} className="flex-1 py-2 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600">Pas intéressé</button>
                                <button onClick={() => updateDmStatus(item.id, 'no_response')} className="flex-1 py-2 text-xs border rounded-lg hover:bg-neutral-100">Pas de réponse</button>
                              </div>
                            </div>
                          )}
                          {dmSubTab === 'responded' && item.response_type && (
                            <p className={`text-xs font-medium ${item.response_type === 'interested' ? 'text-green-600' : 'text-red-500'}`}>
                              {item.response_type === 'interested' ? 'Intéressé' : 'Pas intéressé'}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Content Publications */}
            {isPubTab && (
              contentPosts.length === 0 ? (
                <div className="text-center py-12 text-neutral-400">
                  {pubSubTab === 'draft'
                    ? `Aucun brouillon ${mainTab === 'pub_instagram' ? 'Instagram' : 'TikTok'}. Lancez l'agent Contenu.`
                    : 'Aucune publication.'}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {contentPosts.map(post => (
                    <div key={post.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      {/* Visual */}
                      {post.visual_url && (
                        <div className="aspect-square bg-neutral-100 relative">
                          <img src={post.visual_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              post.status === 'published' ? 'bg-green-100 text-green-700' :
                              post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                              post.status === 'approved' ? 'bg-purple-100 text-purple-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {post.status === 'published' ? 'Publié' : post.status === 'scheduled' ? 'Planifié' : post.status === 'approved' ? 'Approuvé' : 'Brouillon'}
                            </span>
                            <span className="text-[10px] text-neutral-400">{post.scheduled_date}</span>
                          </div>
                        </div>

                        <p className="text-sm text-neutral-800 line-clamp-4">{post.caption}</p>

                        {post.hashtags && post.hashtags.length > 0 && (
                          <p className="text-[10px] text-blue-500 line-clamp-1">{post.hashtags.join(' ')}</p>
                        )}

                        {post.visual_description && !post.visual_url && (
                          <p className="text-[10px] text-neutral-400 italic">Visuel : {post.visual_description}</p>
                        )}

                        {/* Link to campaign detail if available */}
                        <div className="pt-2 border-t flex gap-2">
                          <button
                            onClick={() => copyToClipboard(post.caption + (post.hashtags?.length ? '\n\n' + post.hashtags.join(' ') : ''), post.id)}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                              copiedId === post.id ? 'bg-green-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                            }`}
                          >
                            {copiedId === post.id ? 'Copié !' : 'Copier'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* SEO Articles */}
            {isSeoTab && (
              blogPosts.length === 0 ? (
                <div className="text-center py-12 text-neutral-400">
                  {pubSubTab === 'draft'
                    ? "Aucun brouillon SEO. Lancez l'agent SEO."
                    : 'Aucun article publié.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {blogPosts.map(article => (
                    <Link
                      key={article.id}
                      href={`/admin/agents/campaign/seo-preview?article_id=${article.id}`}
                      className="block bg-white rounded-xl border border-neutral-200 shadow-sm p-4 hover:border-purple-200 hover:bg-neutral-50 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {article.status === 'published' ? 'Publié' : 'Brouillon'}
                            </span>
                            {article.keywords_primary && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{article.keywords_primary}</span>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold text-neutral-900 line-clamp-1">{article.title}</h3>
                          {article.meta_description && (
                            <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{article.meta_description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-neutral-400">
                            {new Date(article.created_at).toLocaleDateString('fr-FR')}
                          </p>
                          {article.published_at && (
                            <p className="text-[10px] text-green-600">
                              Publié {new Date(article.published_at).toLocaleDateString('fr-FR')}
                            </p>
                          )}
                          {article.slug && article.status === 'published' && (
                            <p className="text-[10px] text-purple-600 mt-0.5">/blog/{article.slug}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
