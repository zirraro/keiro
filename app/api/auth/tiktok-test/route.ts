import { NextResponse } from 'next/server';

/**
 * GET /api/auth/tiktok-test
 * Simple test endpoint to verify routing works
 */
export async function GET() {
  console.log('[TikTokTest] Test endpoint called successfully');

  return NextResponse.json({
    ok: true,
    message: 'TikTok API routes are working',
    timestamp: new Date().toISOString(),
    env: {
      TIKTOK_CLIENT_KEY: !!process.env.TIKTOK_CLIENT_KEY,
      NEXT_PUBLIC_TIKTOK_REDIRECT_URI: process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL
    }
  });
}
