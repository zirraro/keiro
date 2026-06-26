import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

const json = (obj: any, status: number) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export async function GET() {
  // Auth requise — endpoint exposait toutes les `sources` sans contrôle.
  const { user, error: authErr } = await getAuthUser();
  if (authErr || !user) return json({ error: 'Non authentifié' }, 401);

  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  // Ne pas renvoyer l'objet erreur Postgrest brut (fuite de structure DB).
  if (error) return json({ error: 'internal' }, 500);
  return json({ data }, 200);
}

export async function POST(req: Request) {
  const { user, error: authErr } = await getAuthUser();
  if (authErr || !user) return json({ error: 'Non authentifié' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const brand_id = body?.brand_id;
  const type = body?.type ?? 'brief';
  const payload = body?.payload ?? {};

  if (!brand_id) return json({ error: 'brand_id is required' }, 400);

  const { data, error } = await supabase
    .from('sources')
    .insert({ brand_id, type, payload })
    .select()
    .single();

  if (error) return json({ error: 'internal' }, 400);
  return json({ data }, 201);
}
