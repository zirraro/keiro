import { NextResponse } from "next/server";
import Replicate from "replicate";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const owner = "luma";
  const name = "ray";

  let versionId: string | null = null;
  let error: string | null = null;

  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing REPLICATE_API_TOKEN" }, { status: 500 });
  }

  try {
    const replicate = new Replicate({ auth: token });
    // ✅ SDK v1: deux arguments (owner, name)
    const mdl: any = await replicate.models.get(owner, name);
    versionId = mdl?.latest_version?.id ?? mdl?.default_example?.version ?? null;
  } catch (e: any) {
    error = e?.message || String(e);
  }

  return NextResponse.json({
    ok: true,
    hasToken: !!token,
    owner,
    name,
    versionId,
    error,
    vercelEnv: process.env.VERCEL_ENV,
  });
}
