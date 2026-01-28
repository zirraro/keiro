import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';

/**
 * GET /api/tiktok/debug-userinfo
 * Debug endpoint to see raw TikTok user info response
 */
export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get TikTok access token from database
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tiktok_access_token, tiktok_user_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.tiktok_access_token) {
      return NextResponse.json({
        error: 'No TikTok token found',
        hasProfile: !!profile,
        hasToken: !!profile?.tiktok_access_token
      }, { status: 400 });
    }

    // Call TikTok user info API
    const url = `${TIKTOK_API_BASE}/v2/user/info/?fields=open_id,union_id,avatar_url,avatar_url_100,avatar_url_200,avatar_large_url,display_name`;

    console.log('[DebugUserInfo] Calling TikTok API:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${profile.tiktok_access_token}`,
      },
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = { _rawText: responseText };
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data: data,
      analysis: {
        hasError: !!data.error,
        hasErrorCode: 'error_code' in data,
        errorCode: data.error_code,
        hasData: !!data.data,
        hasUser: !!(data.data?.user),
        errorMessage: data.error?.message,
        message: data.message,
      }
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
