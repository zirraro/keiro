export type JobKind = "image" | "video";
export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  // Pour l'image: data URL (ou URL signée), pour la vidéo: URL du mp4
  resultUrl?: string;
  error?: string;
  meta?: Record<string,string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __keiroJobs: Map<string, Job> | undefined;
}
const jobs: Map<string, Job> = globalThis.__keiroJobs ?? new Map();
globalThis.__keiroJobs = jobs;

function rid(len = 20) {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export function createJob(kind: JobKind, meta?: Record<string,string>) {
  const id = rid();
  const job: Job = { id, kind, status: "queued", meta };
  jobs.set(id, job);
  return job;
}

export function setJobStatus(id: string, status: JobStatus, patch?: Partial<Job>) {
  const j = jobs.get(id);
  if (!j) return;
  jobs.set(id, { ...j, status, ...(patch || {}) });
}

export function getJob(id: string) {
  return jobs.get(id);
}
