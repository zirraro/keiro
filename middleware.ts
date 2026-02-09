import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Si les variables d'env ne sont pas configurées, laisser passer
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Middleware] Supabase not configured, allowing access')
    return res
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value)
          res.cookies.set({ name, value, ...options })
        })
      },
    },
  })

  // Routes protégées (studio et generate sont maintenant publics)
  const protectedPaths = ['/mon-compte']
  const isProtectedPath = protectedPaths.some(path =>
    req.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath) {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return res
}

export const config = {
  matcher: ['/mon-compte/:path*']
}
