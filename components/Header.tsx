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
                <div className="relative">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {profile.first_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  {profile.instagram_username && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center border-2 border-white">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                  )}
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

                    {/* Instagram Connection Status */}
                    <div className="px-4 py-2 text-sm">
                      {profile.instagram_username ? (
                        <Link
                          href="/dashboard"
                          className="flex items-center gap-2 text-green-600 hover:bg-green-50 transition-colors rounded-lg p-2 -m-2"
                          onClick={() => setShowMenu(false)}
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                          <div className="flex flex-col">
                            <span className="font-medium">Instagram connecté</span>
                            <span className="text-xs text-neutral-500">@{profile.instagram_username} • Voir aperçu</span>
                          </div>
                        </Link>
                      ) : (
                        <Link
                          href="/api/auth/instagram-oauth"
                          className="flex items-center gap-2 text-neutral-600 hover:text-blue-600 transition-colors"
                          onClick={() => setShowMenu(false)}
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                          <div className="flex flex-col">
                            <span className="font-medium">Connecter Instagram</span>
                            <span className="text-xs">Publication automatique</span>
                          </div>
                        </Link>
                      )}
                    </div>

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
