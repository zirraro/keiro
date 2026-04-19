import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/version
 * Public endpoint exposing the currently deployed git SHA + short message.
 * Used for deploy visibility since we're no longer running on Vercel and
 * the user needs a way to confirm a push reached production.
 *
 * Cached per-build: reads once at module load, then serves from memory.
 */

let cachedVersion: {
  sha: string;
  shortSha: string;
  message: string;
  branch: string;
  committedAt: string;
  deployedAt: string;
} | null = null;

function readVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const sha = execSync('git rev-parse HEAD').toString().trim();
    const message = execSync('git log -1 --pretty=%s').toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const committedAt = execSync('git log -1 --pretty=%cI').toString().trim();
    cachedVersion = {
      sha,
      shortSha: sha.substring(0, 7),
      message,
      branch,
      committedAt,
      deployedAt: new Date().toISOString(),
    };
  } catch {
    cachedVersion = {
      sha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      shortSha: (process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').substring(0, 7),
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
      branch: process.env.VERCEL_GIT_COMMIT_REF || 'main',
      committedAt: '',
      deployedAt: new Date().toISOString(),
    };
  }
  return cachedVersion;
}

export async function GET() {
  return NextResponse.json(readVersion());
}
