/** Minimal Supabase stub (build/runtime dev only) */
type Session = { user?: { email?: string | null } | null } | null;

function baseStub() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithOAuth: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: (cb: (_e: any, session: Session) => void) => {
        // fire once with null and return unsubscribe handle
        try { cb(null as any, null); } catch {}
        return { data: { subscription: { unsubscribe() {} } } } as any;
      },
    },
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  } as any;
}

export function createClient() { return baseStub(); }
/** some code imports supabaseBrowser() */
export function supabaseBrowser() { return baseStub(); }
export default createClient;
