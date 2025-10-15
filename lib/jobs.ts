export type GenKind = "image" | "video";
export type JobStatus = "queued" | "running" | "done" | "error";

export async function startJob(payload: any) {
  const r = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ jobId: string }>;
}

export async function getStatus(jobId: string) {
  const r = await fetch(`/api/generate/status?jobId=${encodeURIComponent(jobId)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ status: JobStatus; error?: string }>;
}
