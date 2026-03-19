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
  instagram_permalink: string | null;
  tiktok_publish_id: string | null;
  tiktok_permalink: string | null;
  linkedin_permalink: string | null;
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
  tiktok_publish_id: string | null;
  tiktok_permalink: string | null;
  linkedin_permalink: string | null;
  published_at: string | null;
  created_at: string;
};

type MainTab = 'dm_instagram' | 'dm_tiktok' | 'email' | 'pub_instagram' | 'pub_tiktok' | 'pub_linkedin' | 'seo' | 'planning';
type DMSubTab = 'pending' | 'sent' | 'responded';
type EmailSubTab = 'all' | 'step1' | 'step2' | 'step3_plus' | 'sent' | 'draft';
type PubSubTab = 'all' | 'draft' | 'published';

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
    const validTabs: MainTab[] = ['dm_instagram', 'dm_tiktok', 'email', 'pub_instagram', 'pub_tiktok', 'pub_linkedin', 'seo', 'planning'];
    if (t && validTabs.includes(t as MainTab)) return t as MainTab;
    return 'dm_instagram' as MainTab;
  })();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>(initialTab);
  const [dmSubTab, setDmSubTab] = useState<DMSubTab>('pending');
  const [pubSubTab, setPubSubTab] = useState<PubSubTab>('all');

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
  const [tabStats, setTabStats] = useState<{ pending: number; sent: number; responded: number }>({ pending: 0, sent: 0, responded: 0 });
  const [emailTypeStats, setEmailTypeStats] = useState<Record<string, number>>({});

  // Date filter
  type DatePreset = '24h' | '7d' | '14d' | 'custom';
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const getDateRange = useCallback((): { from: string; to: string } => {
    const now = new Date();
    const to = now.toISOString();
    if (datePreset === 'custom' && customDateFrom && customDateTo) {
      return { from: new Date(customDateFrom).toISOString(), to: new Date(customDateTo + 'T23:59:59').toISOString() };
    }
    const days = datePreset === '24h' ? 1 : datePreset === '14d' ? 14 : 7;
    const from = new Date(now.getTime() - days * 86400000).toISOString();
    return { from, to };
  }, [datePreset, customDateFrom, customDateTo]);

  // UI
  const [pubViewMode, setPubViewMode] = useState<'list' | 'card'>('card');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const router = useRouter();

  const isDmTab = mainTab === 'dm_instagram' || mainTab === 'dm_tiktok';
  const isPubTab = mainTab === 'pub_instagram' || mainTab === 'pub_tiktok' || mainTab === 'pub_linkedin';
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

    if (isDmTab) {
      const channel = mainTab === 'dm_instagram' ? 'instagram' : 'tiktok';

      const { from: dateFrom, to: dateTo } = getDateRange();

      // Fetch counts for mini dashboard (filtered by date)
      const [{ count: pendingCount }, { count: sentCount }, { count: respondedCount }] = await Promise.all([
        supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('channel', channel).eq('status', 'pending').gte('created_at', dateFrom).lte('created_at', dateTo),
        supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('channel', channel).in('status', ['sent', 'no_response']).gte('created_at', dateFrom).lte('created_at', dateTo),
        supabase.from('dm_queue').select('id', { count: 'exact', head: true }).eq('channel', channel).eq('status', 'responded').gte('created_at', dateFrom).lte('created_at', dateTo),
      ]);
      setTabStats({ pending: pendingCount ?? 0, sent: sentCount ?? 0, responded: respondedCount ?? 0 });

      let query = supabase
        .from('dm_queue')
        .select('*, prospect:crm_prospects(company, type, quartier, google_rating, google_reviews, score)')
        .eq('channel', channel)
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo)
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
      const network = mainTab === 'pub_instagram' ? 'instagram' : mainTab === 'pub_linkedin' ? 'linkedin' : 'tiktok';
      let query = supabase
        .from('content_calendar')
        .select('*')
        .eq('platform', network)
        .order('scheduled_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (pubSubTab === 'draft') {
        // Show all posts not actually published on platform
        // We fetch all and filter client-side since we need to check permalink fields
      } else if (pubSubTab === 'published') {
        // Only show posts actually published on platform
        query = query.eq('status', 'published');
        if (network === 'instagram') {
          query = query.not('instagram_permalink', 'is', null);
        } else if (network === 'linkedin') {
          query = query.not('linkedin_permalink', 'is', null);
        } else {
          query = query.not('tiktok_publish_id', 'is', null);
        }
      }
      // 'all' — no filter, show everything

      const { data } = await query.limit(100);
      let filtered = (data as any) || [];
      if (pubSubTab === 'draft') {
        // Show posts that are NOT actually published on the platform
        filtered = filtered.filter((p: any) =>
          !(p.status === 'published' && (p.instagram_permalink || p.tiktok_publish_id))
        );
      }
      setContentPosts(filtered);
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
      const { from: dateFrom, to: dateTo } = getDateRange();

      // Load email stats for mini dashboard (filtered by date)
      const [{ count: totalEmails }, { count: openedEmails }, { count: repliedEmails }] = await Promise.all([
        supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('type', 'email').gte('created_at', dateFrom).lte('created_at', dateTo),
        supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('type', 'email_opened').gte('created_at', dateFrom).lte('created_at', dateTo),
        supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('type', 'email_replied').gte('created_at', dateFrom).lte('created_at', dateTo),
      ]);

      // Try crm_activities first
      let query = supabase
        .from('crm_activities')
        .select('*, prospect:crm_prospects(company, email, type, status, temperature, email_sequence_step)')
        .eq('type', 'email')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo)
        .order('created_at', { ascending: false });

      const { data } = await query.limit(200);
      let items = (data as any) || [];

      // Fallback: if crm_activities has no emails, load from agent_logs
      if (items.length === 0) {
        const { data: logItems } = await supabase
          .from('agent_logs')
          .select('*')
          .eq('agent', 'email')
          .eq('action', 'email_sent')
          .gte('created_at', dateFrom)
          .lte('created_at', dateTo)
          .order('created_at', { ascending: false })
          .limit(200);

        if (logItems && logItems.length > 0) {
          items = logItems.map((log: any) => ({
            id: log.id,
            prospect_id: log.data?.prospect_id,
            type: 'email',
            description: `Email step ${log.data?.step || '?'} envoyé: "${log.data?.subject || ''}"`,
            data: {
              step: log.data?.step,
              subject: log.data?.subject,
              category: log.data?.category || '',
              provider: log.data?.provider,
              message_id: log.data?.message_id,
            },
            prospect: { company: log.data?.company || '', email: log.data?.prospect_email || '' },
            created_at: log.created_at,
          }));
        }
      }

      // Compute type distribution from all emails
      const typeDist: Record<string, number> = {};
      for (const item of items) {
        const cat = item.data?.category || (item.prospect as any)?.type || 'autre';
        typeDist[cat] = (typeDist[cat] || 0) + 1;
      }
      setEmailTypeStats(typeDist);

      // Use total from crm_activities if available, otherwise use items count
      const total = (totalEmails ?? 0) > 0 ? (totalEmails ?? 0) : items.length;
      setTabStats({ pending: total, sent: openedEmails ?? 0, responded: repliedEmails ?? 0 });

      // Filter by step in JS (data is JSONB)
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
  }, [mainTab, dmSubTab, pubSubTab, router, isDmTab, isPubTab, isSeoTab, isPlanningTab, isEmailTab, emailSubTab, calendarWeekOffset, getDateRange]);

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

  const republishSinglePost = async (postId: string) => {
    setPublishingPostId(postId);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'republish_single', postId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelectedPost(null);
        fetchData();
      } else {
        alert(`Erreur republication: ${data.error || 'Erreur inconnue'}`);
      }
    } catch (e: any) {
      alert(`Erreur: ${e.message}`);
    } finally {
      setPublishingPostId(null);
    }
  };

  const regenerateImage = async (postId: string) => {
    setPublishingPostId(postId);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate_image', postId }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchData();
        if (selectedPost?.id === postId) {
          setSelectedPost({ ...selectedPost, visual_url: data.visual_url });
        }
      } else {
        alert(`Erreur régénération: ${data.error || 'Erreur inconnue'}`);
      }
    } catch (e: any) {
      alert(`Erreur: ${e.message}`);
    } finally {
      setPublishingPostId(null);
    }
  };

  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [fixingImages, setFixingImages] = useState(false);

  const fixAllBrokenImages = async () => {
    setFixingImages(true);
    try {
      const res = await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fix_broken_images' }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`Images reparees: ${data.fixed} corrigees, ${data.failed} echouees`);
        setBrokenImages(new Set());
        fetchData();
      } else {
        alert(`Erreur: ${data.error || 'Erreur inconnue'}`);
      }
    } catch (e: any) {
      alert(`Erreur: ${e.message}`);
    } finally {
      setFixingImages(false);
    }
  };

  if (!isAdmin) return null;

  const MAIN_TABS: { key: MainTab; label: string; icon: string }[] = [
    { key: 'dm_instagram', label: 'DM Instagram', icon: '📸' },
    { key: 'dm_tiktok', label: 'DM TikTok', icon: '🎵' },
    { key: 'email', label: 'Emails', icon: '📧' },
    { key: 'pub_instagram', label: 'Publi. Instagram', icon: '📷' },
    { key: 'pub_tiktok', label: 'Publi. TikTok', icon: '🎬' },
    { key: 'pub_linkedin', label: 'Publi. LinkedIn', icon: '💼' },
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
            {brokenImages.size > 0 && (
              <button
                onClick={fixAllBrokenImages}
                disabled={fixingImages}
                className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-200 disabled:opacity-50"
              >
                {fixingImages ? 'Reparation...' : `Reparer ${brokenImages.size} image(s)`}
              </button>
            )}
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
              onClick={() => { setMainTab(t.key); setDmSubTab('pending'); setPubSubTab('all'); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                mainTab === t.key ? 'bg-white shadow text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Date Filter */}
        {(isDmTab || isEmailTab) && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(['24h', '7d', '14d', 'custom'] as const).map(p => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                  datePreset === p ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-purple-300'
                }`}
              >
                {p === '24h' ? '24h' : p === '7d' ? '7 jours' : p === '14d' ? '2 semaines' : 'Personnalise'}
              </button>
            ))}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={e => setCustomDateFrom(e.target.value)}
                  className="px-2 py-1 text-xs border rounded-lg bg-white"
                />
                <span className="text-xs text-neutral-400">a</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={e => setCustomDateTo(e.target.value)}
                  className="px-2 py-1 text-xs border rounded-lg bg-white"
                />
              </div>
            )}
          </div>
        )}

        {/* Mini Dashboard */}
        {(isDmTab || isEmailTab) && !loading && (tabStats.pending > 0 || tabStats.sent > 0 || tabStats.responded > 0) && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
              <p className="text-2xl font-bold text-amber-700">{tabStats.pending}</p>
              <p className="text-[10px] text-amber-600 font-medium">{isEmailTab ? 'Emails envoyes' : 'En attente'}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
              <p className="text-2xl font-bold text-green-700">{tabStats.sent}</p>
              <p className="text-[10px] text-green-600 font-medium">{isEmailTab ? 'Ouverts' : 'Envoyes'}</p>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3 text-center border border-neutral-200">
              <p className="text-2xl font-bold text-neutral-800">{tabStats.responded}</p>
              <p className="text-[10px] text-neutral-600 font-medium">{isEmailTab ? 'Reponses' : 'Reponses'}</p>
            </div>
          </div>
        )}

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
              { key: 'all' as const, label: 'Tout' },
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

        {/* Email Type Distribution */}
        {isEmailTab && Object.keys(emailTypeStats).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(emailTypeStats).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <span key={type} className="text-[10px] px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100 font-medium">
                {type}: {count}
              </span>
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
            {isDmTab && (
              dmItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-neutral-400 mb-4">
                  {dmSubTab === 'pending'
                    ? `Aucun DM ${mainTab === 'dm_instagram' ? 'Instagram' : 'TikTok'} en attente.`
                    : 'Aucun élément.'}
                  </p>
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
                                className="w-full border border-[#0c1a3a]/20 rounded-lg p-3 text-sm text-neutral-800 leading-relaxed resize-none focus:ring-2 focus:ring-[#0c1a3a] focus:outline-none"
                                rows={Math.max(3, editText.split('\n').length + 1)}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button onClick={() => saveEditDm(item.id)} disabled={savingEdit} className="px-3 py-1 text-xs font-medium bg-[#0c1a3a] text-white rounded-lg hover:bg-[#1e3a5f] disabled:opacity-50">
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
                              className={`bg-neutral-50 border-neutral-200 border rounded-lg p-3 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed ${dmSubTab === 'pending' ? 'cursor-pointer hover:ring-2 hover:ring-[#0c1a3a]/20 transition' : ''}`}
                              title={dmSubTab === 'pending' ? 'Cliquer pour modifier' : undefined}
                            >
                              {item.message}
                            </div>
                          )}
                          {persoText && (
                            <p className="text-[10px] text-neutral-400 mt-1.5 italic">
                              Personnalisation : {persoText}
                              {perso?.tone_notes && ` · Ton : ${perso.tone_notes}`}
                            </p>
                          )}
                          <button
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            className="text-[10px] text-[#0c1a3a] hover:underline mt-1"
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
                                  copiedId === item.id ? 'bg-green-600 text-white' : 'bg-[#0c1a3a] text-white hover:bg-[#1e3a5f]'
                                }`}
                              >
                                {copiedId === item.id ? 'Copié !' : 'Copier le texte'}
                              </button>
                              <a
                                href={item.channel.includes('tiktok')
                                  ? `https://tiktok.com/@${item.handle.replace('@', '')}`
                                  : `https://instagram.com/${item.handle.replace('@', '')}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex-1 py-2 text-xs font-medium text-white text-center rounded-lg hover:opacity-90 transition ${
                                  item.channel.includes('tiktok') ? 'bg-gradient-to-r from-cyan-600 to-[#1e3a5f]' : 'bg-gradient-to-r from-purple-600 to-pink-600'
                                }`}
                              >
                                Ouvrir {item.channel.includes('tiktok') ? 'TikTok' : 'Instagram'}
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
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-neutral-500">{contentPosts.length} post{contentPosts.length !== 1 ? 's' : ''}</p>
                <div className="flex items-center gap-3">
                  {/* View mode toggle */}
                  <div className="flex bg-neutral-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setPubViewMode('card')}
                      className={`px-2 py-1 text-[10px] font-medium rounded-md transition ${pubViewMode === 'card' ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                      Cartes
                    </button>
                    <button
                      onClick={() => setPubViewMode('list')}
                      className={`px-2 py-1 text-[10px] font-medium rounded-md transition ${pubViewMode === 'list' ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                      Liste
                    </button>
                  </div>
                  {mainTab === 'pub_instagram' && pubSubTab === 'published' && (
                    <button
                      onClick={async () => {
                        const btn = document.getElementById('republish-btn');
                        if (btn) { btn.textContent = '⏳ Republication...'; (btn as HTMLButtonElement).disabled = true; }
                        try {
                          const res = await fetch('/api/agents/content', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'republish', limit: 10 }),
                          });
                          const data = await res.json();
                          if (btn) btn.textContent = data.ok ? `✅ ${data.republished}/${data.total} republiés` : `❌ ${data.error}`;
                          setTimeout(() => { if (btn) { btn.textContent = '🔄 Republier sur Instagram'; (btn as HTMLButtonElement).disabled = false; } fetchData(); }, 3000);
                        } catch (e: any) {
                          if (btn) { btn.textContent = `❌ Erreur`; (btn as HTMLButtonElement).disabled = false; }
                        }
                      }}
                      id="republish-btn"
                      className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      🔄 Republier sur Instagram
                    </button>
                  )}
                  <button
                    onClick={() => setMainTab('planning' as MainTab)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    📅 Voir le planning
                  </button>
                </div>
              </div>
            )}
            {isPubTab && (
              contentPosts.length === 0 ? (
                <div className="text-center py-12 text-neutral-400">
                  {pubSubTab === 'draft'
                    ? `Aucun brouillon ${mainTab === 'pub_instagram' ? 'Instagram' : mainTab === 'pub_linkedin' ? 'LinkedIn' : 'TikTok'}. Lancez l'agent Contenu.`
                    : pubSubTab === 'published'
                    ? 'Aucune publication.'
                    : `Aucun post ${mainTab === 'pub_instagram' ? 'Instagram' : mainTab === 'pub_linkedin' ? 'LinkedIn' : 'TikTok'}. Lancez l'agent Contenu.`}
                </div>
              ) : pubViewMode === 'card' ? (
                /* ===== CARD VIEW ===== */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {contentPosts.map(post => {
                    const isPublished = post.status === 'published' && (post.instagram_permalink || post.tiktok_publish_id || post.linkedin_permalink);
                    const platformLabel = post.platform === 'tiktok' ? 'TikTok' : post.platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
                    const platformShort = post.platform === 'tiktok' ? 'TT' : post.platform === 'linkedin' ? 'LI' : 'IG';
                    return (
                      <div
                        key={post.id}
                        className="group bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden cursor-pointer hover:border-purple-300 hover:shadow-md transition-all"
                        onClick={() => setSelectedPost(post as any)}
                      >
                        {/* Image / Platform mockup */}
                        <div className={`relative ${post.platform === 'tiktok' ? 'aspect-[9/16] max-h-64' : 'aspect-square'} bg-neutral-100`}>
                          {post.visual_url && !brokenImages.has(post.id) ? (
                            <img
                              src={post.visual_url}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={() => setBrokenImages(prev => new Set(prev).add(post.id))}
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                              <span className="text-3xl opacity-20">{post.platform === 'tiktok' ? '🎬' : post.platform === 'linkedin' ? '💼' : '📷'}</span>
                              <span className="text-[10px] text-neutral-300">Pas de visuel</span>
                            </div>
                          )}
                          {/* Platform badge overlay */}
                          <div className={`absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold backdrop-blur-sm ${
                            post.platform === 'tiktok' ? 'bg-black/70 text-white' :
                            post.platform === 'linkedin' ? 'bg-blue-600/80 text-white' :
                            'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white'
                          }`}>{platformShort}</div>
                          {/* Status badge overlay */}
                          <div className={`absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold backdrop-blur-sm ${
                            isPublished ? 'bg-green-500/80 text-white' :
                            post.status === 'scheduled' ? 'bg-blue-500/80 text-white' :
                            post.status === 'approved' ? 'bg-purple-500/80 text-white' :
                            'bg-amber-500/80 text-white'
                          }`}>
                            {isPublished ? '✓' : post.status === 'scheduled' ? '⏰' : post.status === 'approved' ? '✓' : '✎'}
                          </div>
                          {/* Quick actions on hover */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1">
                              {!isPublished && (
                                <button
                                  onClick={() => post.status === 'published' ? republishSinglePost(post.id) : publishPost(post.id)}
                                  disabled={publishingPostId === post.id}
                                  className="px-2 py-1 text-[10px] font-bold bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                                >
                                  {publishingPostId === post.id ? '...' : 'Publier'}
                                </button>
                              )}
                              <button
                                onClick={() => copyToClipboard(post.caption + (post.hashtags?.length ? '\n\n' + post.hashtags.join(' ') : ''), post.id)}
                                className={`px-2 py-1 text-[10px] font-bold rounded-md ${
                                  copiedId === post.id ? 'bg-green-600 text-white' : 'bg-white/90 text-neutral-800 hover:bg-white'
                                }`}
                              >
                                {copiedId === post.id ? '✓' : 'Copier'}
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Card info */}
                        <div className="p-2.5">
                          <p className="text-[11px] text-neutral-800 line-clamp-2 leading-snug font-medium">{post.caption || 'Sans caption'}</p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[10px] text-neutral-400">{post.scheduled_date}</span>
                            {post.hashtags && post.hashtags.length > 0 && (
                              <span className="text-[10px] text-purple-400">{post.hashtags.length} tags</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ===== LIST VIEW (original) ===== */
                <div className="space-y-2">
                  {contentPosts.map(post => (
                    <div key={post.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden flex cursor-pointer hover:border-purple-200 transition" onClick={() => setSelectedPost(post as any)}>
                      {/* Thumbnail */}
                      <div className="w-20 h-20 shrink-0 bg-neutral-100 relative">
                        {post.visual_url && !brokenImages.has(post.id) ? (
                          <img
                            src={post.visual_url}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={() => setBrokenImages(prev => new Set(prev).add(post.id))}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-lg opacity-30">{post.visual_url ? '🖼️' : '📷'}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 px-3 py-2 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              post.status === 'published' && (post.instagram_permalink || post.tiktok_publish_id || post.linkedin_permalink) ? 'bg-green-100 text-green-700' :
                              post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                              post.status === 'approved' ? 'bg-purple-100 text-purple-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {post.status === 'published' && (post.instagram_permalink || post.tiktok_publish_id || post.linkedin_permalink) ? 'Publié' :
                               post.status === 'scheduled' ? 'Planifié' :
                               post.status === 'approved' ? 'Approuvé' : 'Brouillon'}
                            </span>
                            <span className="text-[10px] text-neutral-400">{post.scheduled_date}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              post.platform === 'tiktok' ? 'bg-neutral-900 text-white' :
                              post.platform === 'linkedin' ? 'bg-blue-100 text-blue-700' :
                              'bg-pink-100 text-pink-700'
                            }`}>{post.platform === 'tiktok' ? 'TT' : post.platform === 'linkedin' ? 'LI' : 'IG'}</span>
                          </div>
                          <p className="text-xs text-neutral-800 line-clamp-2 leading-snug">{post.caption}</p>
                        </div>

                        {/* Compact actions */}
                        <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                          {!(post.instagram_permalink || post.tiktok_publish_id || post.linkedin_permalink) && (
                            <button
                              onClick={() => post.status === 'published' ? republishSinglePost(post.id) : publishPost(post.id)}
                              disabled={publishingPostId === post.id}
                              className="px-2 py-1 text-[10px] font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
                            >
                              {publishingPostId === post.id ? '...' : 'Publier'}
                            </button>
                          )}
                          {brokenImages.has(post.id) && post.visual_description && (
                            <button
                              onClick={() => regenerateImage(post.id)}
                              disabled={publishingPostId === post.id}
                              className="px-2 py-1 text-[10px] bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                            >
                              {publishingPostId === post.id ? '...' : 'Regen'}
                            </button>
                          )}
                          <button
                            onClick={() => copyToClipboard(post.caption + (post.hashtags?.length ? '\n\n' + post.hashtags.join(' ') : ''), post.id)}
                            className={`px-2 py-1 text-[10px] font-medium rounded-lg transition ${
                              copiedId === post.id ? 'bg-green-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                            }`}
                          >
                            {copiedId === post.id ? '✓' : 'Copier'}
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
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{article.keywords_primary}</span>
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
                              prospect.status === 'contacte' ? 'bg-blue-50 text-blue-700' :
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
                              {post.visual_url && !brokenImages.has(post.id) ? (
                                <div className="aspect-square bg-neutral-100 relative">
                                  <img src={post.visual_url} alt="" className="w-full h-full object-cover" onError={() => setBrokenImages(prev => new Set(prev).add(post.id))} />
                                  <span className={`absolute top-1 left-1 text-[8px] px-1 py-0.5 rounded font-bold ${
                                    post.platform === 'instagram' ? 'bg-pink-500 text-white' :
                                    post.platform === 'tiktok' ? 'bg-black text-white' :
                                    'bg-[#0c1a3a] text-white'
                                  }`}>
                                    {post.platform === 'instagram' ? 'IG' : post.platform === 'tiktok' ? 'TT' : 'LI'}
                                  </span>
                                  <span className={`absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded font-bold ${
                                    post.status === 'published' && (post.instagram_permalink || post.tiktok_publish_id || post.linkedin_permalink) ? 'bg-green-500 text-white' :
                                    post.status === 'scheduled' ? 'bg-[#0c1a3a] text-white' :
                                    'bg-amber-500 text-white'
                                  }`}>
                                    {post.status === 'published' && (post.instagram_permalink || post.tiktok_publish_id || post.linkedin_permalink) ? 'OK' : post.status === 'scheduled' ? 'Plan' : 'Draft'}
                                  </span>
                                </div>
                              ) : (
                                <div className="aspect-square bg-neutral-50 flex flex-col items-center justify-center relative">
                                  <span className="text-2xl opacity-30">{post.platform === 'instagram' ? '📷' : post.platform === 'tiktok' ? '🎵' : '💼'}</span>
                                  <span className={`absolute top-1 left-1 text-[8px] px-1 py-0.5 rounded font-bold ${
                                    post.platform === 'instagram' ? 'bg-pink-500 text-white' :
                                    post.platform === 'tiktok' ? 'bg-black text-white' :
                                    'bg-[#0c1a3a] text-white'
                                  }`}>
                                    {post.platform === 'instagram' ? 'IG' : post.platform === 'tiktok' ? 'TT' : 'LI'}
                                  </span>
                                  <span className={`absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded font-bold ${
                                    post.status === 'published' ? 'bg-green-500 text-white' :
                                    'bg-amber-500 text-white'
                                  }`}>
                                    {post.status === 'published' ? 'OK' : 'Draft'}
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
                      {/* Social media preview mockup */}
                      <div className={`rounded-t-2xl overflow-hidden ${
                        selectedPost.platform === 'instagram' ? 'bg-gradient-to-br from-pink-50 to-purple-50' :
                        selectedPost.platform === 'tiktok' ? 'bg-neutral-900' :
                        'bg-[#f3f6f8]'
                      }`}>
                        {/* Platform header bar */}
                        <div className={`flex items-center gap-2 px-4 py-2.5 ${
                          selectedPost.platform === 'tiktok' ? 'text-white' : 'text-neutral-800'
                        }`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            selectedPost.platform === 'instagram' ? 'bg-gradient-to-br from-pink-500 to-purple-500 text-white' :
                            selectedPost.platform === 'tiktok' ? 'bg-white text-black' :
                            'bg-blue-600 text-white'
                          }`}>K</div>
                          <div>
                            <p className={`text-xs font-bold ${selectedPost.platform === 'tiktok' ? 'text-white' : 'text-neutral-900'}`}>keiroai</p>
                            <p className={`text-[10px] ${selectedPost.platform === 'tiktok' ? 'text-neutral-400' : 'text-neutral-500'}`}>{selectedPost.scheduled_date}</p>
                          </div>
                        </div>
                        {/* Visual */}
                        {selectedPost.visual_url && !brokenImages.has(selectedPost.id) ? (
                          <div className={`${selectedPost.platform === 'tiktok' ? 'aspect-[9/16] max-h-80' : 'aspect-square max-h-80'} bg-neutral-100 relative`}>
                            <img
                              src={selectedPost.visual_url}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={() => setBrokenImages(prev => new Set(prev).add(selectedPost.id))}
                            />
                          </div>
                        ) : (
                          <div className="h-48 bg-neutral-100 flex items-center justify-center gap-3">
                            <span className="text-2xl opacity-30">{selectedPost.visual_url ? '🖼️' : '📷'}</span>
                            <span className="text-xs text-neutral-400">{selectedPost.visual_url ? 'Image expirée' : 'Pas d\'image'}</span>
                            {selectedPost.visual_description && (
                              <button
                                onClick={() => regenerateImage(selectedPost.id)}
                                disabled={publishingPostId === selectedPost.id}
                                className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                              >
                                {publishingPostId === selectedPost.id ? '...' : 'Régénérer'}
                              </button>
                            )}
                          </div>
                        )}
                        {/* Engagement mockup bar */}
                        <div className={`flex items-center gap-4 px-4 py-2 ${
                          selectedPost.platform === 'tiktok' ? 'text-white/60' : 'text-neutral-400'
                        }`}>
                          <span className="text-sm">♡</span>
                          <span className="text-sm">💬</span>
                          <span className="text-sm">↗</span>
                          {selectedPost.platform === 'instagram' && <span className="text-sm ml-auto">⊡</span>}
                        </div>
                      </div>

                      <div className="p-5 space-y-3">
                        {/* Status & meta */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            selectedPost.status === 'published' && (selectedPost.instagram_permalink || selectedPost.tiktok_publish_id || selectedPost.linkedin_permalink) ? 'bg-green-100 text-green-700' :
                            selectedPost.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {selectedPost.status === 'published' && selectedPost.instagram_permalink ? 'Publié sur IG' :
                             selectedPost.status === 'published' && selectedPost.tiktok_publish_id ? 'Publié sur TikTok' :
                             selectedPost.status === 'published' && selectedPost.linkedin_permalink ? 'Publié sur LinkedIn' :
                             selectedPost.status === 'scheduled' ? 'Planifié' : 'Brouillon'}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            selectedPost.platform === 'instagram' ? 'bg-pink-100 text-pink-700' :
                            selectedPost.platform === 'tiktok' ? 'bg-neutral-900 text-white' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {selectedPost.platform === 'instagram' ? 'Instagram' : selectedPost.platform === 'tiktok' ? 'TikTok' : 'LinkedIn'}
                          </span>
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
                            <p className="text-xs text-blue-600">{selectedPost.hashtags.join(' ')}</p>
                          </div>
                        )}

                        {/* Visual description */}
                        {selectedPost.visual_description && !selectedPost.visual_url && (
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 mb-0.5">Description visuelle</p>
                            <p className="text-xs text-neutral-500 italic">{selectedPost.visual_description}</p>
                          </div>
                        )}

                        {/* Platform permalinks */}
                        {selectedPost.instagram_permalink && (
                          <a href={selectedPost.instagram_permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-pink-600 hover:underline">
                            Voir sur Instagram
                          </a>
                        )}
                        {selectedPost.tiktok_permalink && (
                          <a href={selectedPost.tiktok_permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-neutral-700 hover:underline">
                            Voir sur TikTok
                          </a>
                        )}
                        {selectedPost.linkedin_permalink && (
                          <a href={selectedPost.linkedin_permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            Voir sur LinkedIn
                          </a>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2 border-t flex-wrap">
                          {/* Republish: published but NOT actually on the platform */}
                          {!(selectedPost.instagram_permalink || selectedPost.tiktok_publish_id || selectedPost.linkedin_permalink) && (
                            <button
                              onClick={() => selectedPost.status === 'published' ? republishSinglePost(selectedPost.id) : publishPost(selectedPost.id)}
                              disabled={publishingPostId === selectedPost.id}
                              className="flex-1 py-2 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                              {publishingPostId === selectedPost.id ? 'Publication...' : `Publier sur ${selectedPost.platform === 'tiktok' ? 'TikTok' : selectedPost.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'}`}
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
