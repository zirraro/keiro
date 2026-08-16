import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Reprendre les posts que le contrôle qualité a écartés.
 *
 * ── Le trou que ça bouche ──
 *
 * Un post refusé par le juge passe en `skipped`, et plus rien ne le regarde
 * jamais. Le cron de fraîcheur ne relit que les posts encore en course ; la
 * boucle de réparation complète n'est appelée que depuis une simulation
 * déclenchée à la main. Autrement dit : le refus qualité était TERMINAL, et
 * chaque refus valait un créneau vide définitif.
 *
 * Mesuré le 16 août : sur dix-huit posts programmés dans la journée, deux
 * publiés et neuf écartés par le juge. Le fondateur : « toujours délivrer et de
 * la qualité, le système mis en place est censé rouler tout seul. » Il ne
 * roulait pas : il refusait, et personne ne repassait derrière.
 *
 * ── Ce que ce passage fait ──
 *
 * Il reprend les refus RÉPARABLES des trois derniers jours, refait l'image
 * quand le grief porte sur elle — c'est presque toujours le cas — rejuge, et
 * reprogramme au prochain créneau libre quand le résultat tient.
 *
 * ── Ce qu'il ne touche pas, et pourquoi ──
 *
 * `qc_doublon` : republier un média déjà publié ne fait pas de vues, la
 * plateforme reconnaît le fichier. Le refus est juste et définitif.
 * `en_reserve` et `retard` : ce ne sont pas des refus de qualité, ce sont des
 * décisions de cadence et du ménage sur du vieux stock.
 * Les vidéos : refaire un reel coûte 0,26 € et dix minutes ; on ne le tente pas
 * en rattrapage automatique.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Le grief porte-t-il sur l'image ? C'est ce qui décide quoi refaire. */
function griefVisuel(motifs: string): boolean {
  return /l['’]image|le visuel|la photo|hors-sujet|n['’]illustre|ne montre|générée par ia|generee par ia|pictogramme|abstrait|artéfact|artefact/i.test(motifs);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const depuis = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const budgetMs = 240_000;
  const debut = Date.now();

  const { data: ecartes, error } = await supabase
    .from('content_calendar')
    .select('id, user_id, hook, caption, hashtags, visual_url, video_url, platform, format, publish_diagnostic, scheduled_date, qa_notes')
    .eq('status', 'skipped')
    .gte('scheduled_date', depuis)
    .is('video_url', null)
    .not('visual_url', 'is', null)
    .order('scheduled_date', { ascending: false })
    .limit(60);

  if (error) {
    console.error('[Rattrapage] lecture impossible :', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Un refus de qualité, pas une décision de cadence ni un doublon.
  const reparables = (ecartes || []).filter((p: any) => {
    const d = String(p.publish_diagnostic || '');
    if (!/^qc_/.test(d)) return false;
    if (/qc_doublon/.test(d)) return false;
    /**
     * ── Un échec de rattrapage ne se retente pas indéfiniment ──
     *
     * `qc_rattrapage_sans_succes` commence par `qc_` : sans cette ligne, un
     * post que la reprise n'a pas su sauver revenait à chaque passage, et on
     * régénérait son image toutes les douze heures pour rien. Huit
     * irrécupérables au premier essai, soit seize générations perdues par jour,
     * et le tas grossit à chaque tour.
     *
     * Une réparation qui a échoué sur un visuel refait et un jugement complet
     * n'échouera pas différemment demain avec le même texte.
     */
    if (/qc_rattrapage_sans_succes/.test(d)) return false;
    return true;
  });

  console.log(`[Rattrapage] ${reparables.length} refus réparable(s) sur ${(ecartes || []).length} écarté(s) depuis le ${depuis}`);

  let refaits = 0;
  let republies = 0;
  let irrecuperables = 0;
  let reportes = 0;
  const exemples: any[] = [];
  /**
   * ── L'occupation réelle du calendrier, pas seulement celle de ce passage ──
   *
   * Premier jet : un compteur qui repartait de zéro à chaque exécution. Le
   * passage du soir replaçait donc des posts sur les créneaux que celui du
   * matin venait de remplir — la salve revenait par la porte de derrière, deux
   * fois par jour.
   *
   * On lit ce qui est DÉJÀ programmé sur les quinze prochains jours, tous
   * statuts encore en course confondus. Un créneau occupé par une publication
   * normale l'est tout autant que par un rattrapage.
   */
  const dansQuinzeJours = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { data: dejaPlaces } = await supabase
    .from('content_calendar')
    .select('platform, scheduled_date, scheduled_time')
    .in('status', ['approved', 'pending_approval', 'draft'])
    .gte('scheduled_date', aujourdhui)
    .lte('scheduled_date', dansQuinzeJours)
    .limit(1000);

  const occupes = new Set<string>();
  const parJour = new Map<string, number>();
  for (const d of (dejaPlaces || []) as any[]) {
    const r = String(d.platform || '').toLowerCase();
    const cle = `${d.scheduled_date}|${r}`;
    occupes.add(`${cle}|${String(d.scheduled_time || '').slice(0, 8)}`);
    parJour.set(cle, (parJour.get(cle) || 0) + 1);
  }

  /** Le premier créneau libre pour ce réseau, en ouvrant des jours au besoin. */
  function prochainCreneauLibre(reseau: string): { date: string; heure: string } | null {
    const CRENEAUX = ['09:15:00', '11:00:00', '12:30:00', '17:45:00', '19:30:00'];
    const cap = reseau === 'tiktok' ? 2 : 5;
    for (let j = 1; j <= 14; j++) {
      const date = new Date(Date.now() + j * 86400000).toISOString().slice(0, 10);
      const cle = `${date}|${reseau}`;
      if ((parJour.get(cle) || 0) >= cap) continue;
      for (const heure of CRENEAUX) {
        if (occupes.has(`${cle}|${heure}`)) continue;
        occupes.add(`${cle}|${heure}`);
        parJour.set(cle, (parJour.get(cle) || 0) + 1);
        return { date, heure };
      }
    }
    // Quatorze jours pleins : mieux vaut laisser le post écarté que de le
    // pousser dans une journée déjà saturée.
    return null;
  }

  for (const p of reparables as any[]) {
    if (Date.now() - debut > budgetMs) {
      reportes = reparables.length - (refaits + irrecuperables);
      console.warn(`[Rattrapage] budget atteint — ${reportes} post(s) au passage suivant`);
      break;
    }

    try {
      const motifs = String(p.publish_diagnostic || '');

      // ── On refait l'image quand c'est elle qu'on reproche ──
      if (griefVisuel(motifs)) {
        const { regenererVisuelDepuisLegende } = await import('@/lib/qualite/refaire-visuel');
        const neuf = await regenererVisuelDepuisLegende({
          hook: p.hook || '',
          caption: p.caption || '',
          plateforme: p.platform,
          format: p.format || 'post',
          griefs: motifs,
          userId: p.user_id || null,
          visuelActuel: p.visual_url || null,
          // Le motif ne porte pas toujours la note ; sans elle, `choisirModeReparation`
          // retombe sur « refaire », ce qui est le choix prudent.
          note: Number((motifs.match(/(\d+)\/10/) || [])[1]) || null,
        });
        if (neuf) {
          p.visual_url = neuf;
          refaits++;
        }
      }

      // ── On rejuge avec le même portail que la publication ──
      const { controlerAvantPublication } = await import('@/lib/visuals/portail-publication');
      const verdict = await controlerAvantPublication(supabase, {
        id: p.id, user_id: p.user_id, hook: p.hook, caption: p.caption,
        hashtags: p.hashtags, visual_url: p.visual_url, video_url: null,
        platform: p.platform, format: p.format,
      });

      if (!verdict.publiable) {
        irrecuperables++;
        await supabase.from('content_calendar').update({
          publish_diagnostic: `qc_rattrapage_sans_succes: ${String(verdict.diagnostic || '').slice(0, 400)}`,
          visual_url: p.visual_url,
          updated_at: new Date().toISOString(),
        }).eq('id', p.id);
        continue;
      }

      /**
       * ── Étalé sur plusieurs jours, jamais deux au même créneau ──
       *
       * Republier au créneau d'origine, c'est publier en retard. Tout remettre
       * au lendemain, c'est une salve — et la salve fait chuter la portée,
       * précisément ce qu'on essaie de réparer. Un compte a déjà été bridé pour
       * ça : 27 vidéos en cinq minutes le 24 juin.
       *
       * Premier jet de ce fichier : je faisais tourner six créneaux avec
       * `republies % 6`. Sur quinze posts, le rotor repasse — trois vidéos
       * TikTok se sont retrouvées à 09 h 15 le même matin. Le commentaire
       * disait « on étale » et le code empilait.
       *
       * On place donc au PLUS un post par réseau et par créneau, en ouvrant un
       * jour de plus dès que la journée est pleine. Le plafond suit la cadence
       * réelle : deux par jour sur TikTok, cinq sur Instagram.
       */
      const reseau = String(p.platform || '').toLowerCase();
      const creneau = prochainCreneauLibre(reseau);
      if (!creneau) {
        // Le calendrier est plein sur quinze jours : on ne force pas, et on le
        // dit. Un post poussé dans une journée saturée devient une salve.
        console.warn(`[Rattrapage] ${p.id} : aucun créneau libre sur 14 j pour ${reseau} — laissé écarté`);
        reportes++;
        continue;
      }
      const demain = creneau.date;
      const heure = creneau.heure;

      await supabase.from('content_calendar').update({
        status: 'approved',
        visual_url: p.visual_url,
        scheduled_date: demain,
        scheduled_time: heure,
        publish_diagnostic: `qc_rattrape: refusé puis réparé, reprogrammé au ${demain} ${heure.slice(0, 5)}`,
        qa_notes: `${p.qa_notes ? p.qa_notes + '\n' : ''}[Rattrapage] visuel refait après refus — ${motifs.slice(0, 160)}`.slice(0, 4000),
        updated_at: new Date().toISOString(),
      }).eq('id', p.id);

      republies++;
      if (exemples.length < 5) exemples.push({ id: p.id, reseau: p.platform, format: p.format, motif: motifs.slice(0, 120) });
    } catch (e: any) {
      irrecuperables++;
      console.warn(`[Rattrapage] ${p.id} : ${e?.message}`);
    }
  }

  // Une reprise qui ne laisse pas de trace ne se distingue pas d'une absence
  // de reprise — c'est exactement ce qui a permis au trou de durer.
  try {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'rattrapage_ecartes',
      status: republies > 0 ? 'ok' : 'warning',
      data: { examines: reparables.length, visuels_refaits: refaits, remis_en_ligne: republies, irrecuperables, reportes },
      created_at: new Date().toISOString(),
    });
  } catch { /* la trace ne bloque pas la reprise */ }

  return NextResponse.json({
    ok: true,
    examines: reparables.length,
    visuels_refaits: refaits,
    remis_en_ligne: republies,
    irrecuperables,
    reportes,
    exemples,
  });
}
