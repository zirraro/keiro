'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function NavAuth() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => { sub?.subscription?.unsubscribe(); };
  }, []);

  const supabase = supabaseBrowser();
  return (
    <div className="ml-auto flex items-center gap-3">
      {email ? (
        <>
          <span className="text-sm text-neutral-700">{email}</span>
          <button
            className="text-sm underline"
            onClick={() => supabase.auth.signOut()}
          >
            Se déconnecter
          </button>
        </>
      ) : (
        <a href="/login" className="text-sm underline">Se connecter</a>
      )}
    </div>
  );
}
