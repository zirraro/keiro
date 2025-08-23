'use client';
import { createBrowserClient } from '@supabase/ssr';

// Fonction "lazy" — lue seulement quand on l'appelle côté client
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, key);
}
