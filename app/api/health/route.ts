import { supabase } from '@/lib/supabase';

export async function GET() {
  const { error } = await supabase.from('brands').select('id').limit(1);
  return new Response(JSON.stringify({
    ok: !error,
    db: error ? 'down' : 'up',
    ts: Date.now(),
    error: error ? { message: error.message } : null
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
