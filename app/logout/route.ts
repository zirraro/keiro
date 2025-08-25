import { NextResponse } from "next/server";

/**
 * Minimal logout stub: just redirect to home.
 * (No Supabase/NextAuth dependency)
 */
export async function GET(req: Request) {
  const url = new URL("/", req.url);
  return NextResponse.redirect(url);
}
