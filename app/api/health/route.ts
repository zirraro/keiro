import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      ARK_BASE: process.env.ARK_BASE || null,
      ARK_T2I_MODEL: process.env.ARK_T2I_MODEL || null,
      ARK_EDIT_MODEL: process.env.ARK_EDIT_MODEL || null,
      ARK_KEY_LEN: (process.env.ARK_API_KEY || '').length,
    }
  });
}
