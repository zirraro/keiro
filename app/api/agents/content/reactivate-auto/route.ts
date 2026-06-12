import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyReactivateToken, reactivateAutoPublish } from '@/lib/agents/auto-publish-cap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/content/reactivate-auto?user_id=..&platform=..&token=..
 *
 * One-click reactivation of auto-publish after the cap-60 pause (brief v2 §2).
 * Reached from the "cap atteint" email's signed link. Resets the network's
 * counter and turns the auto toggle back ON. Returns a friendly HTML page.
 */
function page(title: string, message: string, accent = '#7c3aed'): NextResponse {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f7;margin:0;padding:0;">
<div style="max-width:520px;margin:60px auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;text-align:center;">
  <div style="font-size:40px;margin-bottom:12px;">${accent === '#dc2626' ? '⚠️' : '✅'}</div>
  <h1 style="font-size:20px;color:#111;margin:0 0 8px;">${title}</h1>
  <p style="color:#4b5563;font-size:14px;line-height:1.6;">${message}</p>
  <a href="https://keiroai.com/assistant" style="display:inline-block;margin-top:20px;background:${accent};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;font-size:14px;">Ouvrir mon dashboard</a>
</div></body></html>`;
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id');
  const platform = req.nextUrl.searchParams.get('platform');
  const token = req.nextUrl.searchParams.get('token');

  if (!userId || !platform || !token || !verifyReactivateToken(userId, platform, token)) {
    return page('Lien invalide', 'Ce lien de réactivation est invalide ou a expiré. Tu peux réactiver la publication auto directement depuis ton dashboard.', '#dc2626');
  }

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const ok = await reactivateAutoPublish(supabase, userId, platform);
    const label = platform === 'tiktok' ? 'TikTok' : platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
    if (!ok) {
      return page('Réactivation impossible', `On n'a pas pu réactiver la publication auto sur ${label}. Réessaie depuis ton dashboard.`, '#dc2626');
    }
    return page('Publication auto réactivée 🎉', `Tes agents repartent en autonomie sur ${label}. Le compteur est remis à zéro — on te redemandera dans 60 publications.`);
  } catch {
    return page('Une erreur est survenue', 'Réessaie depuis ton dashboard.', '#dc2626');
  }
}
