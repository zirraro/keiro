import { supabaseServer } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const name = (body?.name ?? '').toString().trim()
  const tone = body?.tone ?? null
  if (!name) return new Response(JSON.stringify({ error: { message: 'name is required' } }), { status: 400 })

  // upsert par user_id (1 utilisateur = 1 marque)
  const { data, error } = await supabase
    .from('brands')
    .upsert({ name, tone, user_id: user.id }, { onConflict: 'user_id' })
    .select('*')
    .single()

  return new Response(JSON.stringify({ data, error }), {
    status: error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
