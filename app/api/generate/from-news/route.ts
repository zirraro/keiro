import { supabaseServer } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await supabaseServer()
  let body: any = {}
  try { body = await req.json() } catch {}

  const brand_id = body?.brand_id?.toString?.()
  const news_id = body?.news_id?.toString?.()

  if (!brand_id || !news_id) {
    return new Response(JSON.stringify({ error: { message: 'brand_id and news_id are required' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  // 1) Charger la news (RLS: lisible si brand_id autorisé)
  const { data: news, error: eNews } = await supabase
    .from('news_items')
    .select('*')
    .eq('id', news_id)
    .single()

  if (eNews || !news) {
    return new Response(JSON.stringify({ error: { message: 'news not found or not accessible', details: eNews } }), {
      status: 404, headers: { 'Content-Type': 'application/json' }
    })
  }

  if (news.brand_id !== brand_id) {
    return new Response(JSON.stringify({ error: { message: 'news does not belong to brand_id' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  // 2) Charger la brand (pour tone)
  const { data: brand, error: eBrand } = await supabase
    .from('brands')
    .select('id,name,tone')
    .eq('id', brand_id)
    .single()

  if (eBrand || !brand) {
    return new Response(JSON.stringify({ error: { message: 'brand not found', details: eBrand } }), {
      status: 404, headers: { 'Content-Type': 'application/json' }
    })
  }

  // 3) Fabriquer un résultat "mock" (à remplacer plus tard par ton moteur IA)
  const tone = typeof brand.tone === 'string' ? (()=>{try{return JSON.parse(brand.tone)}catch{return {}}})() : (brand.tone ?? {})
  const voice = tone?.voice ?? 'neutral'

  const text =
    `Post (${voice}) pour “${brand.name}” basé sur l’actu:\n`+
    `• Titre: ${news.title}\n`+
    (news.summary ? `• Résumé: ${String(news.summary).replace(/<[^>]*>/g,'').slice(0,240)}…\n` : '')+
    `• Source: ${news.source ?? 'Web'}\n`+
    `• URL: ${news.url}`

  const result = {
    text,
    news: {
      id: news.id,
      title: news.title,
      url: news.url,
      source: news.source,
      published_at: news.published_at
    },
    tone
  }

  // 4) Insert dans generations
  const { data, error } = await supabase
    .from('generations')
    .insert({
      brand_id,
      source_id: news.id, // on relie la génération à la news
      kind: 'post',
      result
    })
    .select('*')
    .single()

  return new Response(JSON.stringify({ data, error }), {
    status: error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
