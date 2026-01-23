"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Accueil" },
  { href: "/generate", label: "Générer" },
  { href: "/studio", label: "Studio Édition" },
  { href: "/library", label: "Galerie & Posts" },
  { href: "/assistant", label: "Mon Assistant" },
  { href: "/pricing", label: "Tarifs", highlight: true },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Charger l'utilisateur ET la session
    const loadUser = async () => {
      console.log('[Header] Loading user and session...');

      // Vérifier la session d'abord
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[Header] Session error:', sessionError);
      }

      console.log('[Header] Session:', session ? 'active' : 'none');

      // Puis charger l'utilisateur
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        console.error('[Header] Error loading user:', userError);
      }

      console.log('[Header] User loaded:', user?.id || 'none');
      setUser(user);

      if (user) {
        // Charger le profil
        console.log('[Header] Loading profile for user:', user.id);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('[Header] Error loading profile:', profileError);
        } else {
          console.log('[Header] Profile loaded:', profileData);
        }

        setProfile(profileData as any);
      } else {
        setProfile(null);
      }

      setLoading(false);
    };

    loadUser();

    // S'abonner aux changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      console.log('[Header] Auth state changed:', session?.user?.id || 'logged out');
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data, error }: any) => {
            if (error) {
              console.error('[Header] Error loading profile on auth change:', error);
            } else {
              console.log('[Header] Profile loaded on auth change:', data);
              setProfile(data);
            }
          });
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowMenu(false);
    router.push('/');
    router.refresh();
  };

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo / marque */}
        <Link href="/" className="text-lg font-bold text-neutral-900">
          KeiroAI
        </Link>

        {/* Navigation */}
        <nav className="hidden lg:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isHighlight = (item as any).highlight;

            if (isHighlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative px-4 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:shadow-lg transition-all"
                >
                  <span className="relative">
                    {item.label}
                    <span className="absolute -top-2 -right-3 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </span>
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition ${
                  isActive
                    ? "font-semibold text-blue-600"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bouton connexion/inscription OU Menu utilisateur */}
        <div className="relative">
          {user && profile ? (
            <div>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-neutral-100 transition-all"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {profile.first_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="text-sm font-semibold text-neutral-900">
                  {profile.first_name || user.email?.split('@')[0]}
                </span>
                <svg className="w-4 h-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-2xl border border-neutral-200 py-2 z-20">
                    <div className="px-4 py-3 border-b border-neutral-200">
                      <p className="text-sm font-semibold text-neutral-900">
                        {profile.first_name} {profile.last_name}
                      </p>
                      <p className="text-xs text-neutral-500">{user.email}</p>
                      {profile.business_type && (
                        <p className="text-xs text-neutral-400 mt-1">{profile.business_type}</p>
                      )}
                    </div>

                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                      onClick={() => setShowMenu(false)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Mon compte
                    </Link>

                    <Link
                      href="/library"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                      onClick={() => setShowMenu(false)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 4 0 012 2v2M7 7h10" />
                      </svg>
                      Galerie & Posts
                    </Link>

                    <hr className="my-2 border-neutral-200" />

                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Se déconnecter
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:shadow-lg transition-all"
            >
              Se connecter / S'inscrire
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
