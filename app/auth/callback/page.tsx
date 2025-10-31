'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();

      // Vérifier si l'utilisateur est connecté
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Rediriger vers la librairie après connexion
        router.push('/library');
      } else {
        // Rediriger vers l'accueil si pas de session
        router.push('/');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-neutral-600">Connexion en cours...</p>
      </div>
    </div>
  );
}
