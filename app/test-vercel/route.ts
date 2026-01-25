import { NextResponse } from 'next/server';

/**
 * Simple diagnostic route to test if new routes deploy correctly on Vercel
 */
export async function GET() {
  return NextResponse.json({
    message: 'Vercel deployment is working correctly!',
    timestamp: new Date().toISOString(),
    deployedFiles: {
      instagramCallback: 'Should be at /instagram-callback'
    }
  });
}
