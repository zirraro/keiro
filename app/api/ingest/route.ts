import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  return new Response(JSON.stringify({ data, error }), {
    status: error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}

  const brand_id = body?.brand_id;
  const type = body?.type ?? 'brief';
  const payload = body?.payload ?? {};

  if (!brand_id) {
    return new Response(JSON.stringify({ error: { message: 'brand_id is required' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { data, error } = await supabase
    .from('sources')
    .insert({ brand_id, type, payload })
    .select()
    .single();

  return new Response(JSON.stringify({ data, error }), {
    status: error ? 400 : 201,
    headers: { 'Content-Type': 'application/json' }
  });
}
