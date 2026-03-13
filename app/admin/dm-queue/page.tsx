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
  // Visual for prospect
  visual_url?: string;
  // Comment fields
  post_caption?: string;
  post_permalink?: string;
  post_media_url?: string;
  post_likes?: number;
  post_comments?: number;
  strategy_note?: string;
  // Follow fields
  name?: string;
  type?: string;
  city?: string;
  followers?: string;
  reason?: string;
  priority?: number;
  already_prospect?: boolean;
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

type CalendarPost = {
  id: string;
  platform: string;
  format: string;
  pillar: string | null;
  hook: string | null;
  caption: string | null;
  hashtags: string[] | null;
  visual_description: string | null;
  visual_url: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  instagram_permalink: string | null;
  published_at: string | null;
  created_at: string;
};

type MainTab = 'dm_instagram' | 'dm_tiktok' | 'comment_instagram' | 'follow_instagram' | 'follow_tiktok' | 'email' | 'pub_instagram' | 'pub_tiktok' | 'seo' | 'planning';
type DMSubTab = 'pending' | 'sent' | 'responded';
type EmailSubTab = 'all' | 'step1' | 'step2' | 'step3_plus' | 'sent' | 'draft';
type PubSubTab = 'draft' | 'published';

type EmailItem = {
  id: string;
  prospect_id: string;
  type: string;
  description: string;
  data: {
    subject?: string;
    step?: number;
    category?: string;
    provider?: string;
    message_id?: string;
    ai_generated?: boolean;
  } | null;
  created_at: string;
  prospect?: {
    company: string;
    email: string;
    type: string | null;
    status: string | null;
    temperature: string | null;
    email_sequence_step: number | null;
  };
};

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
    const validTabs: MainTab[] = ['dm_instagram', 'dm_tiktok', 'comment_instagram', 'follow_instagram', 'follow_tiktok', 'email', 'pub_instagram', 'pub_tiktok', 'seo', 'planning'];
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
  const [emailSubTab, setEmailSubTab] = useState<EmailSubTab>('all');
  const [emailItems, setEmailItems] = useState<EmailItem[]>([]);
  const [calendarPosts, setCalendarPosts] = useState<CalendarPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);

  // UI
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const router = useRouter();

  const isDmTab = mainTab === 'dm_instagram' || mainTab === 'dm_tiktok';
  const isCommentTab = mainTab === 'comment_instagram';
  const isFollowTab = mainTab === 'follow_instagram' || mainTab === 'follow_tiktok';
  const isPubTab = mainTab === 'pub_instagram' || mainTab === 'pub_tiktok';
  const isSeoTab = mainTab === 'seo';
  const isPlanningTab = mainTab === 'planning';
  const isEmailTab = mainTab === 'email';

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

    if (isDmTab || isCommentTab || isFollowTab) {
      const channel = mainTab === 'dm_instagram' ? 'instagram'
        : mainTab === 'dm_tiktok' ? 'tiktok'
        : mainTab === 'comment_instagram' ? 'comment_instagram'
        : mainTab === 'follow_instagram' ? 'follow_instagram'
        : 'follow_tiktok';
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
    } else if (isPlanningTab) {
      // Load 3 weeks of content calendar (prev, current, next)
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + (calendarWeekOffset * 7));
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);

      const { data } = await supabase
        .from('content_calendar')
        .select('*')
        .gte('scheduled_date', monday.toISOString().split('T')[0])
        .lte('scheduled_date', sunday.toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      setCalendarPosts((data as any) || []);
    } else if (isEmailTab) {
      // Load email activities from crm_activities
      let query = supabase
        .from('crm_activities')
        .select('*, prospect:crm_prospects(company, email, type, status, temperature, email_sequence_step)')
        .eq('type', 'email')
        .order('created_at', { ascending: false });

      if (emailSubTab === 'step1') {
        // Filter step 1 emails only (in JS after fetch since data is JSONB)
      } else if (emailSubTab === 'step2') {
        // Filter step 2
      } else if (emailSubTab === 'step3_plus') {
        // Filter step 3+
      }

      const { data } = await query.limit(100);
      let items = (data as any) || [];

      // Filter by step in JS (data is JSONB, can't filter in PostgREST easily)
      if (emailSubTab === 'step1') {
        items = items.filter((e: any) => e.data?.step === 1);
      } else if (emailSubTab === 'step2') {
        items = items.filter((e: any) => e.data?.step === 2);
      } else if (emailSubTab === 'step3_plus') {
        items = items.filter((e: any) => (e.data?.step || 0) >= 3);
      }

      setEmailItems(items);
    }

    setLoading(false);
  }, [mainTab, dmSubTab, pubSubTab, router, isDmTab, isCommentTab, isFollowTab, isPubTab, isSeoTab, isPlanningTab, isEmailTab, emailSubTab, calendarWeekOffset]);

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
      const isFollow = item.channel?.startsWith('follow_');
      const isComment = item.channel?.startsWith('comment_');

      if (isFollow) {
        // Follow: track follow status in CRM
        if (status === 'sent') {
          prospectUpdates.status = 'contacte';
          prospectUpdates.temperature = 'warm';
          prospectUpdates.last_contact_at = new Date().toISOString();
        } else if (status === 'responded' && responseType === 'interested') {
          // Follow back received
          prospectUpdates.temperature = 'hot';
          prospectUpdates.status = 'repondu';
        }
      } else if (isComment) {
        // Comment: track comment engagement in CRM
        if (status === 'sent') {
          prospectUpdates.last_contact_at = new Date().toISOString();
          // Increment comment count via raw SQL or set warm
          prospectUpdates.temperature = prospectUpdates.temperature === 'hot' ? 'hot' : 'warm';
          if (!['contacte', 'repondu', 'demo', 'sprint', 'client'].includes(item.prospect?.company ? 'contacte' : '')) {
            prospectUpdates.status = 'contacte';
          }
        } else if (status === 'responded' && responseType === 'interested') {
          prospectUpdates.temperature = 'hot';
          prospectUpdates.status = 'repondu';
        }
      } else {
        // DM: existing logic
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
      }
      await supabase.from('crm_prospects').update(prospectUpdates).eq('id', item.prospect_id);

      // Log activity in crm_activities
      if (status === 'sent') {
        await supabase.from('crm_activities').insert({
          prospect_id: item.prospect_id,
          type: isFollow ? 'follow' : isComment ? 'comment' : 'dm_instagram',
          description: isFollow
            ? `Follow ${item.channel?.includes('tiktok') ? 'TikTok' : 'Instagram'}: @${item.handle}`
            : isComment
            ? `Commentaire Instagram sur post de @${item.handle}`
            : `DM ${item.channel?.includes('tiktok') ? 'TikTok' : 'Instagram'} envoye a @${item.handle}`,
          created_at: new Date().toISOString(),
        });
      }
    }

    fetchData();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const startEditDm = (id: string, message: string) => {
    setEditingId(id);
    setEditText(message);
  };

  const saveEditDm = async (id: string) => {
    setSavingEdit(true);
    const supabase = supabaseBrowser();
    await supabase.from('dm_queue').update({ message: editText }).eq('id', id);
    setDmItems(prev => prev.map(item => item.id === id ? { ...item, message: editText } : item));
    setEditingId(null);
    setSavingEdit(false);
  };

  const cancelEditDm = () => {
    setEditingId(null);
    setEditText('');
  };

  const publishPost = async (postId: string) => {
    setPublishingPostId(postId);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', postId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelectedPost(null);
        fetchData();
      } else {
        alert(`Erreur publication: ${data.error || 'Erreur inconnue'}`);
      }
    } catch (e: any) {
      alert(`Erreur: ${e.message}`);
    } finally {
      setPublishingPostId(null);
    }
  };

  if (!isAdmin) return null;

  const MAIN_TABS: { key: MainTab; label: string; icon: string }[] = [
    { key: 'dm_instagram', label: 'DM Instagram', icon: '📸' },
    { key: 'dm_tiktok', label: 'DM TikTok', icon: '🎵' },
    { key: 'comment_instagram', label: 'Commentaires', icon: '💬' },
    { key: 'follow_instagram', label: 'Follow Insta', icon: '👥' },
    { key: 'follow_tiktok', label: 'Follow TikTok', icon: '👥' },
    { key: 'email', label: 'Emails', icon: '📧' },
    { key: 'pub_instagram', label: 'Publi. Instagram', icon: '📷' },
    { key: 'pub_tiktok', label: 'Publi. TikTok', icon: '🎬' },
    { key: 'seo', label: 'Articles SEO', icon: '📝' },
    { key: 'planning', label: 'Planning', icon: '📅' },
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
        <div className="flex flex-wrap gap-1 bg-neutral-100 p-1.5 rounded-xl mb-4">
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
        {(isDmTab || isCommentTab || isFollowTab) && (
          <div className="flex gap-1 bg-neutral-100/50 p-1 rounded-lg mb-6 w-fit">
            {([
              { key: 'pending' as const, label: isFollowTab ? 'A suivre' : isCommentTab ? 'A poster' : 'En attente' },
              { key: 'sent' as const, label: isFollowTab ? 'Suivis' : isCommentTab ? 'Postes' : 'Envoyés' },
              { key: 'responded' as const, label: isFollowTab ? 'Follow back' : isCommentTab ? 'Reponses' : 'Réponses' },
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

        {isEmailTab && (
          <div className="flex gap-1 bg-neutral-100/50 p-1 rounded-lg mb-6 w-fit">
            {([
              { key: 'all' as const, label: 'Tous' },
              { key: 'step1' as const, label: '1er mail' },
              { key: 'step2' as const, label: 'Relance' },
              { key: 'step3_plus' as const, label: 'Step 3+' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setEmailSubTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  emailSubTab === t.key ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
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
            {(isDmTab || isCommentTab || isFollowTab) && (
              dmItems.length === 0 ? (
                <div className="text-center py-12 text-neutral-400">
                  {dmSubTab === 'pending'
                    ? (isCommentTab
                      ? 'Aucun commentaire pret. Lancez le Community Manager > Commentaires.'
                      : isFollowTab
                      ? 'Aucun compte a suivre. Lancez le Community Manager.'
                      : `Aucun DM ${mainTab === 'dm_instagram' ? 'Instagram' : 'TikTok'} en attente. Lancez l'agent DM.`)
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
                          {/* Post context for comment items */}
                          {isCommentTab && perso?.post_media_url && (
                            <div className="mb-3 flex gap-3 bg-neutral-50 rounded-lg p-2 border border-neutral-100">
                              <img src={perso.post_media_url} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold text-neutral-400 mb-0.5">Post du prospect</p>
                                <p className="text-xs text-neutral-600 line-clamp-3">{perso.post_caption || ''}</p>
                                {(perso.post_likes || perso.post_comments) && (
                                  <p className="text-[10px] text-neutral-400 mt-1">{perso.post_likes || 0} likes · {perso.post_comments || 0} commentaires</p>
                                )}
                              </div>
                            </div>
                          )}
                          {isCommentTab && !perso?.post_media_url && perso?.post_caption && (
                            <div className="mb-3 bg-neutral-50 rounded-lg p-2 border border-neutral-100">
                              <p className="text-[10px] font-bold text-neutral-400 mb-0.5">Post du prospect</p>
                              <p className="text-xs text-neutral-600 line-clamp-3">{perso.post_caption}</p>
                            </div>
                          )}

                          {/* Personalized visual for prospect */}
                          {perso?.visual_url && (
                            <div className="mb-3">
                              <p className="text-[10px] font-bold text-purple-500 mb-1">Visuel personnalisé</p>
                              <img src={perso.visual_url} alt={`Visuel pour ${prospect?.company || item.handle}`} className="w-full max-w-[300px] rounded-lg border border-purple-200 shadow-sm" />
                            </div>
                          )}

                          {editingId === item.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full border border-blue-300 rounded-lg p-3 text-sm text-neutral-800 leading-relaxed resize-none focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                rows={Math.max(3, editText.split('\n').length + 1)}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button onClick={() => saveEditDm(item.id)} disabled={savingEdit} className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                  {savingEdit ? 'Sauvegarde...' : 'Sauvegarder'}
                                </button>
                                <button onClick={cancelEditDm} className="px-3 py-1 text-xs font-medium bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300">
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => dmSubTab === 'pending' ? startEditDm(item.id, item.message) : undefined}
                              className={`${isCommentTab ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed ${dmSubTab === 'pending' ? 'cursor-pointer hover:ring-2 hover:ring-blue-300 transition' : ''}`}
                              title={dmSubTab === 'pending' ? 'Cliquer pour modifier' : undefined}
                            >
                              {item.message}
                            </div>
                          )}
                          {isCommentTab && perso?.strategy_note && (
                            <p className="text-[10px] text-neutral-400 mt-1.5 italic">Strategie : {perso.strategy_note}</p>
                          )}
                          {!isCommentTab && persoText && (
                            <p className="text-[10px] text-neutral-400 mt-1.5 italic">
                              Personnalisation : {persoText}
                              {perso?.tone_notes && ` · Ton : ${perso.tone_notes}`}
                            </p>
                          )}
                          {!isCommentTab && !isFollowTab && (
                          <button
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            className="text-[10px] text-blue-500 hover:underline mt-1"
                          >
                            {expandedId === item.id ? 'Masquer' : 'Relances & réponses types'}
                          </button>
                          )}
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
                              {!isFollowTab && (
                                <button
                                  onClick={() => copyToClipboard(item.message, item.id)}
                                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${
                                    copiedId === item.id ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
                                  }`}
                                >
                                  {copiedId === item.id ? 'Copié !' : isCommentTab ? 'Copier commentaire' : 'Copier le texte'}
                                </button>
                              )}
                              {isCommentTab && perso?.post_permalink ? (
                                <a
                                  href={perso.post_permalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 py-2 text-xs font-medium text-white text-center rounded-lg hover:opacity-90 transition bg-gradient-to-r from-purple-600 to-pink-600"
                                >
                                  Ouvrir le post
                                </a>
                              ) : (
                                <a
                                  href={item.channel.includes('tiktok')
                                    ? `https://tiktok.com/@${item.handle.replace('@', '')}`
                                    : `https://instagram.com/${item.handle.replace('@', '')}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex-1 py-2 text-xs font-medium text-white text-center rounded-lg hover:opacity-90 transition ${
                                    item.channel.includes('tiktok') ? 'bg-gradient-to-r from-cyan-600 to-blue-600' : 'bg-gradient-to-r from-purple-600 to-pink-600'
                                  }`}
                                >
                                  Ouvrir {item.channel.includes('tiktok') ? 'TikTok' : 'Instagram'}
                                </a>
                              )}
                              <button
                                onClick={() => updateDmStatus(item.id, 'sent')}
                                className="px-4 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                              >
                                {isFollowTab ? 'Suivi' : isCommentTab ? 'Poste' : 'Envoyé'}
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

            {/* Email Items */}
            {isEmailTab && (
              emailItems.length === 0 ? (
                <div className="text-center py-12 text-neutral-400">
                  Aucun email trouvé pour ce filtre.
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-neutral-500 mb-2">{emailItems.length} emails</p>
                  {emailItems.map((item) => {
                    const prospect = Array.isArray(item.prospect) ? item.prospect[0] : item.prospect;
                    const step = item.data?.step || 0;
                    const subject = item.data?.subject || '';
                    const category = item.data?.category || '';
                    const isAI = item.data?.ai_generated;

                    const stepLabel = step === 1 ? '1er contact' : step === 2 ? 'Relance douce' : step === 3 ? 'Valeur gratuite' : step === 4 ? 'FOMO' : step === 5 ? 'Dernière chance' : step === 10 ? 'Warm' : `Step ${step}`;
                    const stepColor = step === 1 ? 'bg-blue-100 text-blue-700' : step === 2 ? 'bg-orange-100 text-orange-700' : step === 3 ? 'bg-green-100 text-green-700' : step === 4 ? 'bg-red-100 text-red-700' : step === 5 ? 'bg-purple-100 text-purple-700' : 'bg-neutral-100 text-neutral-700';

                    return (
                      <div key={item.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${stepColor}`}>{stepLabel}</span>
                            {isAI && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-100 text-violet-700">IA</span>}
                            {category && <span className="text-[10px] text-neutral-400">{category}</span>}
                          </div>
                          <span className="text-[10px] text-neutral-400">{new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="text-sm font-semibold text-neutral-900">{prospect?.company || 'Inconnu'}</p>
                          <span className="text-xs text-neutral-400">{prospect?.email || ''}</span>
                        </div>
                        {subject && (
                          <p className="text-xs text-neutral-600 mb-1">
                            <span className="font-medium text-neutral-500">Objet :</span> {subject}
                          </p>
                        )}
                        <p className="text-xs text-neutral-500 line-clamp-2">{item.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {prospect?.status && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              prospect.status === 'contacte' ? 'bg-blue-50 text-blue-600' :
                              prospect.status === 'repondu' ? 'bg-green-50 text-green-600' :
                              prospect.status === 'client' ? 'bg-emerald-50 text-emerald-600' :
                              'bg-neutral-50 text-neutral-500'
                            }`}>
                              {prospect.status}
                            </span>
                          )}
                          {prospect?.temperature && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              prospect.temperature === 'hot' ? 'bg-red-50 text-red-600' :
                              prospect.temperature === 'warm' ? 'bg-orange-50 text-orange-600' :
                              'bg-neutral-50 text-neutral-500'
                            }`}>
                              {prospect.temperature}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Planning Calendar */}
            {isPlanningTab && (
              <>
                {/* Week navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setCalendarWeekOffset(w => w - 1)} className="px-3 py-1.5 text-xs bg-white border rounded-lg hover:bg-neutral-50">Semaine prec.</button>
                  <span className="text-sm font-medium text-neutral-700">
                    {(() => {
                      const today = new Date();
                      const monday = new Date(today);
                      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + (calendarWeekOffset * 7));
                      const sunday = new Date(monday);
                      sunday.setDate(sunday.getDate() + 6);
                      return `${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${sunday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                    })()}
                    {calendarWeekOffset !== 0 && (
                      <button onClick={() => setCalendarWeekOffset(0)} className="ml-2 text-[10px] text-purple-600 hover:underline">Aujourd&apos;hui</button>
                    )}
                  </span>
                  <button onClick={() => setCalendarWeekOffset(w => w + 1)} className="px-3 py-1.5 text-xs bg-white border rounded-lg hover:bg-neutral-50">Semaine suiv.</button>
                </div>

                {/* 7-day grid */}
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const today = new Date();
                    const monday = new Date(today);
                    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + (calendarWeekOffset * 7));
                    const dayDate = new Date(monday);
                    dayDate.setDate(dayDate.getDate() + dayIdx);
                    const dateStr = dayDate.toISOString().split('T')[0];
                    const dayPosts = calendarPosts.filter(p => p.scheduled_date === dateStr);
                    const isToday = dateStr === new Date().toISOString().split('T')[0];
                    const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

                    return (
                      <div key={dateStr} className={`min-h-[160px] bg-white rounded-xl border ${isToday ? 'border-purple-400 ring-1 ring-purple-200' : 'border-neutral-200'} p-2`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold ${isToday ? 'text-purple-600' : 'text-neutral-400'}`}>{dayNames[dayIdx]}</span>
                          <span className={`text-xs font-medium ${isToday ? 'text-purple-600' : 'text-neutral-600'}`}>{dayDate.getDate()}</span>
                        </div>
                        <div className="space-y-1.5">
                          {dayPosts.map(post => (
                            <button
                              key={post.id}
                              onClick={() => setSelectedPost(post)}
                              className="w-full text-left rounded-lg overflow-hidden border border-neutral-100 hover:border-purple-300 hover:shadow-sm transition group"
                            >
                              {post.visual_url ? (
                                <div className="aspect-square bg-neutral-100 relative">
                                  <img src={post.visual_url} alt="" className="w-full h-full object-cover" />
                                  <span className={`absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded font-bold ${
                                    post.status === 'published' ? 'bg-green-500 text-white' :
                                    post.status === 'scheduled' ? 'bg-blue-500 text-white' :
                                    'bg-amber-500 text-white'
                                  }`}>
                                    {post.status === 'published' ? 'Publie' : post.status === 'scheduled' ? 'Planifie' : 'Draft'}
                                  </span>
                                </div>
                              ) : (
                                <div className="aspect-square bg-neutral-50 flex items-center justify-center">
                                  <span className="text-2xl opacity-30">{post.platform === 'instagram' ? '📷' : '🎬'}</span>
                                  <span className={`absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded font-bold ${
                                    post.status === 'published' ? 'bg-green-500 text-white' :
                                    'bg-amber-500 text-white'
                                  }`}>
                                    {post.status === 'published' ? 'Publie' : 'Draft'}
                                  </span>
                                </div>
                              )}
                              <p className="text-[9px] text-neutral-600 p-1 line-clamp-2 leading-tight">{post.caption || post.hook || 'Sans caption'}</p>
                            </button>
                          ))}
                          {dayPosts.length === 0 && (
                            <p className="text-[10px] text-neutral-300 text-center py-4">—</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Post detail modal */}
                {selectedPost && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPost(null)}>
                    <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                      {/* Visual */}
                      {selectedPost.visual_url && (
                        <div className="aspect-square bg-neutral-100 relative rounded-t-2xl overflow-hidden">
                          <img src={selectedPost.visual_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="p-5 space-y-3">
                        {/* Status & meta */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            selectedPost.status === 'published' ? 'bg-green-100 text-green-700' :
                            selectedPost.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {selectedPost.status === 'published' ? 'Publie' : selectedPost.status === 'scheduled' ? 'Planifie' : 'Brouillon'}
                          </span>
                          <span className="text-[10px] text-neutral-400">{selectedPost.platform}</span>
                          {selectedPost.format && <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-500">{selectedPost.format}</span>}
                          {selectedPost.pillar && <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 rounded text-purple-600">{selectedPost.pillar}</span>}
                          <span className="text-[10px] text-neutral-400">{selectedPost.scheduled_date}{selectedPost.scheduled_time ? ` ${selectedPost.scheduled_time}` : ''}</span>
                        </div>

                        {/* Hook */}
                        {selectedPost.hook && (
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 mb-0.5">Hook</p>
                            <p className="text-sm font-semibold text-neutral-800">{selectedPost.hook}</p>
                          </div>
                        )}

                        {/* Caption */}
                        {selectedPost.caption && (
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 mb-0.5">Caption</p>
                            <p className="text-sm text-neutral-800 whitespace-pre-wrap">{selectedPost.caption}</p>
                          </div>
                        )}

                        {/* Hashtags */}
                        {selectedPost.hashtags && selectedPost.hashtags.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 mb-0.5">Hashtags</p>
                            <p className="text-xs text-blue-500">{selectedPost.hashtags.join(' ')}</p>
                          </div>
                        )}

                        {/* Visual description */}
                        {selectedPost.visual_description && !selectedPost.visual_url && (
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 mb-0.5">Description visuelle</p>
                            <p className="text-xs text-neutral-500 italic">{selectedPost.visual_description}</p>
                          </div>
                        )}

                        {/* Instagram permalink */}
                        {selectedPost.instagram_permalink && (
                          <a href={selectedPost.instagram_permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline">
                            Voir sur Instagram
                          </a>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2 border-t">
                          {selectedPost.status !== 'published' && (
                            <button
                              onClick={() => publishPost(selectedPost.id)}
                              disabled={publishingPostId === selectedPost.id}
                              className="flex-1 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              {publishingPostId === selectedPost.id ? 'Publication...' : 'Publier maintenant'}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const text = (selectedPost.caption || '') + (selectedPost.hashtags?.length ? '\n\n' + selectedPost.hashtags.join(' ') : '');
                              navigator.clipboard.writeText(text);
                            }}
                            className="flex-1 py-2 text-xs font-medium bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200"
                          >
                            Copier
                          </button>
                          <button onClick={() => setSelectedPost(null)} className="px-4 py-2 text-xs font-medium border rounded-lg hover:bg-neutral-50">
                            Fermer
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
