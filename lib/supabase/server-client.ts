export function createServerClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  } as any;
}
export default createServerClient;
