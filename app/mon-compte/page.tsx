"use client";

import { useEffect, useState, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import FeedbackPopup from '@/components/FeedbackPopup';
import FeedbackModal from '@/components/FeedbackModal';
import { useFeedbackPopup } from '@/hooks/useFeedbackPopup';

import { PLAN_CREDITS, CREDIT_PACKS, FEATURE_LABELS } from '@/lib/credits/constants';

// Plan definitions
const PLANS: Record<string, { name: string; price: string; credits: number; color: string }> = {
  free: { name: 'Gratuit', price: '0€', credits: PLAN_CREDITS.free, color: '#9CA3AF' },
  sprint: { name: 'Sprint Fondateur', price: '4,99€', credits: PLAN_CREDITS.sprint, color: '#3B82F6' },
  solo: { name: 'Solo', price: '49€', credits: PLAN_CREDITS.solo, color: '#3B82F6' },
  fondateurs: { name: 'Fondateurs', price: '149€', credits: PLAN_CREDITS.fondateurs, color: '#8B5CF6' },
  standard: { name: 'Standard', price: '199€', credits: PLAN_CREDITS.standard, color: '#06B6D4' },
  business: { name: 'Business', price: '349€', credits: PLAN_CREDITS.business, color: '#F59E0B' },
  elite: { name: 'Elite', price: '999€', credits: PLAN_CREDITS.elite, color: '#EF4444' },
  admin: { name: 'Admin', price: '—', credits: 999999, color: '#10B981' },
};

export default function MonCompteWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <MonComptePage />
    </Suspense>
  );
}

function MonComptePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [instagramPosts, setInstagramPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState({ images: 0, videos: 0 });
  const searchParams = useSearchParams();
  const initialSection = searchParams.get('section') === 'admin-feedback' ? 'admin-feedback' : 'overview';
  const [activeSection, setActiveSection] = useState<'overview' | 'billing' | 'connections' | 'support' | 'admin-feedback'>(initialSection as any);

  // Credits state
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [creditsMonthly, setCreditsMonthly] = useState(0);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [creditHistory, setCreditHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [customCredits, setCustomCredits] = useState(100);
  const feedback = useFeedbackPopup();

  // User support state
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [myRequestsLoading, setMyRequestsLoading] = useState(false);
  const [selectedMyRequest, setSelectedMyRequest] = useState<any>(null);
  const [userReply, setUserReply] = useState('');
  const [userReplyLoading, setUserReplyLoading] = useState(false);

  // Admin feedback state
  const [adminFeedbackTab, setAdminFeedbackTab] = useState<'questionnaires' | 'demandes'>('questionnaires');
  const [feedbackStats, setFeedbackStats] = useState<any>(null);
  const [feedbackComments, setFeedbackComments] = useState<any[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [contactRequests, setContactRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [adminReply, setAdminReply] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  const supabase = useMemo(() => supabaseBrowser(), []);

  // Déterminer le plan actuel
  const currentPlan = useMemo(() => {
    const planKey = profile?.subscription_plan || (user?.app_metadata?.role === 'admin' ? 'admin' : 'fondateurs');
    return PLANS[planKey] || PLANS['fondateurs'];
  }, [profile, user]);

  useEffect(() => {
    const init = async () => {
      try {
        // getSession() lit les cookies locaux - rapide et fiable
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          await loadUserData(session.user);
        } else {
          // Pas de session → rediriger
          router.replace('/login');
        }
      } catch (error) {
        console.error('[MonCompte] Auth error:', error);
        router.replace('/login');
      }
    };
    init();
  }, []);

  const loadUserData = async (currentUser: any) => {
    try {
      setUser(currentUser);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      setProfile(profileData);

      // Charger les stats mensuelles
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [imgRes, vidRes] = await Promise.all([
        supabase.from('saved_images').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id).gte('created_at', startOfMonth),
        supabase.from('my_videos').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id).gte('created_at', startOfMonth),
      ]);

      setMonthlyStats({
        images: imgRes.count || 0,
        videos: vidRes.count || 0,
      });

      // Charger crédits
      setCreditsBalance(profileData?.credits_balance ?? 0);
      setCreditsMonthly(profileData?.credits_monthly_allowance ?? 0);

      // Si Instagram est connecté, charger les posts récents
      if (profileData?.instagram_business_account_id) {
        loadInstagramPosts();
      }
    } catch (error) {
      console.error('[MonCompte] Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calcul prix unitaire dégressif (sliding scale basé sur les packs)
  // 1-49cr: 0,30€/cr | 50-149cr: 0,30€/cr | 150-299cr: 0,27€/cr | 300+: 0,23€/cr
  const getCustomCreditPrice = (qty: number): { total: number; perCredit: number } => {
    let perCredit: number;
    if (qty >= 300) perCredit = 0.23;
    else if (qty >= 150) perCredit = 0.27;
    else perCredit = 0.30;
    return { total: Math.round(qty * perCredit * 100) / 100, perCredit };
  };

  const customPrice = getCustomCreditPrice(customCredits);

  // Admin: charger feedback stats
  const loadFeedbackStats = async () => {
    try {
      const res = await fetch('/api/feedback');
      if (res.ok) {
        const data = await res.json();
        setFeedbackStats(data.stats);
        setFeedbackComments(data.comments || []);
        setFeedbackTotal(data.total || 0);
      }
    } catch (e) { console.error('[Admin] Feedback load error:', e); }
  };

  // Admin: charger demandes clients
  const loadContactRequests = async () => {
    try {
      const res = await fetch('/api/contact-requests');
      if (res.ok) {
        const data = await res.json();
        setContactRequests(data.requests || []);
      }
    } catch (e) { console.error('[Admin] Contacts load error:', e); }
  };

  // Admin: répondre à une demande
  const handleAdminReply = async (requestId: string) => {
    if (!adminReply.trim()) return;
    setAdminLoading(true);
    try {
      const res = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: adminReply }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRequest(data.request);
        setContactRequests(prev => prev.map(r => r.id === requestId ? data.request : r));
        setAdminReply('');
      }
    } catch (e) { console.error('[Admin] Reply error:', e); }
    finally { setAdminLoading(false); }
  };

  // Admin: changer status
  const handleStatusChange = async (requestId: string, status: string) => {
    try {
      const res = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRequest(data.request);
        setContactRequests(prev => prev.map(r => r.id === requestId ? data.request : r));
      }
    } catch (e) { console.error('[Admin] Status change error:', e); }
  };

  // User: charger mes demandes de support
  const loadMyRequests = async () => {
    setMyRequestsLoading(true);
    try {
      const res = await fetch('/api/contact-requests/my');
      if (res.ok) {
        const data = await res.json();
        setMyRequests(data.requests || []);
      }
    } catch (e) { console.error('[Support] Load error:', e); }
    finally { setMyRequestsLoading(false); }
  };

  // User: répondre à sa propre demande
  const handleUserReply = async (requestId: string) => {
    if (!userReply.trim()) return;
    setUserReplyLoading(true);
    try {
      const res = await fetch('/api/contact-requests/my', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, message: userReply }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedMyRequest(data.request);
        setMyRequests(prev => prev.map(r => r.id === requestId ? data.request : r));
        setUserReply('');
      }
    } catch (e) { console.error('[Support] Reply error:', e); }
    finally { setUserReplyLoading(false); }
  };

  const loadCreditHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/credits/history?limit=10');
      if (res.ok) {
        const data = await res.json();
        setCreditHistory(data.transactions || []);
      }
    } catch (error) {
      console.error('[MonCompte] Error loading credit history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRedeemPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoMessage(null);
    try {
      const res = await fetch('/api/credits/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setPromoMessage({ type: 'success', text: `+${data.credits} crédits ajoutés !` });
        setPromoCode('');
        // Recharger le solde
        const balRes = await fetch('/api/credits/balance');
        if (balRes.ok) {
          const bal = await balRes.json();
          setCreditsBalance(bal.balance);
        }
        loadCreditHistory();
      } else {
        setPromoMessage({ type: 'error', text: data.error || 'Code invalide' });
      }
    } catch {
      setPromoMessage({ type: 'error', text: 'Erreur réseau' });
    } finally {
      setPromoLoading(false);
    }
  };

  const loadInstagramPosts = async () => {
    setLoadingPosts(true);
    try {
      const response = await fetch('/api/instagram/posts');
      if (response.ok) {
        const data = await response.json();
        setInstagramPosts(data.posts || []);
      }
    } catch (error) {
      console.error('[MonCompte] Error loading Instagram posts:', error);
    } finally {
      setLoadingPosts(false);
    }
  };

  const disconnectInstagram = async () => {
    if (!confirm('Êtes-vous sûr de vouloir déconnecter Instagram ?')) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          instagram_business_account_id: null,
          instagram_username: null,
          instagram_access_token: null,
          facebook_page_id: null,
          facebook_page_access_token: null,
          instagram_connected_at: null,
          instagram_last_sync_at: null,
          instagram_token_expiry: null
        })
        .eq('id', user.id);

      if (!error) {
        window.location.reload();
      }
    } catch (error) {
      console.error('[MonCompte] Error disconnecting Instagram:', error);
      alert('Erreur lors de la déconnexion');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement...</p>
        </div>
      </div>
    );
  }

  const creditPct = creditsMonthly > 0 ? Math.min(100, (creditsBalance / creditsMonthly) * 100) : 0;
  const barColor = (pct: number) => pct >= 80 ? 'bg-gradient-to-r from-red-400 to-red-500' : pct >= 65 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-green-400 to-emerald-500';

  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header avec avatar et infos */}
        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 mb-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {(profile?.first_name?.[0] || user?.email?.[0] || 'K').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-neutral-900">
                {profile?.first_name && profile?.last_name
                  ? `${profile.first_name} ${profile.last_name}`
                  : 'Mon Compte'}
              </h1>
              <p className="text-sm text-neutral-500">{user?.email}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: currentPlan.color + '20', color: currentPlan.color }}>
                  {currentPlan.name}
                </span>
                <span className="text-xs text-neutral-400">Membre depuis {memberSince}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation onglets */}
        <div className="flex gap-1 mb-6 bg-neutral-100 rounded-xl p-1">
          {[
            { key: 'overview' as const, label: 'Vue d\'ensemble', icon: '📊' },
            { key: 'billing' as const, label: 'Abonnement & Factures', icon: '💳' },
            { key: 'connections' as const, label: 'Réseaux sociaux', icon: '🔗' },
            { key: 'support' as const, label: 'Mes demandes', icon: '💬' },
            ...(profile?.is_admin ? [{ key: 'admin-feedback' as const, label: 'Retours clients', icon: '📋' }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveSection(tab.key);
                if (tab.key === 'support' && myRequests.length === 0 && !myRequestsLoading) loadMyRequests();
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                activeSection === tab.key
                  ? 'bg-white shadow-sm text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== ONGLET VUE D'ENSEMBLE ===== */}
        {activeSection === 'overview' && (
          <div className="space-y-6">
            {/* Informations personnelles */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold mb-4 text-neutral-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Informations personnelles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <label className="text-xs text-neutral-500 uppercase tracking-wide">Prénom</label>
                  <p className="font-medium text-neutral-900 mt-0.5">{profile?.first_name || '—'}</p>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <label className="text-xs text-neutral-500 uppercase tracking-wide">Nom</label>
                  <p className="font-medium text-neutral-900 mt-0.5">{profile?.last_name || '—'}</p>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <label className="text-xs text-neutral-500 uppercase tracking-wide">Email</label>
                  <p className="font-medium text-neutral-900 mt-0.5">{user?.email}</p>
                </div>
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <label className="text-xs text-neutral-500 uppercase tracking-wide">Activité</label>
                  <p className="font-medium text-neutral-900 mt-0.5">{profile?.business_type || '—'}</p>
                </div>
                {profile?.business_description && (
                  <div className="p-3 bg-neutral-50 rounded-lg md:col-span-2">
                    <label className="text-xs text-neutral-500 uppercase tracking-wide">Description</label>
                    <p className="font-medium text-neutral-900 mt-0.5">{profile.business_description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Utilisation ce mois */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold mb-4 text-neutral-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Crédits ce mois
                <span className="text-xs text-neutral-400 font-normal ml-auto capitalize">
                  {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </span>
              </h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-neutral-700">Crédits restants</span>
                    <span className={`text-sm font-bold ${creditsBalance <= 10 ? 'text-red-600' : creditsBalance <= 50 ? 'text-amber-600' : 'text-green-600'}`}>
                      {creditsBalance} {creditsMonthly > 0 && <span className="text-xs font-normal text-neutral-400">/ {creditsMonthly}</span>}
                    </span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-3">
                    <div className={`h-3 rounded-full transition-all ${creditPct > 50 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : creditPct > 20 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-red-400 to-red-500'}`} style={{ width: `${Math.max(3, creditPct)}%` }} />
                  </div>
                  {creditsBalance <= 0 && <p className="text-xs text-red-600 mt-1 font-medium">Plus de crédits disponibles</p>}
                  {creditsBalance > 0 && creditsBalance <= 20 && <p className="text-xs text-amber-600 mt-1">Crédits bientôt épuisés</p>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-lg font-bold text-neutral-900">{monthlyStats.images}</p>
                    <p className="text-xs text-neutral-500">Visuels ce mois</p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg">
                    <p className="text-lg font-bold text-neutral-900">{monthlyStats.videos}</p>
                    <p className="text-xs text-neutral-500">Vidéos ce mois</p>
                  </div>
                </div>

                {/* Upsell si crédits bas */}
                {creditsBalance <= 20 && (
                  <div className="mt-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl">
                    <p className="text-sm text-purple-900 font-semibold mb-1">Continuez à créer sans interruption</p>
                    <p className="text-xs text-purple-700 mb-3">Rechargez vos crédits :</p>
                    <div className="flex gap-3">
                      <button onClick={() => setActiveSection('billing')} className="flex-1 text-xs px-3 py-2 bg-white border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-50 transition-colors text-center font-medium">
                        Acheter un pack
                      </button>
                      <Link href="/pricing" className="flex-1 text-xs px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors text-center font-semibold">
                        Upgrader mon plan
                      </Link>
                    </div>
                    <p className="text-[10px] text-purple-500 mt-2 text-center">
                      Ou <Link href="/pricing" className="underline hover:text-purple-700">changez de plan</Link> pour des quotas plus élevés
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Raccourcis */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/generate" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200 hover:border-blue-500 hover:shadow-md transition-all">
                <div className="w-11 h-11 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900 text-sm">Générer un visuel</p>
                  <p className="text-xs text-neutral-500">Créer du contenu IA</p>
                </div>
              </Link>

              <Link href="/library" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200 hover:border-purple-500 hover:shadow-md transition-all">
                <div className="w-11 h-11 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900 text-sm">Galerie & Posts</p>
                  <p className="text-xs text-neutral-500">Gérer vos créations</p>
                </div>
              </Link>

              <Link href="/assistant" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200 hover:border-green-500 hover:shadow-md transition-all">
                <div className="w-11 h-11 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900 text-sm">Mon Assistant</p>
                  <p className="text-xs text-neutral-500">Aide à la création</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* ===== ONGLET ABONNEMENT & FACTURES ===== */}
        {activeSection === 'billing' && (
          <div className="space-y-6">
            {/* Plan actuel + Solde crédits */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold mb-4 text-neutral-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                Votre abonnement
              </h2>

              <div className="p-5 rounded-xl border-2" style={{ borderColor: currentPlan.color + '60', backgroundColor: currentPlan.color + '08' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold" style={{ color: currentPlan.color }}>{currentPlan.name}</h3>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">Actif</span>
                    </div>
                    <p className="text-sm text-neutral-600">
                      {currentPlan.credits.toLocaleString()} crédits / mois
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-neutral-900">{currentPlan.price}</p>
                    <p className="text-xs text-neutral-500">/mois</p>
                  </div>
                </div>

                {/* Jauge crédits */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-neutral-700">Crédits restants</span>
                    <span className={`text-lg font-bold ${creditsBalance <= 10 ? 'text-red-600' : creditsBalance <= 50 ? 'text-amber-600' : 'text-green-600'}`}>
                      {creditsBalance} {creditsMonthly > 0 && <span className="text-sm font-normal text-neutral-400">/ {creditsMonthly}</span>}
                    </span>
                  </div>
                  {creditsMonthly > 0 && (
                    <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${creditsBalance / creditsMonthly > 0.5 ? 'bg-green-500' : creditsBalance / creditsMonthly > 0.2 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, (creditsBalance / creditsMonthly) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-4">
                  <Link
                    href="/pricing"
                    className="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors font-medium"
                  >
                    Changer de plan
                  </Link>
                </div>
              </div>
            </div>

            {/* Code Promo */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold mb-4 text-neutral-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>
                Code promo
              </h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Entrez votre code promo"
                  className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent uppercase tracking-wider"
                  onKeyDown={(e) => e.key === 'Enter' && handleRedeemPromo()}
                />
                <button
                  onClick={handleRedeemPromo}
                  disabled={promoLoading || !promoCode.trim()}
                  className="px-6 py-2.5 text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {promoLoading ? 'Activation...' : 'Activer'}
                </button>
              </div>
              {promoMessage && (
                <p className={`mt-2 text-sm font-medium ${promoMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {promoMessage.text}
                </p>
              )}
            </div>

            {/* Acheter des crédits */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold mb-4 text-neutral-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Acheter des crédits
              </h2>
              <p className="text-sm text-neutral-500 mb-4">Besoin de plus de crédits ? Choisissez un pack ou définissez votre quantité.</p>

              {/* Packs rapides */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {CREDIT_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => setCustomCredits(pack.credits)}
                    className={`p-3 border rounded-xl text-center transition-all ${
                      customCredits === pack.credits
                        ? 'border-purple-500 bg-purple-50 shadow-sm'
                        : 'border-neutral-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="font-bold text-purple-600">{pack.credits} cr</div>
                    <div className="text-xs text-neutral-500">{pack.priceLabel}</div>
                  </button>
                ))}
              </div>

              {/* Achat libre */}
              <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-neutral-700">Quantité personnalisée</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      value={customCredits}
                      onChange={(e) => setCustomCredits(Math.max(10, Math.min(5000, Number(e.target.value) || 10)))}
                      className="w-20 text-center text-sm border border-neutral-300 rounded-lg px-2 py-1 font-bold"
                    />
                    <span className="text-sm text-neutral-500">crédits</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={Math.min(customCredits, 1000)}
                  onChange={(e) => setCustomCredits(Number(e.target.value))}
                  className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-purple-600 mb-3"
                />
                <div className="flex items-center justify-between text-xs text-neutral-400 mb-4">
                  <span>10</span>
                  <div className="flex gap-4">
                    <span className={customCredits >= 150 ? 'text-purple-500 font-medium' : ''}>150+ = 0,27€/cr</span>
                    <span className={customCredits >= 300 ? 'text-purple-600 font-medium' : ''}>300+ = 0,23€/cr</span>
                  </div>
                  <span>1000</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-neutral-900">{customPrice.total.toFixed(2).replace('.', ',')}€</div>
                    <div className="text-xs text-neutral-500">{customPrice.perCredit.toFixed(2).replace('.', ',')}€/crédit</div>
                  </div>
                  <button className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all hover:shadow-lg">
                    Acheter {customCredits} crédits
                  </button>
                </div>
              </div>

              <p className="text-xs text-neutral-400 mt-3 italic">
                Economisez avec un abonnement : Fondateurs = 660 crédits/mois pour 149€ (0,23€/crédit)
              </p>
            </div>

            {/* Historique crédits */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Historique crédits
                </h2>
                <button
                  onClick={loadCreditHistory}
                  disabled={historyLoading}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  {historyLoading ? 'Chargement...' : creditHistory.length > 0 ? 'Actualiser' : 'Charger'}
                </button>
              </div>

              {creditHistory.length > 0 ? (
                <div className="border border-neutral-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Description</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Crédits</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditHistory.map((tx: any) => (
                        <tr key={tx.id} className="border-t border-neutral-100">
                          <td className="px-4 py-2.5 text-neutral-600">{new Date(tx.created_at).toLocaleDateString('fr-FR')}</td>
                          <td className="px-4 py-2.5 text-neutral-900">{tx.description || (FEATURE_LABELS as any)[tx.feature] || tx.feature}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                          </td>
                          <td className="px-4 py-2.5 text-right text-neutral-500">{tx.balance_after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-neutral-400">
                  <svg className="w-8 h-8 text-neutral-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Cliquez sur "Charger" pour voir l'historique
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== ONGLET RÉSEAUX SOCIAUX ===== */}
        {activeSection === 'connections' && (
          <div className="space-y-6">
            {/* Instagram */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">Instagram Business</h2>
                  <p className="text-xs text-neutral-500">Publiez directement sur Instagram depuis Keiro</p>
                </div>
              </div>

              {profile?.instagram_username ? (
                <div>
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {profile.instagram_username[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900">@{profile.instagram_username}</span>
                          <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">Connecté</span>
                        </div>
                        <p className="text-xs text-neutral-600">
                          Connecté le {new Date(profile.instagram_connected_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <button onClick={disconnectInstagram} className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors">
                      Déconnecter
                    </button>
                  </div>

                  {/* Posts Instagram */}
                  {instagramPosts.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-neutral-700">Derniers posts</h3>
                        <button onClick={loadInstagramPosts} disabled={loadingPosts} className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50">
                          {loadingPosts ? 'Chargement...' : 'Actualiser'}
                        </button>
                      </div>
                      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                        {instagramPosts.slice(0, 8).map((post: any) => (
                          <a key={post.id} href={post.permalink} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden group">
                            <img src={post.media_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 bg-neutral-50 rounded-xl">
                  <p className="text-neutral-600 font-medium mb-2">Instagram n'est pas encore connecté</p>
                  <p className="text-sm text-neutral-500 mb-4">Connectez votre compte pour publier depuis Keiro</p>
                  <Link href="/api/auth/instagram-oauth" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all">
                    Connecter Instagram
                  </Link>
                </div>
              )}
            </div>

            {/* TikTok */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .54.04.79.11V9.02a6.37 6.37 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.75a8.18 8.18 0 004.76 1.52V6.82a4.83 4.83 0 01-1-.13z"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">TikTok</h2>
                  <p className="text-xs text-neutral-500">Publiez vos vidéos sur TikTok</p>
                </div>
              </div>

              {profile?.tiktok_username ? (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {profile.tiktok_username[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900">@{profile.tiktok_username}</span>
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">Connecté</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 bg-neutral-50 rounded-xl">
                  <p className="text-neutral-600 font-medium mb-2">TikTok n'est pas encore connecté</p>
                  <p className="text-sm text-neutral-500 mb-4">Connectez votre compte pour publier vos vidéos</p>
                  <Link href="/api/auth/tiktok" className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all">
                    Connecter TikTok
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
        {/* ===== ONGLET MES DEMANDES ===== */}
        {activeSection === 'support' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-neutral-900">Mes demandes de support</h2>
                <button
                  onClick={loadMyRequests}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {myRequestsLoading ? 'Chargement...' : 'Actualiser'}
                </button>
              </div>

              {myRequests.length === 0 && !myRequestsLoading && (
                <div className="text-center py-12 text-neutral-400">
                  <svg className="w-12 h-12 mx-auto mb-3 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm">Aucune demande de support pour le moment</p>
                  <p className="text-xs mt-1">Utilisez le bouton Contact dans le menu pour nous contacter</p>
                </div>
              )}

              {myRequests.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Liste des demandes */}
                  <div className="md:col-span-1 space-y-2 max-h-[500px] overflow-y-auto">
                    {myRequests.map((req: any) => {
                      const hasAdminReply = req.messages?.some((m: any) => m.from === 'admin');
                      return (
                        <button
                          key={req.id}
                          onClick={() => setSelectedMyRequest(req)}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${
                            selectedMyRequest?.id === req.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              req.status === 'resolved' ? 'bg-green-100 text-green-700' :
                              req.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {req.status === 'resolved' ? 'Résolu' : req.status === 'in_progress' ? 'En cours' : 'Nouveau'}
                            </span>
                            {hasAdminReply && (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                                Réponse
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-neutral-900 truncate">{req.subject}</p>
                          <p className="text-xs text-neutral-400 mt-1">
                            {new Date(req.updated_at || req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Détail / Chat */}
                  <div className="md:col-span-2 border border-neutral-200 rounded-xl">
                    {selectedMyRequest ? (
                      <div className="flex flex-col h-[500px]">
                        <div className="p-4 border-b border-neutral-200 bg-neutral-50 rounded-t-xl">
                          <h3 className="font-semibold text-neutral-900">{selectedMyRequest.subject}</h3>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1 ${
                            selectedMyRequest.status === 'resolved' ? 'bg-green-100 text-green-700' :
                            selectedMyRequest.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {selectedMyRequest.status === 'resolved' ? 'Résolu' : selectedMyRequest.status === 'in_progress' ? 'En cours' : 'Nouveau'}
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          {(selectedMyRequest.messages || []).map((msg: any, i: number) => (
                            <div key={i} className={`flex ${msg.from === 'admin' ? 'justify-start' : 'justify-end'}`}>
                              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                                msg.from === 'admin'
                                  ? 'bg-purple-50 border border-purple-200'
                                  : 'bg-blue-50 border border-blue-200'
                              }`}>
                                <p className="text-xs font-semibold mb-1" style={{ color: msg.from === 'admin' ? '#7C3AED' : '#2563EB' }}>
                                  {msg.from === 'admin' ? 'Keiro Support' : 'Vous'}
                                </p>
                                <p className="text-sm text-neutral-800 whitespace-pre-wrap">{msg.text}</p>
                                <p className="text-[10px] text-neutral-400 mt-1">
                                  {msg.at ? new Date(msg.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {selectedMyRequest.status !== 'resolved' && (
                          <div className="p-3 border-t border-neutral-200 flex gap-2">
                            <input
                              type="text"
                              value={userReply}
                              onChange={(e) => setUserReply(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleUserReply(selectedMyRequest.id)}
                              placeholder="Votre réponse..."
                              className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => handleUserReply(selectedMyRequest.id)}
                              disabled={userReplyLoading || !userReply.trim()}
                              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
                            >
                              {userReplyLoading ? '...' : 'Envoyer'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
                        Sélectionnez une demande pour voir la conversation
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== ONGLET ADMIN: RETOURS CLIENTS ===== */}
        {activeSection === 'admin-feedback' && profile?.is_admin && (
          <div className="space-y-6">
            {/* Sous-onglets */}
            <div className="flex gap-2 bg-neutral-100 rounded-xl p-1">
              <button
                onClick={() => { setAdminFeedbackTab('questionnaires'); if (!feedbackStats) loadFeedbackStats(); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${adminFeedbackTab === 'questionnaires' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}
              >
                Questionnaires ({feedbackTotal})
              </button>
              <button
                onClick={() => { setAdminFeedbackTab('demandes'); if (contactRequests.length === 0) loadContactRequests(); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${adminFeedbackTab === 'demandes' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}
              >
                Demandes clients ({contactRequests.length})
              </button>
            </div>

            {/* Sous-onglet Questionnaires */}
            {adminFeedbackTab === 'questionnaires' && (
              <div className="space-y-4">
                {!feedbackStats ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6 text-center">
                    <button onClick={loadFeedbackStats} className="text-purple-600 font-medium hover:underline">Charger les statistiques</button>
                  </div>
                ) : (
                  <>
                    <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
                      <h2 className="text-lg font-semibold mb-4">{feedbackTotal} retour{feedbackTotal > 1 ? 's' : ''} recus</h2>
                      <div className="space-y-4">
                        {Object.entries(feedbackStats).map(([key, counts]: [string, any]) => {
                          const total = (counts.tres_bien || 0) + (counts.bien || 0) + (counts.moyen || 0) + (counts.pas_du_tout || 0);
                          if (total === 0) return null;
                          const labels: Record<string, string> = { images: 'Images', videos: 'Videos', suggestions: 'Suggestions IA', assistant: 'Assistant IA', audio: 'Audio', publication: 'Publication', interface: 'Interface', prix: 'Qualite/Prix' };
                          return (
                            <div key={key}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-neutral-700">{labels[key] || key}</span>
                                <span className="text-xs text-neutral-400">{total} reponse{total > 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex h-4 rounded-full overflow-hidden bg-neutral-100">
                                {counts.tres_bien > 0 && <div className="bg-green-500" style={{ width: `${(counts.tres_bien / total) * 100}%` }} title={`Très bien: ${counts.tres_bien}`} />}
                                {counts.bien > 0 && <div className="bg-blue-500" style={{ width: `${(counts.bien / total) * 100}%` }} title={`Bien: ${counts.bien}`} />}
                                {counts.moyen > 0 && <div className="bg-amber-500" style={{ width: `${(counts.moyen / total) * 100}%` }} title={`Moyen: ${counts.moyen}`} />}
                                {counts.pas_du_tout > 0 && <div className="bg-red-500" style={{ width: `${(counts.pas_du_tout / total) * 100}%` }} title={`Pas du tout: ${counts.pas_du_tout}`} />}
                              </div>
                              <div className="flex gap-3 mt-1 text-[10px] text-neutral-400">
                                {counts.tres_bien > 0 && <span className="text-green-600">Tres bien: {counts.tres_bien}</span>}
                                {counts.bien > 0 && <span className="text-blue-600">Bien: {counts.bien}</span>}
                                {counts.moyen > 0 && <span className="text-amber-600">Moyen: {counts.moyen}</span>}
                                {counts.pas_du_tout > 0 && <span className="text-red-600">Pas du tout: {counts.pas_du_tout}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {feedbackComments.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
                        <h2 className="text-lg font-semibold mb-4">Commentaires libres ({feedbackComments.length})</h2>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {feedbackComments.map((c: any, i: number) => (
                            <div key={i} className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-purple-600">{c.key}</span>
                                <span className="text-[10px] text-neutral-400">{c.user_email} - {new Date(c.created_at).toLocaleDateString('fr-FR')}</span>
                              </div>
                              <p className="text-sm text-neutral-700">{c.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Sous-onglet Demandes clients */}
            {adminFeedbackTab === 'demandes' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Liste des demandes */}
                <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-neutral-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Demandes</h3>
                    <button onClick={loadContactRequests} className="text-xs text-purple-600 hover:underline">Actualiser</button>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {contactRequests.length === 0 && <p className="text-xs text-neutral-400 text-center py-4">Aucune demande</p>}
                    {contactRequests.map((req: any) => (
                      <button
                        key={req.id}
                        onClick={() => setSelectedRequest(req)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${selectedRequest?.id === req.id ? 'border-purple-500 bg-purple-50' : 'border-neutral-100 hover:border-neutral-300'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-neutral-800 truncate">{req.user_name || req.user_email}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${req.status === 'new' ? 'bg-red-100 text-red-700' : req.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {req.status === 'new' ? 'Nouveau' : req.status === 'in_progress' ? 'En cours' : 'Resolu'}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 truncate">{req.subject}</p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">{new Date(req.created_at).toLocaleDateString('fr-FR')}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Detail / Chat */}
                <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-neutral-200 p-4">
                  {selectedRequest ? (
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-3 pb-3 border-b border-neutral-100">
                        <div>
                          <h3 className="font-semibold text-sm">{selectedRequest.subject}</h3>
                          <p className="text-xs text-neutral-500">{selectedRequest.user_name} &lt;{selectedRequest.user_email}&gt;</p>
                        </div>
                        <div className="flex gap-1">
                          {['new', 'in_progress', 'resolved'].map(s => (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(selectedRequest.id, s)}
                              className={`text-[10px] px-2 py-1 rounded-full border transition-all ${selectedRequest.status === s ? (s === 'new' ? 'bg-red-500 text-white border-red-500' : s === 'in_progress' ? 'bg-amber-500 text-white border-amber-500' : 'bg-green-500 text-white border-green-500') : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'}`}
                            >
                              {s === 'new' ? 'Nouveau' : s === 'in_progress' ? 'En cours' : 'Resolu'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Messages */}
                      <div className="flex-1 space-y-3 max-h-[50vh] overflow-y-auto mb-3">
                        {(selectedRequest.messages || []).map((msg: any, i: number) => (
                          <div key={i} className={`flex ${msg.from === 'admin' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-3 rounded-xl text-sm ${msg.from === 'admin' ? 'bg-purple-600 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                              <p className="whitespace-pre-wrap">{msg.text}</p>
                              <p className={`text-[10px] mt-1 ${msg.from === 'admin' ? 'text-purple-200' : 'text-neutral-400'}`}>
                                {new Date(msg.at).toLocaleString('fr-FR')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Input reponse */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={adminReply}
                          onChange={(e) => setAdminReply(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAdminReply(selectedRequest.id)}
                          placeholder="Repondre..."
                          className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => handleAdminReply(selectedRequest.id)}
                          disabled={adminLoading || !adminReply.trim()}
                          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50"
                        >
                          {adminLoading ? '...' : 'Envoyer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
                      Selectionnez une demande pour voir les details
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <FeedbackPopup show={feedback.showPopup} onAccept={feedback.handleAccept} onDismiss={feedback.handleDismiss} />
        <FeedbackModal isOpen={feedback.showModal} onClose={feedback.handleModalClose} />
      </main>
    </div>
  );
}
