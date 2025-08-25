import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

/**
 * Temporary stub while auth is disabled.
 * Fixes build error: "authOptions is not a valid Route export field."
 */
export async function GET() {
  return NextResponse.json({ ok: false, reason: "Auth disabled (stub)" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ ok: false, reason: "Auth disabled (stub)" }, { status: 501 });
}
