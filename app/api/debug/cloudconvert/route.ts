import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/debug/cloudconvert
 * Diagnostic endpoint to check if CloudConvert API key is loaded
 */
export async function GET(req: NextRequest) {
  const cloudConvertApiKey = process.env.CLOUDCONVERT_API_KEY;

  return NextResponse.json({
    cloudconvert_configured: !!cloudConvertApiKey,
    api_key_length: cloudConvertApiKey?.length || 0,
    api_key_preview: cloudConvertApiKey ? cloudConvertApiKey.substring(0, 20) + '...' : 'NOT SET',
    environment: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV,
    timestamp: new Date().toISOString(),
    message: cloudConvertApiKey
      ? '✅ CloudConvert API key is loaded and ready'
      : '❌ CloudConvert API key is NOT loaded - check Vercel environment variables and redeploy'
  });
}
