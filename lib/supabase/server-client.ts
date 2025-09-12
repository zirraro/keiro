/** Build stub: évite les erreurs d'import côté Vercel */
export const supabaseServer = () => ({
  auth: {
    getUser: async () => ({ data: { user: null }, error: null })
  }
});
export default supabaseServer;
