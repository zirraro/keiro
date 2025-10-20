/** Lightweight server Supabase stub */
export const supabaseServer = new Proxy({}, {
  get() {
    throw new Error('Supabase (server) non configuré pour cette build.');
  }
});
export default supabaseServer;
