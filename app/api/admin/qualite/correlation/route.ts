import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Notre note vaut-elle quelque chose ? La réponse est dans l'engagement réel.
 *
 * ── Pourquoi cette route existe ──
 *
 * Fondateur, 2026-08-13 : « il faut une route qui track les résultats de ce
 * qu'on a considéré comme un 6, 7, 8, 9 ou 10, et les likes/vues que
 * l'algorithme a poussés — l'attention que ça a générée. On améliore
 * constamment avec le feedback pour toujours aller dans le sens de l'attention
 * et de l'algorithme. »
 *
 * C'est la question qu'on ne s'était jamais posée. On a passé des jours à
 * régler un barème — plancher à 6, à 7, défauts éliminatoires ou pénalisants —
 * sans jamais vérifier qu'il PRÉDIT quoi que ce soit. Si nos 9 ne font pas
 * mieux que nos 6, le barème ne mesure rien : il exprime un goût, et on a
 * discuté de goût pendant trois jours.
 *
 * ── Ce que ça permet de décider ──
 *
 * · Si l'écart est net, on relève le plancher : chaque point gagné rapporte.
 * · Si l'écart est nul, le barème est à refaire — et on saura que le temps
 *   passé à l'affiner était perdu.
 * · Si un FORMAT performe mieux à note égale, on rééquilibre la rotation.
 *
 * ── Prudence de lecture ──
 *
 * Un post récent n'a pas fini sa vie : on ne compte que ceux publiés depuis
 * plus de 48 h, sinon les derniers publiés tirent la moyenne vers le bas et on
 * conclurait l'inverse de la vérité. Et sous cinq posts par tranche, on affiche
 * l'effectif sans conclure : trois posts ne font pas une tendance, quoi qu'en
 * dise la moyenne.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * L'attention reçue par un post, toutes plateformes confondues.
 *
 * Vues et portée d'abord — c'est ce que l'algorithme a décidé de pousser, donc
 * le signal le plus proche de ce qu'on veut optimiser. Les likes et commentaires
 * mesurent ce que le contenu a provoqué UNE FOIS vu : on les garde à part, sinon
 * un post très vu et peu aimé se confondrait avec un post peu vu et très aimé.
 */
function attention(e: any) {
  const vues = Number(e?.views || 0) || Number(e?.play_count || 0) || Number(e?.impressions || 0) || Number(e?.reach || 0);
  const reactions = Number(e?.like_count || 0) + Number(e?.comments_count || 0) * 3 + Number(e?.saved || 0) * 5;
  return { vues, reactions };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const jours = Math.min(180, Math.max(7, Number(req.nextUrl.searchParams.get('jours') || 60)));
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();

  // 1. Les verdicts rendus : quelle note on a mise, à quel post.
  const { data: verdicts } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .in('action', ['qc_verdict', 'qc_note_faible'])
    .gte('created_at', depuis)
    .limit(2000);

  const notePar = new Map<string, { note: number; reseau: string; format: string }>();
  for (const l of verdicts || []) {
    const d = (l as any).data || {};
    if (!d.post_id || typeof d.note !== 'number') continue;
    // Si un post a été jugé plusieurs fois, on garde le DERNIER verdict —
    // c'est celui sous lequel il est parti.
    notePar.set(String(d.post_id), {
      note: Math.round(d.note),
      reseau: String(d.reseau || '?'),
      format: String(d.format || '?'),
    });
  }

  if (notePar.size === 0) {
    return NextResponse.json({
      ok: true, fenetre_jours: jours, posts_notes: 0,
      message: "Aucun verdict enregistré sur la période. L'enregistrement de TOUTES les notes date du 2026-08-13 : la corrélation ne deviendra lisible qu'après quelques semaines de publications.",
    });
  }

  // 2. Ce que ces posts ont réellement obtenu.
  const ids = [...notePar.keys()];
  const { data: posts } = await supabase
    .from('content_calendar')
    .select('id, platform, format, published_at, engagement_data, hook')
    .in('id', ids.slice(0, 1000))
    .eq('status', 'published')
    .not('engagement_data', 'is', null);

  const murissement = Date.now() - 48 * 3600 * 1000;
  const tranches = new Map<number, { n: number; vues: number; reactions: number; exemples: string[] }>();
  const parFormat = new Map<string, { n: number; vues: number }>();
  let ignores_trop_recents = 0;

  for (const p of posts || []) {
    const v = notePar.get(String(p.id));
    if (!v) continue;
    if (!p.published_at || new Date(p.published_at).getTime() > murissement) { ignores_trop_recents++; continue; }
    const a = attention(p.engagement_data);

    const t = tranches.get(v.note) || { n: 0, vues: 0, reactions: 0, exemples: [] };
    t.n++; t.vues += a.vues; t.reactions += a.reactions;
    if (t.exemples.length < 3) t.exemples.push(`${String(p.hook || '').slice(0, 50)} — ${a.vues} vues`);
    tranches.set(v.note, t);

    const cleF = `${p.platform}/${p.format}`;
    const f = parFormat.get(cleF) || { n: 0, vues: 0 };
    f.n++; f.vues += a.vues;
    parFormat.set(cleF, f);
  }

  const parNote = [...tranches.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([note, t]) => ({
      note,
      posts: t.n,
      vues_moyennes: Math.round(t.vues / t.n),
      reactions_moyennes: Math.round(t.reactions / t.n),
      // Sous cinq posts, une moyenne ne veut rien dire — on le dit plutôt que
      // de laisser lire un chiffre comme une tendance.
      fiable: t.n >= 5,
      exemples: t.exemples,
    }));

  // La conclusion, écrite en clair : c'est elle qu'on vient chercher.
  const fiables = parNote.filter(x => x.fiable);
  let verdict = "Pas encore assez de données pour conclure — il faut au moins cinq posts par note.";
  if (fiables.length >= 2) {
    const bas = fiables[0];
    const haut = fiables[fiables.length - 1];
    const ecart = bas.vues_moyennes > 0
      ? Math.round(((haut.vues_moyennes - bas.vues_moyennes) / bas.vues_moyennes) * 100)
      : null;
    verdict = ecart === null
      ? "Aucune vue mesurée sur la tranche basse — corrélation incalculable."
      : ecart > 25
        ? `Notre note PRÉDIT l'attention : les ${haut.note}/10 font ${ecart} % de vues en plus que les ${bas.note}/10. Relever le plancher rapporte.`
        : ecart < -10
          ? `ALERTE — les notes BASSES performent mieux (${-ecart} % de vues en plus). Le barème mesure l'inverse de ce qui marche : il est à refaire.`
          : `Notre note ne prédit presque RIEN (${ecart} % d'écart). Le barème exprime un goût, pas une performance — l'affiner davantage ne rapportera pas.`;
  }

  return NextResponse.json({
    ok: true,
    fenetre_jours: jours,
    posts_notes: notePar.size,
    posts_mesurables: parNote.reduce((s, x) => s + x.posts, 0),
    ignores_trop_recents,
    verdict,
    par_note: parNote,
    par_format: [...parFormat.entries()]
      .map(([cle, f]) => ({ format: cle, posts: f.n, vues_moyennes: Math.round(f.vues / f.n) }))
      .sort((a, b) => b.vues_moyennes - a.vues_moyennes),
  });
}
