import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

/**
 * GET /api/tiktok/check-setup
 * Diagnostic endpoint to verify TikTok integration setup
 */
export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    checks: []
  };

  try {
    // Check 1: Environment variables
    const envVars = {
      TIKTOK_CLIENT_KEY: !!process.env.TIKTOK_CLIENT_KEY,
      TIKTOK_CLIENT_SECRET: !!process.env.TIKTOK_CLIENT_SECRET,
      NEXT_PUBLIC_TIKTOK_REDIRECT_URI: !!process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI,
      NEXT_PUBLIC_SITE_URL: !!process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    };

    results.checks.push({
      name: 'Environment Variables',
      status: Object.values(envVars).every(v => v) ? 'PASS' : 'FAIL',
      details: envVars
    });

    // Check 2: User authentication
    const { user, error: authError } = await getAuthUser();
    results.checks.push({
      name: 'User Authentication',
      status: user ? 'PASS' : 'FAIL',
      details: {
        authenticated: !!user,
        userId: user?.id,
        error: authError?.message
      }
    });

    // Check 3: Database connection
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Check if profiles table has TikTok columns
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, tiktok_user_id, tiktok_username, tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry, tiktok_connected_at')
          .eq('id', user.id)
          .single();

        results.checks.push({
          name: 'Database Schema - Profiles Table',
          status: error ? 'FAIL' : 'PASS',
          details: {
            hasRecord: !!data,
            hasTikTokColumns: !error,
            columns: error ? null : Object.keys(data || {}).filter(k => k.startsWith('tiktok_')),
            error: error?.message,
            hint: error?.hint
          }
        });

        // Check if tiktok_posts table exists
        const { error: postsError } = await supabase
          .from('tiktok_posts')
          .select('id')
          .limit(1);

        results.checks.push({
          name: 'Database Schema - TikTok Posts Table',
          status: postsError?.code === 'PGRST116' || !postsError ? 'PASS' : 'FAIL',
          details: {
            tableExists: !postsError || postsError.code === 'PGRST116',
            error: postsError?.message
          }
        });
      }
    } else {
      results.checks.push({
        name: 'Database Connection',
        status: 'FAIL',
        details: { error: 'Supabase credentials missing' }
      });
    }

    // Overall status
    results.overallStatus = results.checks.every((c: any) => c.status === 'PASS') ? 'READY' : 'NOT READY';

    return NextResponse.json(results, { status: 200 });

  } catch (error: any) {
    results.overallStatus = 'ERROR';
    results.error = {
      message: error.message,
      stack: error.stack
    };

    return NextResponse.json(results, { status: 500 });
  }
}
