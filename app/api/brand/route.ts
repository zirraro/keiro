import { supabaseServer } from '@/lib/supabase/server'

/**
 * GET /api/brand
 * Récupère le profil de marque de l'utilisateur connecté
 */
export async function GET() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data: profile, error } = await supabase
    .from('brands')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ ok: true, profile }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

/**
 * PUT /api/brand
 * Met à jour ou crée le profil de marque de l'utilisateur
 * Body: { name?, tone?, primary_color?, secondary_color?, font_family?, logo_url? }
 */
export async function PUT(req: Request) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Construire l'objet de mise à jour avec uniquement les champs fournis
  const updates: any = { user_id: user.id }

  if (body.name !== undefined) updates.name = body.name
  if (body.tone !== undefined) updates.tone = body.tone
  if (body.primary_color !== undefined) updates.primary_color = body.primary_color
  if (body.secondary_color !== undefined) updates.secondary_color = body.secondary_color
  if (body.font_family !== undefined) updates.font_family = body.font_family
  if (body.logo_url !== undefined) updates.logo_url = body.logo_url

  // Upsert (1 utilisateur = 1 profil de marque)
  const { data: profile, error } = await supabase
    .from('brands')
    .upsert(updates, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ ok: true, profile }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
