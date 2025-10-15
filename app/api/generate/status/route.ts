import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") || "";
  if (!jobId) {
    return NextResponse.json({ status: "error", error: "missing jobId" }, { status: 400 });
  }
  try {
    const p = path.join(process.cwd(), "public", "previews", `${jobId}.png`);
    await fs.access(p);
    return NextResponse.json({ status: "done", url: `/previews/${jobId}.png` }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "running" }, { status: 200 });
  }
}
