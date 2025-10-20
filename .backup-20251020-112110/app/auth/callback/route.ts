import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const redirectedFrom = url.searchParams.get('redirectedFrom') || '/studio'
  if (!code) return NextResponse.redirect(new URL('/login', url))
  const supabase = supabaseServer()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login', url))
  return NextResponse.redirect(new URL(redirectedFrom, url))
}
