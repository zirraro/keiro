import { createClient } from "@supabase/supabase-js";

/** Client côté serveur.
 *  Utilise la SERVICE_ROLE si dispo (pour créer bucket/supprimer), sinon ANON.
 */
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or KEY");
  return createClient(url, key);
}

export function publicUrlFromPath(path: string) {
  // path: bucket/path/to/file
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${path.replace(/^\/+/, "")}`;
}
