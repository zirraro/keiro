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
    /**
     * ── Un échec de publication est une livraison manquée, pas un incident clos ──
     *
     * La reprise ne regardait que les posts `skipped`. Le rapport du matin du
     * 18 août liste pourtant trois livraisons manquées dont deux qu'elle ne
     * pouvait pas voir : un `publish_failed` sur TikTok, et un post retenu pour
     * doublon.
     *
     * Le fondateur : « je ne veux plus les voir apparaître, mets des garde-fous
     * pour toujours délivrer ce qui est prévu, et à la qualité mise en place. »
     * Un créneau vide reste un créneau vide, quel que soit le statut qui l'a
     * produit.
     */
    /**
     * ── `draft` ajouté le 21 août : 70 posts dormaient hors de portée ──
     *
     * Fondateur : « le quota TikTok n'a pas été respecté, pourquoi ? ça doit
     * toujours délivrer », puis « vérifie les posts en brouillon et programmés,
     * mais toujours délivrer, que ce soit images, carrousels et vidéos ».
     *
     * Mesuré : sur sept jours, TikTok comptait 70 brouillons pour 6 publiés.
     * Ce rattrapage ne ramassait que `skipped` et `publish_failed` — or le
     * portail de publication met les refus du juge en `draft`. Les posts les
     * plus nombreux étaient donc précisément ceux que personne ne reprenait.
     *
     * Le statut n'est qu'une étiquette : ce qui compte est le MOTIF. Un post
     * refusé pour sa qualité est réparable, quel que soit le tiroir où il a
     * atterri. Le filtre par diagnostic, juste en dessous, fait déjà ce tri —
     * il lui manquait seulement d'être alimenté.
     *
     * La contrainte `video_url is null` est levée : elle écartait tous les
     * reels du rattrapage, alors qu'un reel refusé est un créneau perdu au même
     * titre. « Que ce soit images, carrousels ET vidéos. »
     */
    .in('status', ['skipped', 'publish_failed', 'draft'])
    .gte('scheduled_date', depuis)
    .or('visual_url.not.is.null,video_url.not.is.null')
    .order('scheduled_date', { ascending: false })
    .limit(120);

  if (error) {
    console.error('[Rattrapage] lecture impossible :', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Un refus de qualité, pas une décision de cadence ni un doublon.
  const reparables = (ecartes || []).filter((p: any) => {
    const d = String(p.publish_diagnostic || '');
    /**
     * ── Le doublon se répare, il ne se jette pas ──
     *
     * Je l'avais exclu en écrivant « republier un média déjà publié ne fait pas
     * de vues, la plateforme reconnaît le fichier ». C'est vrai, et j'en tirais
     * la mauvaise conclusion : on n'abandonne pas le créneau, on change
     * l'image. Un visuel neuf n'est plus un doublon, et le post part.
     *
     * Le rapport du matin comptait donc ce créneau comme une livraison manquée
     * — à juste titre, puisque personne ne repassait derrière.
     */
    if (!/^qc_/.test(d) && !/^publication_(instagram|tiktok)_echouee/.test(d) && !/^reel_sans_video/.test(d)) return false;
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

  /**
   * ── Sortir la réserve du tiroir sans issue ──
   *
   * Fondateur : « le quota TikTok n'a pas été respecté, pourquoi ? ça doit
   * toujours délivrer », puis « vérifie les posts en brouillon et programmés ».
   *
   * Mesuré : 87 posts portaient `en_reserve`, contre 4 refusés par le juge. La
   * cause n'était donc pas la qualité, comme je l'avais d'abord conclu.
   *
   * planning-cadence LIT ['approved','scheduled','pending'] et ÉCRIT `draft`
   * pour tout ce qui dépasse la cadence. Il ne relit jamais les `draft` : un
   * post entré en réserve n'en sort JAMAIS. Le commentaire du code promet « la
   * génération courante peut le reprendre » — rien ne le reprend. C'est un
   * aller simple, et pendant que 87 posts prêts y dorment, les créneaux passent
   * à vide et on régénère du contenu neuf par-dessus.
   *
   * On rouvre donc le tiroir ici, où la place libre est déjà calculée : dès
   * qu'un créneau du jour reste vide, on y remet un post de la réserve plutôt
   * que d'en fabriquer un. Le plus ancien d'abord — il a déjà attendu.
   *
   * Ce qu'on ne fait PAS : vider la réserve d'un coup. Elle existe pour tenir
   * la cadence, et une salve fait chuter la portée — c'est précisément ce qui
   * avait provoqué l'étranglement TikTok de juin. On remplit les trous, on n'en
   * crée pas de nouveaux.
   */
  /**
   * Le filtre sur le motif se fait en JS, pas en SQL : `publish_diagnostic` est
   * une colonne JSONB, et un `.like()` dessus échoue avec « operator does not
   * exist: jsonb ~~ unknown ». Écrit d'abord en SQL, la requête ne rendait
   * simplement RIEN — en silence, comme toujours avec ce piège. C'est la
   * sixième fois cette semaine qu'une hypothèse sur une colonne me coûte un
   * aller-retour ; la vérification prend dix secondes, elle vaut mieux que la
   * conviction.
   */
  const { data: brouillons } = await supabase
    .from('content_calendar')
    .select('id, platform, format, scheduled_date, publish_diagnostic')
    .eq('status', 'draft')
    .or('visual_url.not.is.null,video_url.not.is.null')
    .order('scheduled_date', { ascending: true })
    .limit(300);

  const reserve = (brouillons || [])
    .filter((p: any) => String(p.publish_diagnostic || '').startsWith('en_reserve'))
    .slice(0, 50);

  console.log(`[Rattrapage] ${reserve?.length ?? 0} post(s) en réserve disponibles pour combler les créneaux vides`);

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

  /**
   * ── Le calendrier se remet d'aplomb tout seul ──
   *
   * Constaté le 16 août en relisant la file : seize créneaux occupés deux fois
   * et cinq journées au-dessus du plafond — dont trois publications Instagram
   * à 12 h 30 le même jour. Ces collisions ne venaient PAS du rattrapage :
   * c'est le pipeline normal qui les avait produites, chacun de ses chemins
   * plaçant sans savoir ce que les autres avaient déjà posé.
   *
   * Je les ai défaites une fois à la main. Ça se reproduira, donc on le fait
   * ici, à chaque passage : deux publications d'un même réseau ne partagent
   * jamais une minute, et une journée ne dépasse jamais sa cadence — deux sur
   * TikTok, cinq sur Instagram. Le surplus glisse au premier jour qui a de la
   * place, et le contenu du pipeline garde sa place avant les rattrapages.
   *
   * C'est la salve qu'on évite : un compte a déjà été bridé pour 27 vidéos en
   * cinq minutes.
   */
  async function reequilibrerCalendrier(): Promise<number> {
    const CRENEAUX = ['09:15:00', '11:00:00', '12:30:00', '17:45:00', '19:30:00'];
    const { data: file } = await supabase
      .from('content_calendar')
      .select('id, platform, scheduled_date, scheduled_time, publish_diagnostic')
      .in('status', ['approved', 'pending_approval'])
      .gte('scheduled_date', aujourdhui)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .limit(400);

    const pris = new Set<string>();
    const compte = new Map<string, number>();
    const aDeplacer: any[] = [];
    for (const p of (file || []) as any[]) {
      const r = String(p.platform || '').toLowerCase();
      const cap = r === 'tiktok' ? 2 : 5;
      const jour = `${p.scheduled_date}|${r}`;
      const minute = `${jour}|${String(p.scheduled_time || '').slice(0, 8)}`;
      if (pris.has(minute) || (compte.get(jour) || 0) >= cap) { aDeplacer.push(p); continue; }
      pris.add(minute);
      compte.set(jour, (compte.get(jour) || 0) + 1);
    }
    // Un rattrapage cède le pas au contenu du planning normal.
    aDeplacer.sort((a, b) =>
      (/qc_rattrape/.test(b.publish_diagnostic || '') ? 1 : 0) - (/qc_rattrape/.test(a.publish_diagnostic || '') ? 1 : 0));

    let deplaces = 0;
    for (const p of aDeplacer) {
      const r = String(p.platform || '').toLowerCase();
      const cap = r === 'tiktok' ? 2 : 5;
      let place: { d: string; h: string } | null = null;
      for (let j = 1; j <= 40 && !place; j++) {
        const d = new Date(Date.parse(p.scheduled_date) + j * 86400000).toISOString().slice(0, 10);
        const jour = `${d}|${r}`;
        if ((compte.get(jour) || 0) >= cap) continue;
        for (const h of CRENEAUX) {
          if (pris.has(`${jour}|${h}`)) continue;
          pris.add(`${jour}|${h}`);
          compte.set(jour, (compte.get(jour) || 0) + 1);
          place = { d, h };
          break;
        }
      }
      if (!place) continue;
      await supabase.from('content_calendar')
        .update({ scheduled_date: place.d, scheduled_time: place.h, updated_at: new Date().toISOString() })
        .eq('id', p.id);
      deplaces++;
    }
    if (deplaces > 0) console.warn(`[Rattrapage] calendrier rééquilibré : ${deplaces} publication(s) déplacée(s) (créneau doublé ou cadence dépassée)`);
    return deplaces;
  }

  /**
   * ── Le contrôle qualité doit passer LA VEILLE ──
   *
   * Fondateur, 17 août : « on doit publier ce qui est programmé, ça doit passer
   * le juge et le contrôle qualité et être réparé bien avant, pas le jour même ».
   *
   * Il a raison, et c'est un défaut de conception, pas de barème. Aujourd'hui
   * la porte qualité s'ouvre au moment de publier : un post refusé à 9 h 15 n'a
   * plus une minute pour être réparé, donc le créneau est perdu. Le seul cron
   * qui relit à l'avance ne vérifie que la FRAÎCHEUR du texte — dates et
   * événements périmés — et ne regarde jamais l'image.
   *
   * Résultat mesuré le 17 août : vingt et un posts programmés, un publié.
   *
   * On juge donc les posts de DEMAIN ce soir, avec la même porte que la
   * publication, et on répare tout de suite. Une image refaite à 21 h laisse
   * douze heures de marge ; refaite à 9 h 15, elle arrive après le créneau.
   *
   * Ce qui passe est marqué : au matin, la publication retrouve un verdict
   * frais et n'a pas à repayer un appel de vision.
   */
  async function preparerDemain(): Promise<{ examines: number; repares: number; encore_ko: number }> {
    const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const { data: aVenir } = await supabase
      .from('content_calendar')
      .select('id, user_id, hook, caption, hashtags, visual_url, video_url, platform, format, qa_notes, publish_diagnostic')
      .in('status', ['approved', 'pending_approval'])
      .eq('scheduled_date', demain)
      .limit(40);

    let examines = 0, repares = 0, encoreKo = 0;
    const { controlerAvantPublication } = await import('@/lib/visuals/portail-publication');

    for (const p of (aVenir || []) as any[]) {
      if (Date.now() - debut > budgetMs * 0.4) break;   // on garde du temps pour la reprise
      // Déjà jugé bon ce soir : inutile de repayer une vision.
      if (/\[pre-vol .*ok\]/.test(String(p.qa_notes || ''))) continue;
      examines++;

      let verdict = await controlerAvantPublication(supabase, p);
      if (verdict.publiable) {
        await supabase.from('content_calendar').update({
          qa_notes: `${p.qa_notes ? p.qa_notes + '\n' : ''}[pre-vol ${demain}] ok`.slice(0, 4000),
        }).eq('id', p.id);
        continue;
      }

      // ── Refusé la veille : on a le temps de refaire l'image ──
      const motifs = `${verdict.diagnostic || ''} ${((verdict.details as any)?.reasons || []).join(' ')}`;
      if (griefVisuel(motifs) && p.visual_url && !p.video_url) {
        try {
          const { regenererVisuelDepuisLegende } = await import('@/lib/qualite/refaire-visuel');
          const neuf = await regenererVisuelDepuisLegende({
            hook: p.hook || '', caption: p.caption || '',
            plateforme: p.platform, format: p.format || 'post',
            griefs: motifs, userId: p.user_id || null,
            visuelActuel: p.visual_url, note: Number((verdict.details as any)?.score) || null,
          });
          if (neuf) {
            p.visual_url = neuf;
            verdict = await controlerAvantPublication(supabase, p);
          }
        } catch { /* une panne de génération ne bloque pas la préparation */ }
      }

      if (verdict.publiable) {
        repares++;
        await supabase.from('content_calendar').update({
          visual_url: p.visual_url,
          qa_notes: `${p.qa_notes ? p.qa_notes + '\n' : ''}[pre-vol ${demain}] ok après réparation`.slice(0, 4000),
          publish_diagnostic: 'pre_vol_repare: visuel refait la veille, jugé publiable',
          updated_at: new Date().toISOString(),
        }).eq('id', p.id);
      } else {
        encoreKo++;
        // On le signale la VEILLE : il reste une journée pour agir, au lieu de
        // découvrir le créneau vide le lendemain soir.
        await supabase.from('content_calendar').update({
          visual_url: p.visual_url,
          publish_diagnostic: `pre_vol_ko: ${String(verdict.diagnostic || 'refusé').slice(0, 400)}`,
          updated_at: new Date().toISOString(),
        }).eq('id', p.id);
      }
    }

    if (examines > 0) console.warn(`[Pré-vol ${demain}] ${examines} post(s) jugés · ${repares} réparés · ${encoreKo} encore refusés`);
    return { examines, repares, encore_ko: encoreKo };
  }

  const preVol = await preparerDemain();

  const calendrierRemisDAplomb = await reequilibrerCalendrier();

  // Le rééquilibrage vient de déplacer des publications : la carte d'occupation
  // lue plus haut est périmée. On la refait, sinon on replacerait un rattrapage
  // sur un créneau qu'on vient soi-même de libérer puis de reprendre.
  if (calendrierRemisDAplomb > 0) {
    const { data: relu } = await supabase
      .from('content_calendar')
      .select('platform, scheduled_date, scheduled_time')
      .in('status', ['approved', 'pending_approval', 'draft'])
      .gte('scheduled_date', aujourdhui)
      .lte('scheduled_date', dansQuinzeJours)
      .limit(1000);
    occupes.clear();
    parJour.clear();
    for (const d of (relu || []) as any[]) {
      const r = String(d.platform || '').toLowerCase();
      const cle = `${d.scheduled_date}|${r}`;
      occupes.add(`${cle}|${String(d.scheduled_time || '').slice(0, 8)}`);
      parJour.set(cle, (parJour.get(cle) || 0) + 1);
    }
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

      /**
       * ── On refait l'image quand c'est elle qu'on reproche ──
       *
       * Le doublon en fait partie : ce n'est pas un défaut de contenu, c'est un
       * média déjà vu. Une image neuve lève le motif par construction, alors
       * qu'aucune réécriture de légende ne le pourrait.
       */
      if (griefVisuel(motifs) || /qc_doublon/.test(motifs)) {
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

  /**
   * ── On rouvre la réserve, créneau libre par créneau libre ──
   *
   * Le calcul d'occupation est déjà fait au-dessus, et `prochainCreneauLibre`
   * respecte le plafond par réseau (2/jour sur TikTok, 5 ailleurs). On s'en
   * sert : un post de réserve ne prend que de la place réellement vide, jamais
   * une place déjà occupée. Pas de salve, donc pas de chute de portée.
   *
   * Ces posts ont déjà un visuel et sont déjà passés par la génération : les
   * reprendre coûte zéro euro, là où en fabriquer un neuf coûte une image ou
   * une vidéo. Le gisement était gratuit et personne n'y touchait.
   */
  let sortisDeReserve = 0;
  for (const p of reserve || []) {
    const creneau = prochainCreneauLibre(p.platform);
    if (!creneau) continue;
    try {
      await supabase.from('content_calendar').update({
        status: 'approved',
        scheduled_date: creneau.date,
        scheduled_time: creneau.heure,
        publish_diagnostic: `sorti_de_reserve: créneau libre au ${creneau.date} ${creneau.heure.slice(0, 5)}`,
        updated_at: new Date().toISOString(),
      }).eq('id', p.id);
      parJour.set(`${creneau.date}|${p.platform}`, (parJour.get(`${creneau.date}|${p.platform}`) || 0) + 1);
      sortisDeReserve++;
    } catch (e: any) {
      console.warn(`[Rattrapage] réserve ${p.id} : ${e?.message}`);
    }
  }
  if (sortisDeReserve) console.log(`[Rattrapage] ${sortisDeReserve} post(s) sortis de réserve vers des créneaux libres`);

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
    pre_vol: preVol,
    calendrier_reequilibre: calendrierRemisDAplomb,
    examines: reparables.length,
    visuels_refaits: refaits,
    remis_en_ligne: republies,
    irrecuperables,
    reportes,
    exemples,
  });
}
