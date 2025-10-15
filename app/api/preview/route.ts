import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") || "";
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  if (job.status !== "done" || !job.resultUrl) {
    return NextResponse.json({ error: "job not done" }, { status: 409 });
  }

  // Si resultUrl est une data URL -> renvoie le binaire
  if (job.resultUrl.startsWith("data:image/")) {
    const [, meta, b64] = job.resultUrl.match(/^data:(image\/\w+);base64,(.+)$/) || [];
    if (!b64) return NextResponse.json({ error: "bad data URL" }, { status: 500 });
    const buf = Buffer.from(b64, "base64");
    return new NextResponse(buf, {
      headers: { "content-type": meta || "image/png" },
    });
  }

  // Sinon, redirige vers l'URL (ex: vidéo)
  return NextResponse.redirect(job.resultUrl);
}
