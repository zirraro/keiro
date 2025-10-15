export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { fetchTrending, fetchByQuery } from "@/lib/news";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || undefined;
  const topic = searchParams.get("topic") || undefined;
  try{
    const items = q ? await fetchByQuery(q, topic) : await fetchTrending(topic);
    return NextResponse.json({ items });
  }catch{
    return NextResponse.json({ items: [] });
  }
}
