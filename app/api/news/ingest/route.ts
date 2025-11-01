import { supabaseServer } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await supabaseServer()
  let body: any = {}
  try { body = await req.json() } catch {}

  const brand_id = body?.brand_id?.toString?.()
  const title = (body?.title ?? '').toString().trim()
  const url = (body?.url ?? '').toString().trim()
  const summary = body?.summary ?? null
  const image_url = body?.image_url ?? null
  const source = body?.source ?? null
  const published_at = body?.published_at ? new Date(body.published_at).toISOString() : null
  const raw = body?.raw ?? {}

  if (!brand_id || !title || !url) {
    return new Response(JSON.stringify({ error: { message: 'brand_id, title and url are required' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data, error } = await supabase
    .from('news_items')
    .upsert(
      [{ brand_id, title, summary, url, image_url, source, published_at, raw }],
      { onConflict: 'brand_id,url', ignoreDuplicates: false }
    )
    .select('*')
    .single()

  return new Response(JSON.stringify({ data, error }), {
    status: error ? 500 : 200, headers: { 'Content-Type': 'application/json' }
  })
}
