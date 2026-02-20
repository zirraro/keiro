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

  const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch (error) {
          // This can happen in some edge cases, we'll handle it below
          console.warn('[Auth Callback] Cookie set warning:', error)
        }
      },
    },
  })

  // Exchange code for session - this sets the auth cookies
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

  console.log('[Auth Callback] User authenticated:', user.id, user.email)

  // Check if profile exists, create if needed
  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (profileError && profileError.code === 'PGRST116') {
    // Profile not found, create it
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

  console.log('[Auth Callback] Redirecting to:', next)
  return NextResponse.redirect(new URL(next, url))
}
