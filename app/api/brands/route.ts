import { supabaseServer } from '@/lib/supabase/server'

export const runtime = 'edge';

export async function GET() {
  const supabase = await supabaseServer()
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('created_at', { ascending: false })

  return new Response(JSON.stringify({ data, error }), {
    status: error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
