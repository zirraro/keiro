import { supabaseServer } from '@/lib/supabase/server'
import { fetchGoogleNews } from '@/lib/news/sources'

export async function POST(req: Request) {
  const supabase = supabaseServer()
  let body: any = {}
  try { body = await req.json() } catch {}

  const brand_id = body?.brand_id?.toString?.()
  const max = Math.min(parseInt(body?.max ?? '15', 10) || 15, 50)

  if (!brand_id) {
    return new Response(JSON.stringify({ error: { message: 'brand_id is required' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  // Récupérer la brand (autorisée par RLS si orpheline ou t’appartient)
  const { data: brand, error: brandErr } = await supabase
    .from('brands')
    .select('id,name')
    .eq('id', brand_id)
    .single()

  if (brandErr || !brand) {
    return new Response(JSON.stringify({ error: { message: 'brand not accessible' } }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    })
  }

  const query: string = (body?.query ?? brand.name).toString().trim()
  try {
    const items = await fetchGoogleNews(query, { max, lang: 'fr', region: 'FR' })
    if (!items.length) {
      return new Response(JSON.stringify({ imported: 0, skipped: 0, total: 0, data: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    const payload = items.map(it => ({
      brand_id,
      title: it.title,
      summary: it.description ?? null,
      url: it.link,
      image_url: null,
      source: 'Google News',
      published_at: it.pubDate ?? null,
      raw: it
    }))

    const { data, error } = await supabase
      .from('news_items')
      .upsert(payload, { onConflict: 'brand_id,url', ignoreDuplicates: false })
      .select('id,url')

    if (error) throw error

    // On ne sait pas exactement combien étaient des doublons; on expose juste la taille renvoyée.
    return new Response(JSON.stringify({
      imported: data?.length ?? 0,
      skipped: Math.max(0, items.length - (data?.length ?? 0)),
      total: items.length,
      data
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: { message: e?.message ?? 'fetch failed' } }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}
