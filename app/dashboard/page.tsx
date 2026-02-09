"use client";

import { useEffect, useState, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";

// Plan definitions
const PLANS: Record<string, { name: string; price: string; visuals: number; videos: number; color: string }> = {
  free: { name: 'Gratuit', price: '0€', visuals: 3, videos: 0, color: '#9CA3AF' },
  sprint: { name: 'Sprint Fondateur', price: '4,99€', visuals: 15, videos: 3, color: '#3B82F6' },
  solo: { name: 'Solo', price: '49€', visuals: 20, videos: 1, color: '#3B82F6' },
  fondateurs: { name: 'Fondateurs', price: '149€', visuals: 50, videos: 12, color: '#8B5CF6' },
  standard: { name: 'Standard', price: '199€', visuals: 40, videos: 11, color: '#06B6D4' },
  business: { name: 'Business', price: '349€', visuals: 100, videos: 25, color: '#F59E0B' },
  elite: { name: 'Elite', price: '999€', visuals: 250, videos: 70, color: '#EF4444' },
  admin: { name: 'Fondateurs', price: '—', visuals: 30, videos: 8, color: '#10B981' },
};

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [instagramPosts, setInstagramPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState({ images: 0, videos: 0 });
  const [activeSection, setActiveSection] = useState<'overview' | 'billing' | 'connections'>('overview');

  const supabase = useMemo(() => supabaseBrowser(), []);

  // Déterminer le plan actuel
  const currentPlan = useMemo(() => {
    const planKey = profile?.subscription_plan || (user?.app_metadata?.role === 'admin' ? 'admin' : 'fondateurs');
    return PLANS[planKey] || PLANS['fondateurs'];
  }, [profile, user]);

  useEffect(() => {
    // Écouter l'état d'authentification pour éviter les redirections prématurées
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user) {
          loadUserData(session.user);
        } else if (event === 'INITIAL_SESSION') {
          // Pas de session initiale → rediriger
          window.location.href = '/login';
        }
      } else if (event === 'SIGNED_OUT') {
        window.location.href = '/login';
      }
    });

    return () => subscription.unsubscribe();
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

      // Si Instagram est connecté, charger les posts récents
      if (profileData?.instagram_business_account_id) {
        loadInstagramPosts();
      }
    } catch (error) {
      console.error('[Dashboard] Error loading user:', error);
    } finally {
      setLoading(false);
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
      console.error('[Dashboard] Error loading Instagram posts:', error);
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
      console.error('[Dashboard] Error disconnecting Instagram:', error);
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

  const imgPct = currentPlan.visuals > 0 ? Math.min(100, (monthlyStats.images / currentPlan.visuals) * 100) : 0;
  const vidPct = currentPlan.videos > 0 ? Math.min(100, (monthlyStats.videos / currentPlan.videos) * 100) : 0;
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
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
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
                Utilisation ce mois
                <span className="text-xs text-neutral-400 font-normal ml-auto capitalize">
                  {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </span>
              </h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-neutral-700">Visuels créés</span>
                    <span className="text-sm font-bold text-neutral-900">{monthlyStats.images} <span className="text-xs font-normal text-neutral-400">/ {currentPlan.visuals}</span></span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-3">
                    <div className={`h-3 rounded-full transition-all ${barColor(imgPct)}`} style={{ width: `${Math.max(3, imgPct)}%` }} />
                  </div>
                  {imgPct >= 100 && <p className="text-xs text-red-600 mt-1 font-medium">Quota atteint</p>}
                  {imgPct >= 80 && imgPct < 100 && <p className="text-xs text-amber-600 mt-1">Quota bientôt atteint</p>}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-neutral-700">Vidéos créées</span>
                    <span className="text-sm font-bold text-neutral-900">{monthlyStats.videos} <span className="text-xs font-normal text-neutral-400">/ {currentPlan.videos}</span></span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-3">
                    <div className={`h-3 rounded-full transition-all ${barColor(vidPct)}`} style={{ width: `${Math.max(3, vidPct)}%` }} />
                  </div>
                  {vidPct >= 100 && <p className="text-xs text-red-600 mt-1 font-medium">Quota atteint</p>}
                  {vidPct >= 80 && vidPct < 100 && <p className="text-xs text-amber-600 mt-1">Quota bientôt atteint</p>}
                </div>

                {/* Upsell si quota atteint */}
                {(monthlyStats.images >= currentPlan.visuals || monthlyStats.videos >= currentPlan.videos) && (
                  <div className="mt-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl">
                    <p className="text-sm text-purple-900 font-semibold mb-1">Continuez à créer sans interruption</p>
                    <p className="text-xs text-purple-700 mb-3">Ajoutez un pack extra pour ce mois :</p>
                    <div className="flex gap-3">
                      <button className="flex-1 text-xs px-3 py-2 bg-white border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-50 transition-colors text-center font-medium">
                        +10 visuels — 19€
                      </button>
                      <button className="flex-1 text-xs px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors text-center font-semibold">
                        +5 vidéos — 29€
                      </button>
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
            {/* Plan actuel */}
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
                      {currentPlan.visuals} visuels / mois + {currentPlan.videos} vidéos / mois
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-neutral-900">{currentPlan.price}</p>
                    <p className="text-xs text-neutral-500">/mois</p>
                  </div>
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

            {/* Packs extras */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold mb-4 text-neutral-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Packs extras disponibles
              </h2>
              <p className="text-sm text-neutral-500 mb-4">Besoin de plus de créations ce mois-ci ? Ajoutez un pack ponctuel.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-neutral-200 rounded-xl hover:border-purple-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-neutral-900">Pack Visuels</h3>
                    <span className="text-lg font-bold text-purple-600">19€</span>
                  </div>
                  <p className="text-sm text-neutral-600 mb-3">+10 visuels supplémentaires pour ce mois</p>
                  <button className="w-full py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors font-medium border border-purple-200">
                    Ajouter ce pack
                  </button>
                </div>
                <div className="p-4 border border-neutral-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-neutral-900">Pack Vidéos</h3>
                    <span className="text-lg font-bold text-blue-600">29€</span>
                  </div>
                  <p className="text-sm text-neutral-600 mb-3">+5 vidéos supplémentaires pour ce mois</p>
                  <button className="w-full py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium border border-blue-200">
                    Ajouter ce pack
                  </button>
                </div>
              </div>
            </div>

            {/* Historique des paiements */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-semibold mb-4 text-neutral-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Mes paiements
              </h2>

              <div className="border border-neutral-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Montant</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                        <svg className="w-8 h-8 text-neutral-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Aucun paiement pour le moment
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-neutral-400 mt-3">Les factures seront disponibles ici une fois le paiement activé.</p>
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
      </main>
    </div>
  );
}
