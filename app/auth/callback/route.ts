import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/generate'

  if (!code) {
    console.log('[Auth Callback] No code provided, redirecting to login')
    return NextResponse.redirect(new URL('/login', url))
  }

  const supabase = await supabaseServer()

  // Exchange code for session
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('[Auth Callback] Exchange error:', exchangeError)
    return NextResponse.redirect(new URL('/login', url))
  }

  // Get the authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('[Auth Callback] User error:', userError)
    return NextResponse.redirect(new URL('/login', url))
  }

  console.log('[Auth Callback] User authenticated:', user.id)

  // Check if profile exists
  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError && profileError.code !== 'PGRST116') {
    // PGRST116 = not found, which is ok (we'll create it)
    console.error('[Auth Callback] Profile lookup error:', profileError)
  }

  // Create profile if it doesn't exist
  if (!existingProfile) {
    console.log('[Auth Callback] Creating profile for user:', user.id)

    const { error: insertError } = await supabase
      .from('profiles')
      .insert([
        {
          id: user.id,
          email: user.email || '',
          first_name: user.user_metadata?.first_name || '',
          last_name: user.user_metadata?.last_name || '',
          business_type: user.user_metadata?.business_type || '',
        },
      ])

    if (insertError) {
      console.error('[Auth Callback] Profile creation error:', insertError)
      // Don't block login if profile creation fails
    } else {
      console.log('[Auth Callback] Profile created successfully')
    }
  } else {
    console.log('[Auth Callback] Profile already exists')
  }

  console.log('[Auth Callback] Redirecting to:', next)
  return NextResponse.redirect(new URL(next, url))
}
