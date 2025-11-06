import { createClient } from './client';
import { supabaseServer } from './server';

export type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
};

// ===== CLIENT-SIDE AUTH (pour les composants client) =====

export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function signInWithGoogle() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata,
  };
}

export async function getCurrentSession() {
  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    return null;
  }

  return session;
}

// ===== SERVER-SIDE AUTH (pour les Server Components et API Routes) =====

export async function getServerUser(): Promise<AuthUser | null> {
  const supabase = await supabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata,
  };
}

export async function getServerSession() {
  const supabase = await supabaseServer();
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    return null;
  }

  return session;
}

// ===== TRACKING DES GÉNÉRATIONS =====

export async function trackGeneration(
  userId: string,
  type: 'image' | 'video',
  prompt: string,
  result: {
    url?: string;
    urls?: string[];
    error?: string;
  }
) {
  const supabase = createClient();

  const { data, error } = await supabase.from('generations').insert({
    user_id: userId,
    type,
    prompt,
    result_url: result.url || result.urls?.[0] || null,
    result_urls: result.urls || (result.url ? [result.url] : null),
    error: result.error || null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[trackGeneration] Error:', error);
    return null;
  }

  return data;
}

export async function getUserGenerations(userId: string, limit = 50) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getUserGenerations] Error:', error);
    return [];
  }

  return data || [];
}
