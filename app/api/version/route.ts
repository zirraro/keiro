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
    // ── Le SHA du BUILD, pas celui du code source ──
    //
    // 2026-08-11. Pendant la panne, cet endpoint était mon seul signal depuis
    // l'extérieur — et il a menti. Une remise en route avait tiré les sources
    // sans reconstruire : `git rev-parse HEAD` renvoyait le dernier commit,
    // alors que l'application servie datait de deux commits plus tôt. On croit
    // un correctif en ligne alors qu'il n'est même pas compilé.
    //
    // `deploy.sh` écrit le commit RÉELLEMENT construit dans .next/SHA-DEPLOYE,
    // juste après le build. Ce fichier fait foi ; git n'est plus qu'un repli
    // pour les environnements qui n'ont pas de build (développement).
    let sha = '';
    try {
      sha = require('fs').readFileSync('.next/SHA-DEPLOYE', 'utf8').trim();
    } catch { /* pas de build tracé : on retombe sur git */ }
    if (!sha) sha = execSync('git rev-parse HEAD').toString().trim();
    const message = execSync(`git log -1 --pretty=%s ${sha}`).toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const committedAt = execSync(`git log -1 --pretty=%cI ${sha}`).toString().trim();
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
  // Le numéro d'instance permet de vérifier de l'EXTÉRIEUR que l'application
  // tourne bien en plusieurs processus — c'est ce qui rend un déploiement
  // sans coupure possible. pm2 ne renseigne NODE_APP_INSTANCE qu'en mode
  // cluster : absent, on est repassé en processus unique, et la prochaine mise
  // à jour coupera le site sans que personne ne s'en aperçoive avant le client.
  // Ajouté le 2026-08-11, faute de pouvoir lire l'état de pm2 autrement.
  return NextResponse.json({
    ...readVersion(),
    instance: process.env.NODE_APP_INSTANCE ?? null,
    modeCluster: process.env.NODE_APP_INSTANCE != null,
  });
}
