/** Server-side Supabase stub */
export function createServerClient() {
  const thrower = () => { throw new Error('Supabase (server) non configuré pour cette build.'); };
  return new Proxy({}, { get: () => thrower }) as any;
}
export default createServerClient;
