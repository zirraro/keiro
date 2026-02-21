import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/generate?welcome=true'

  if (!code) {
    console.log('[Auth Callback] No code provided, redirecting to login')
    return NextResponse.redirect(new URL('/login', url))
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Auth Callback] Missing Supabase env vars')
    return NextResponse.redirect(new URL('/login', url))
  }

  // Create the redirect response FIRST so cookies are set ON it
  const redirectUrl = new URL(next, url)
  const response = NextResponse.redirect(redirectUrl)

  const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Set cookies on BOTH the cookieStore and the redirect response
          try {
            cookieStore.set(name, value, options)
          } catch {
            // cookieStore.set can fail in some contexts
          }
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // Exchange code for session - cookies will be set on the response
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('[Auth Callback] Exchange error:', exchangeError)
    return NextResponse.redirect(new URL('/login?error=confirmation_failed', url))
  }

  // Get the authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('[Auth Callback] User error:', userError)
    return NextResponse.redirect(new URL('/login', url))
  }

  console.log('[Auth Callback] User authenticated:', user.id, user.email)

  // Check if profile exists, create if needed (use service role for insert)
  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (profileError && profileError.code === 'PGRST116') {
    console.log('[Auth Callback] Creating profile for user:', user.id)
    const { error: insertError } = await supabase
      .from('profiles')
      .insert([{
        id: user.id,
        email: user.email || '',
        first_name: user.user_metadata?.first_name || '',
        last_name: user.user_metadata?.last_name || '',
        business_type: user.user_metadata?.business_type || '',
      }])

    if (insertError) {
      console.error('[Auth Callback] Profile creation error:', insertError)
    } else {
      console.log('[Auth Callback] Profile created successfully')
    }
  }

  console.log('[Auth Callback] Redirecting to:', next, '(with session cookies)')
  return response
}
