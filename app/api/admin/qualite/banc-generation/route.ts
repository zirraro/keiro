import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Le banc d'essai de la génération : combien passent, et pourquoi les autres non.
 *
 * ── Pourquoi ce banc existe ──
 *
 * Fondateur, 2026-08-13 : « il faut revoir tout le système de génération et de
 * prompting, améliorer, tester, simuler et s'auto-challenger pour identifier les
 * points de friction jusqu'à trouver le système optimal. »
 *
 * Il a raison sur le fond, et sur la méthode que je n'avais pas. J'ai passé la
 * journée à corriger à l'aveugle : générer trois posts, voir un défaut, changer
 * une consigne, recommencer. Chaque correction paraissait juste et le taux de
 * réussite n'a jamais été mesuré. On ne pilote pas un système comme ça.
 *
 * Ce banc répond à trois questions, et à elles seules :
 *   1. Combien de générations passent le contrôle DU PREMIER COUP ?
 *   2. Quelle note obtiennent-elles en moyenne ?
 *   3. Quels motifs de refus reviennent le plus ?
 *
 * La troisième est la plus utile : elle donne le prochain point de friction à
 * traiter, au lieu de le deviner. Corriger le motif le plus fréquent fait plus
 * de bien que trois intuitions.
 *
 * ── Ce qu'il ne fait PAS ──
 *
 * Il ne publie rien. Tester la qualité ne doit jamais coûter une publication —
 * c'est la leçon des cinq posts partis en vingt-trois minutes le matin même.
 *
 * ── Son coût, et pourquoi il est acceptable ──
 *
 * Chaque essai coûte une génération de texte, une image et un contrôle de
 * vision : environ quatre centimes. Six essais reviennent à un quart d'euro,
 * pour savoir si le système livre ou non. Sans ce chiffre, on corrige au hasard
 * et chaque correction ratée coûte bien davantage.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Ce qu'on demande au banc de couvrir : les formats réellement livrés. */
const PLAN: Array<{ platform: string; format: string }> = [
  { platform: 'instagram', format: 'post' },
  { platform: 'instagram', format: 'post' },
  { platform: 'instagram', format: 'carrousel' },
  { platform: 'instagram', format: 'story' },
  { platform: 'tiktok', format: 'post' },
  { platform: 'tiktok', format: 'carrousel' },
];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'user_id requis — on ne teste jamais sans savoir pour qui' }, { status: 400 });
  }
  const combien = Math.min(PLAN.length, Math.max(1, Number(req.nextUrl.searchParams.get('n') || 4)));
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
  const supabase = sb();

  const essais = PLAN.slice(0, combien);
  const resultats: any[] = [];

  // En série, pas en parallèle : six générations simultanées saturent le
  // fournisseur d'images et font échouer des essais pour une raison qui n'a
  // rien à voir avec la qualité — on mesurerait alors notre propre impatience.
  for (const e of essais) {
    const debut = Date.now();
    try {
      const g = await fetch(`${base}/api/agents/content?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ action: 'generate_post', platform: e.platform, format: e.format, user_id: userId }),
      });
      const gj = await g.json().catch(() => ({}));
      const post = (gj as any)?.post;
      if (!post?.id) {
        resultats.push({ ...e, echec: 'generation', detail: String((gj as any)?.error || (gj as any)?.skipped || '').slice(0, 120) });
        continue;
      }

      // ── On mesure la CHAÎNE COMPLÈTE, pas le premier jet ──
      //
      // Fondateur, 2026-08-14 : « 3 sur 4 passent du premier coup, mais ça veut
      // dire qu'on a réessayé pour un post — est-ce que ça s'est bien passé, au
      // 2e essai si c'est un reel, jusqu'au 3e si c'est une image ? Il faut bien
      // savoir ça, car de toute façon on doit délivrer, jamais rester sur un
      // échec. »
      //
      // Le banc ne mesurait que le premier essai : il disait « 3 sur 4 passent »
      // sans jamais dire ce qu'il advenait du quatrième. Or c'est précisément la
      // question — le taux qui compte n'est pas celui du premier jet, c'est
      // celui de ce que le client reçoit AU BOUT.
      const c = await fetch(`${base}/api/agents/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ action: 'controler', postId: post.id, reparer: true }),
      });
      const v = await c.json().catch(() => ({}));

      resultats.push({
        ...e,
        post_id: post.id,
        pilier: post.pillar,
        accroche: String(post.hook || '').slice(0, 90),
        diapositives: Array.isArray(post.slides) ? post.slides.length : 0,
        note: (v as any).note ?? null,
        publiable: !!(v as any).publiable,
        motifs: ((v as any).motifs || []).map((m: string) => String(m).slice(0, 160)),
        essai_gagnant: (v as any).essai_gagnant ?? null,
        essais: (v as any).essais ?? 1,
        journal: (v as any).journal || [],
        secondes: Math.round((Date.now() - debut) / 1000),
      });
    } catch (err: any) {
      resultats.push({ ...e, echec: 'exception', detail: String(err?.message || '').slice(0, 120) });
    }
  }

  // ── Le classement des frictions ──
  //
  // On regroupe les motifs par thème plutôt que mot à mot : « l'image n'illustre
  // pas le propos » et « l'image est hors-sujet » sont le même problème, et les
  // compter séparément masquerait qu'il domine.
  const THEMES: Array<[string, RegExp]> = [
    ['image hors-sujet', /image.*(hors[- ]sujet|n.illustre pas|ne correspond|sans rapport)/i],
    ['actualité non pertinente', /actualit|lien.*forc|pr[ée]texte/i],
    ['client ou cas inventé', /invent|fictif|t[ée]moignage/i],
    ['accroche faible', /accroche.*(faible|molle|g[ée]n[ée]rique)/i],
    ['hashtags à côté', /hashtag/i],
    ['image vide ou abstraite', /vide|abstrait|pictogramme/i],
    ['chiffre invraisemblable', /chiffre|invraisembl|aberrant/i],
  ];
  const frictions = new Map<string, number>();
  for (const r of resultats) {
    for (const m of r.motifs || []) {
      const theme = THEMES.find(([, rx]) => rx.test(m))?.[0] || 'autre';
      frictions.set(theme, (frictions.get(theme) || 0) + 1);
    }
  }

  const mesures = resultats.filter(r => typeof r.note === 'number');
  const passent = mesures.filter(r => r.publiable).length;
  const excellents = mesures.filter(r => (r.note || 0) >= 8).length;
  const moyenne = mesures.length
    ? Math.round((mesures.reduce((s, r) => s + (r.note || 0), 0) / mesures.length) * 10) / 10
    : null;

  const classement = [...frictions.entries()].sort((a, b) => b[1] - a[1]);

  // La conclusion en clair : c'est elle qu'on vient chercher, pas le tableau.
  const verdict = mesures.length === 0
    ? 'Aucune génération mesurable — le problème est en amont du contrôle.'
    : classement.length === 0
      ? `Tout passe (${passent}/${mesures.length}), note moyenne ${moyenne}/10.`
      : `${passent}/${mesures.length} passent du premier coup (moyenne ${moyenne}/10, ${excellents} au niveau visé). `
        + `Point de friction n°1 : ${classement[0][0]} (${classement[0][1]} occurrence(s)). C'est celui-là qu'il faut traiter avant les autres.`;

  // Trace, pour suivre l'évolution du taux d'un passage à l'autre.
  try {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'banc_generation', status: 'ok', user_id: userId,
      data: {
        essais: mesures.length, passent, excellents, moyenne,
        frictions: Object.fromEntries(classement),
      },
      created_at: new Date().toISOString(),
    });
  } catch { /* la trace ne bloque pas la mesure */ }

  return NextResponse.json({
    ok: true,
    verdict,
    resume: {
      essais: resultats.length,
      mesurables: mesures.length,
      passent_du_premier_coup: passent,
      au_niveau_vise_8: excellents,
      note_moyenne: moyenne,
      secondes_moyennes: mesures.length
        ? Math.round(mesures.reduce((s, r) => s + (r.secondes || 0), 0) / mesures.length)
        : null,
    },
    frictions: classement.map(([theme, n]) => ({ theme, occurrences: n })),
    detail: resultats,
  });
}
