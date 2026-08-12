import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isNoContentAccount } from '@/lib/agents/internal-accounts';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Qui publie, sur quel réseau, avec quel jeton.
 *
 * ── Pourquoi cette page existe ──
 *
 * Fondateur, 2026-08-13 : « les comptes Insta et TikTok qui publient, tu te
 * mélanges beaucoup. Identifie-les et garde-les. »
 *
 * Il a raison, et je m'y suis perdu moi-même : j'ai lancé trois générations de
 * test sur le bac à sable `metareview` en croyant travailler sur le compte
 * vitrine, puis conclu à tort qu'Instagram était déconnecté alors que le vrai
 * problème était une publication sans propriétaire. Chaque fois, l'information
 * existait en base — il fallait la reconstituer à la main, requête par requête.
 *
 * Ce qu'on ne peut pas lire d'un coup d'œil, on finit par le deviner. Et on
 * devine mal.
 *
 * ── Ce qu'on montre, et pourquoi ──
 *
 * Un jeton présent ne veut pas dire un jeton valide : on affiche donc aussi son
 * échéance quand elle est connue. Un compte interne est marqué comme tel, parce
 * que « aucune publication » y est une décision et non une panne — sans cette
 * mention, chaque relecture du tableau relance la même fausse alerte.
 *
 * Lecture seule. Rien n'est modifié, rien n'est déclenché.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Ne jamais renvoyer un jeton. On dit s'il existe, et jusqu'à quand. */
function etatJeton(valeur: unknown, echeance?: unknown): string {
  if (!valeur) return 'absent';
  if (!echeance) return 'présent';
  const d = new Date(String(echeance));
  if (Number.isNaN(d.getTime())) return 'présent';
  const jours = Math.round((d.getTime() - Date.now()) / 86400000);
  if (jours < 0) return `EXPIRÉ depuis ${-jours} j`;
  if (jours <= 7) return `expire dans ${jours} j`;
  return `valide ${jours} j`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();

  const { data: profils, error } = await supabase
    .from('profiles')
    .select([
      'id', 'email', 'is_admin', 'subscription_plan',
      'instagram_business_account_id', 'instagram_username',
      'facebook_page_access_token', 'instagram_igaa_token', 'instagram_token_expires_at',
      'tiktok_access_token', 'tiktok_username', 'tiktok_token_expires_at',
      'linkedin_access_token', 'linkedin_token_expires_at',
    ].join(', '));

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Combien de publications chaque compte porte, et dans quel état. C'est ce
  // qui distingue un compte vivant d'un compte qui accumule sans jamais sortir.
  const { data: posts } = await supabase
    .from('content_calendar')
    .select('user_id, platform, status')
    .limit(5000);

  const compte: Record<string, Record<string, number>> = {};
  for (const p of posts || []) {
    const k = String((p as any).user_id || 'ORPHELIN');
    const cle = `${(p as any).platform}_${(p as any).status}`;
    (compte[k] ||= {})[cle] = ((compte[k] ||= {})[cle] || 0) + 1;
  }

  const lignes = (profils || [])
    .map((p: any) => {
      const ig = !!(p.facebook_page_access_token || p.instagram_igaa_token);
      const tt = !!p.tiktok_access_token;
      const li = !!p.linkedin_access_token;
      return {
        user_id: p.id,
        email: p.email,
        plan: p.subscription_plan || null,
        admin: !!p.is_admin,
        interne: isNoContentAccount({ email: p.email, userId: p.id }),
        instagram: {
          connecte: ig,
          compte: p.instagram_username || null,
          business_id: p.instagram_business_account_id || null,
          jeton: etatJeton(p.facebook_page_access_token || p.instagram_igaa_token, p.instagram_token_expires_at),
        },
        tiktok: {
          connecte: tt,
          compte: p.tiktok_username || null,
          jeton: etatJeton(p.tiktok_access_token, p.tiktok_token_expires_at),
        },
        linkedin: {
          connecte: li,
          jeton: etatJeton(p.linkedin_access_token, p.linkedin_token_expires_at),
        },
        publications: compte[p.id] || {},
        // Un compte sans aucun réseau ni aucune publication n'apprend rien :
        // on le garde dans le total mais on le sort de la liste détaillée.
        _vide: !ig && !tt && !li && Object.keys(compte[p.id] || {}).length === 0,
      };
    })
    .filter((l: any) => !l._vide)
    .map(({ _vide, ...l }: any) => l);

  const orphelines = compte['ORPHELIN'] || {};

  return NextResponse.json({
    ok: true,
    resume: {
      profils_total: (profils || []).length,
      avec_instagram: lignes.filter((l: any) => l.instagram.connecte).length,
      avec_tiktok: lignes.filter((l: any) => l.tiktok.connecte).length,
      avec_linkedin: lignes.filter((l: any) => l.linkedin.connecte).length,
      comptes_internes: lignes.filter((l: any) => l.interne).length,
      // Une publication sans propriétaire ne partira JAMAIS : aucun jeton n'est
      // résoluble pour elle. Elle reste en base à l'état « approuvée » et
      // occupe une place dans le calendrier sans jamais sortir.
      publications_orphelines: Object.values(orphelines).reduce((a: number, b: any) => a + b, 0),
      detail_orphelines: orphelines,
    },
    comptes: lignes,
  });
}
