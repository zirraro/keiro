/** Lightweight browser Supabase stubs just to satisfy imports at build time. */
export const supabaseBrowser = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithOtp: async () => ({ data: null, error: null }),
    signOut: async () => ({ error: null }),
  },
};
export default supabaseBrowser;
