/** No-op server stub to satisfy imports during local demos */
export function supabaseServer() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  } as any;
}
export default supabaseServer;
