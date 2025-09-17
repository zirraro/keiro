import { supabaseServer } from '@/lib/supabase/server'

export async function GET() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ user: null, error: 'unauthorized' }), { status: 401 })
  return new Response(JSON.stringify({ user, error }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
