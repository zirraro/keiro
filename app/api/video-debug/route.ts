import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const demo = process.env.REPLICATE_DEMO;
  let versionId: string | null = null;
  let error: string | null = null;

  try {
    if (token) {
      const replicate = new Replicate({ auth: token });
      const mdl: any = await replicate.models.get("luma", "ray");
      versionId = mdl?.latest_version?.id ?? mdl?.default_example?.version ?? null;
    }
  } catch (e: any) {
    error = e?.message || String(e);
  }

  return NextResponse.json({
    ok: true,
    hasToken: !!token,
    demo,
    versionId,
    error,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV
    }
  });
}
