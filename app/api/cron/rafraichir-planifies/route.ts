import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { reperesPerissables, rafraichirPublication } from '@/lib/agents/fraicheur';
import { callLlmWithFallback } from '@/lib/agents/llm-fallback';
import { blocExigence } from '@/lib/visuals/exigences-reseau';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Relit chaque jour les publications sur le point de sortir, et corrige celles
 * que le temps a rendues fausses.
 *
 * Le détail du problème et le principe retenu sont dans `lib/agents/fraicheur.ts`.
 * Ici, seules les décisions d'exploitation :
 *
 * ── Pourquoi une fenêtre de sept jours, et pas tout le calendrier ──
 *
 * Un post prévu dans deux mois n'a pas besoin d'être corrigé aujourd'hui : sa
 * date bougera peut-être, il repassera peut-être en réserve, et le corriger
 * maintenant serait payer pour un contenu qui ne sortira pas. Sept jours, c'est
 * assez tôt pour que le client voie un planning juste quand il le consulte, et
 * assez tard pour ne dépenser que sur ce qui part vraiment.
 *
 * ── Pourquoi APRÈS la remise à la cadence ──
 *
 * `planning-cadence` déplace les publications. Corriger un texte pour une date
 * qui change dans la seconde suivante n'a aucun sens : on passe derrière lui.
 *
 * ── Ce que ce passage ne fait jamais ──
 *
 * Il ne supprime rien. Un post irrécupérable repasse en brouillon avec son
 * motif en clair, et le client le retrouve. Le texte d'origine est écrit dans
 * le journal avant toute modification : une correction se relit et s'annule.
 */

/** Au-delà, la date bougera encore : corriger maintenant serait payer pour rien. */
const FENETRE_JOURS = 7;

/**
 * Plafond de posts soumis à un modèle par passage. Le repérage étant gratuit,
 * seul ce nombre porte un coût. À raison d'un post sur quatre signalé, une
 * quarantaine couvre très largement une semaine de calendrier ; au-delà, c'est
 * qu'il se passe autre chose, et mieux vaut le voir dans le journal que sur la
 * facture.
 */
const PLAFOND_APPELS = 40;

/**
 * Plafond distinct pour la requalification au standard actuel : ce contrôle-ci
 * coûte un appel de VISION par publication (~0,003 €), là où la relecture de
 * fraîcheur ne coûte qu'un petit appel de texte. Vingt-cinq par jour balaient
 * le calendrier en une semaine pour quelques centimes, et le rythme se règle
 * ici plutôt que de se découvrir sur la facture.
 */
const PLAFOND_REQUALIFICATION = 25;

/**
 * Marque du standard de contrôle appliqué. À CHANGER quand on relève le
 * niveau : tout le stock déjà marqué repassera alors devant le nouveau
 * barème, ce qui est exactement ce qu'on veut — sinon un contrôle renforcé ne
 * s'appliquerait qu'aux publications futures, et le stock resterait à
 * l'ancienne norme sans que personne ne s'en aperçoive.
 */
const MARQUE_STANDARD = '[qc 2026-08-12]';   // relevé : la note TECHNIQUE du visuel est désormais jugée

/**
 * Où atterrit une publication que le contrôle refuse et qu'on ne sait pas
 * réparer.
 *
 * Fondateur, 2026-08-12 : « pour les posts programmés déjà contrôlés, s'ils ne
 * passent pas le contrôle et ne sont pas réparables, abandonne-les dès
 * maintenant. »
 *
 * Jusqu'ici ils repassaient en `draft`, c'est-à-dire au même endroit que le
 * travail en cours du client. Le brouillon est un état de TRAVAIL : y déposer
 * des publications condamnées les mélange à ce que le client est en train
 * d'écrire, et laisse croire qu'elles attendent une décision. Elles n'en
 * attendent pas — l'image est mauvaise ou le texte ment, et aucune réécriture
 * n'y change rien.
 *
 * `skipped` est l'état d'abandon déjà prévu par le schéma. La ligne reste, avec
 * son motif en clair : on n'efface jamais le travail d'un client, on cesse
 * seulement de le programmer. Le créneau libéré est repris par la génération
 * du jour, qui produit au standard actuel plutôt que de rafistoler l'ancien.
 */
const STATUT_ABANDON = 'skipped';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Réécrit une légende à partir de CE QUE LE CONTRÔLE A VU sur l'image.
 *
 * La description vient du contrôle de cohérence, qui décrit toujours l'image
 * avant de juger — précisément parce qu'un jugement rendu sans description se
 * contente trop souvent de valider. On réutilise ce travail déjà payé : le
 * nouveau texte parle du bon sujet par construction.
 *
 * Haiku : c'est de la réécriture courte, en volume. Renvoie null en cas
 * d'échec, et l'appelant retombe alors sur la mise en brouillon.
 */
async function reecrireLegende(input: {
  descriptionImage: string;
  motifs: string;
  plateforme: string;
  ancienneLegende: string;
}): Promise<{ hook: string; caption: string } | null> {
  const exigence = blocExigence(input.plateforme, { avecTexte: true });
  const system = `Tu es rédacteur en chef d'un compte de marque. Une publication a été REFUSÉE par le contrôle qualité, mais son IMAGE est bonne. Tu réécris le texte pour qu'il colle à l'image et respecte les règles.

${exigence}

RÈGLES ABSOLUES :
· Parle de CE QUI EST RÉELLEMENT SUR L'IMAGE, décrite ci-dessous. C'est le motif de refus le plus fréquent.
· N'invente JAMAIS un client, un prénom, un nom de commerce, une ville, un témoignage.
· Aucun chiffre de résultat invraisemblable. Un ordre de grandeur crédible passe, « +300 % » non.
· Pas de hashtag dans la légende.
· Première ligne = l'accroche, elle doit retenir selon le registre du réseau ci-dessus.

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"hook":"la première ligne","caption":"la légende complète, accroche comprise"}`;

  const message = [
    `CE QUE MONTRE L'IMAGE : ${input.descriptionImage}`,
    '',
    `POURQUOI LE POST A ÉTÉ REFUSÉ : ${input.motifs}`,
    '',
    `ANCIENNE LÉGENDE (à ne PAS reprendre si elle est la cause du refus) :`,
    input.ancienneLegende.slice(0, 1200) || '(vide)',
  ].join('\n');

  try {
    const res = await callLlmWithFallback({
      system, message, claudeModel: 'claude-haiku-4-5-20251001',
      maxTokens: 900, callTag: 'qc_reecriture_legende',
    });
    const json = (res.text || '').replace(/^[\s\S]*?\{/, '{').replace(/\}[^}]*$/, '}');
    const v = JSON.parse(json);
    const caption = String(v?.caption || '').trim();
    if (caption.length < 40) return null;
    return { hook: String(v?.hook || '').trim(), caption };
  } catch {
    return null;
  }
}

/** Déjà relu pour CETTE date de parution ? Si la date bouge, on relit. */
function dejaRelu(qaNotes: string | null, dateParution: string): boolean {
  return String(qaNotes || '').includes(`[fraicheur ${dateParution}]`);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const maintenant = new Date().toISOString();

  // ── Mode consultation : que s'est-il passé aux derniers passages ? ──
  //
  // Ajouté le 2026-08-11 parce qu'on ne pouvait vérifier le travail de ce cron
  // qu'en ouvrant la base depuis le VPS. Le jour où l'accès SSH est tombé, il
  // n'y avait plus aucun moyen de savoir ce qu'il avait corrigé. Un traitement
  // qui modifie le texte des clients doit pouvoir se relire de l'extérieur.
  if (req.nextUrl.searchParams.get('bilan') === '1') {
    const { data: passages } = await supabase
      .from('agent_logs').select('created_at, data')
      .eq('action', 'fraicheur_planifies').order('created_at', { ascending: false }).limit(7);
    const { data: corrections } = await supabase
      .from('agent_logs').select('created_at, data')
      .eq('action', 'fraicheur_reecriture').order('created_at', { ascending: false }).limit(15);
    // Les dernières publications RÉELLEMENT parties, pour vérifier de
    // l'extérieur ce qui est sorti et sous quel contrôle.
    const { data: publiees } = await supabase
      .from('content_calendar')
      .select('id, platform, format, published_at, hook, caption, visual_url, qa_notes, source')
      .eq('status', 'published').order('published_at', { ascending: false }).limit(12);
    return NextResponse.json({ ok: true, passages, corrections, publiees });
  }

  // ── Balayage TOTAL, à la demande ──
  //
  // Fondateur, 2026-08-11, après avoir vu partir un post « restaurant » illustré
  // par des fleurs : « vérifie les posts programmés, rapatriés, TOUS ». La
  // fenêtre de sept jours et le plafond de vingt-cinq sont faits pour lisser la
  // dépense au quotidien ; ils ne conviennent pas quand il faut purger le stock
  // d'un coup. `?tout=1` ouvre l'horizon et lève le plafond — environ un euro
  // pour l'ensemble du calendrier, une fois.
  const balayageTotal = req.nextUrl.searchParams.get('tout') === '1';
  const fenetre = balayageTotal ? 400 : FENETRE_JOURS;
  const plafondRequalif = balayageTotal ? 600 : PLAFOND_REQUALIFICATION;

  const aujourdhui = maintenant.slice(0, 10);
  const limite = new Date(Date.now() + fenetre * 86400000).toISOString().slice(0, 10);

  const { data: posts, error } = await supabase
    .from('content_calendar')
    .select('id, user_id, platform, scheduled_date, hook, caption, qa_notes, status')
    .in('status', ['approved', 'scheduled', 'pending'])
    .gte('scheduled_date', aujourdhui)
    .lte('scheduled_date', limite)
    .order('scheduled_date', { ascending: true })
    .limit(balayageTotal ? 2000 : 500);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!posts?.length) return NextResponse.json({ ok: true, message: 'Rien à relire dans la fenêtre' });

  let examines = 0, signales = 0, reecrits = 0, ecartes = 0, fauxPositifs = 0, indisponibles = 0;
  const exemples: string[] = [];

  for (const p of posts) {
    if (dejaRelu(p.qa_notes, p.scheduled_date)) continue;
    examines++;

    const texte = [p.hook, p.caption].filter(Boolean).join('\n\n');
    const reperes = reperesPerissables(texte, p.scheduled_date);

    // Rien de signalé : on marque la relecture pour ne pas la refaire demain.
    if (!reperes.length) {
      await supabase.from('content_calendar').update({
        qa_notes: `${p.qa_notes ? p.qa_notes + '\n' : ''}[fraicheur ${p.scheduled_date}] rien à corriger`.slice(0, 4000),
      }).eq('id', p.id);
      continue;
    }

    signales++;
    if (signales > PLAFOND_APPELS) break;

    const verdict = await rafraichirPublication({
      hook: p.hook || '',
      caption: p.caption || '',
      plateforme: p.platform,
      dateParution: p.scheduled_date,
      reperes,
    });

    // Contrôle indisponible : on ne touche à rien et on ne marque pas — le
    // post repassera au prochain tour. Une panne de notre côté ne doit jamais
    // se traduire par une publication laissée sans relecture ET marquée comme
    // relue.
    if (!verdict) { indisponibles++; continue; }

    const marque = `[fraicheur ${p.scheduled_date}] ${verdict.action} — ${verdict.motif}`;
    const qaNotes = `${p.qa_notes ? p.qa_notes + '\n' : ''}${marque}`.slice(0, 4000);

    if (verdict.action === 'reecrit') {
      // Le texte d'origine part au journal AVANT la modification : une
      // correction automatique doit pouvoir se relire et s'annuler.
      try {
        await supabase.from('agent_logs').insert({
          agent: 'content', action: 'fraicheur_reecriture', status: 'ok',
          data: {
            post_id: p.id, plateforme: p.platform, date_parution: p.scheduled_date,
            motif: verdict.motif,
            reperes: reperes.map(r => ({ famille: r.famille, extrait: r.extrait })),
            avant: { hook: p.hook, caption: p.caption },
            apres: { hook: verdict.hook, caption: verdict.caption },
          },
          created_at: maintenant,
        });
      } catch { /* la trace ne bloque pas la correction */ }

      await supabase.from('content_calendar').update({
        hook: verdict.hook,
        caption: verdict.caption,
        qa_notes: qaNotes,
        publish_diagnostic: `rafraichi: ${verdict.motif}`.slice(0, 500),
        updated_at: maintenant,
      }).eq('id', p.id);
      reecrits++;
      if (exemples.length < 6) exemples.push(`${p.scheduled_date} ${p.platform} — ${verdict.motif}`);
    } else if (verdict.action === 'irrecuperable') {
      await supabase.from('content_calendar').update({
        status: STATUT_ABANDON,
        qa_notes: qaNotes,
        publish_diagnostic: `perime: ${verdict.motif}`.slice(0, 500),
        updated_at: maintenant,
      }).eq('id', p.id);
      ecartes++;
      if (exemples.length < 6) exemples.push(`${p.scheduled_date} ${p.platform} — écarté : ${verdict.motif}`);
    } else {
      await supabase.from('content_calendar').update({ qa_notes: qaNotes }).eq('id', p.id);
      fauxPositifs++;
    }
  }

  // ── Le stock déjà programmé doit passer le contrôle qualité ACTUEL ──
  //
  // Fondateur, 2026-08-11 : « on est sûr que les prochaines générations
  // passeront notre contrôle qualité qu'on a augmenté, et que les publications
  // déjà programmées pour les semaines à venir ont été revérifiées et mises à
  // jour avec notre contrôle qualité ? »
  //
  // Pour les futures : oui, le contrôle tourne à la publication. Pour le
  // stock : non, il a été produit et validé sous l'ANCIEN standard.
  //
  // Le contrôle finirait par les attraper au moment de publier — mais un post
  // retenu à cet instant, c'est un créneau perdu. Le rattraper quelques jours
  // avant laisse le temps de le remplacer.
  //
  // Même fenêtre et même balayage que la relecture de fraîcheur : un post prévu
  // dans deux mois n'a pas à être payé aujourd'hui, sa date bougera. Plafond
  // séparé, parce que ce contrôle-ci coûte un appel de vision par publication.
  let requalifies = 0, requalifiesEcartes = 0, requalifiesReecrits = 0;
  const { controlerAvantPublication } = await import('@/lib/visuals/portail-publication');
  for (const p of posts) {
    if (requalifies >= plafondRequalif) break;
    if (String(p.qa_notes || '').includes(MARQUE_STANDARD)) continue;

    // On relit la ligne : la relecture de fraîcheur a pu réécrire le texte, et
    // c'est le texte FINAL qu'il faut juger.
    const { data: frais } = await supabase
      .from('content_calendar')
      .select('id, user_id, platform, format, hook, caption, hashtags, visual_url, video_url, status, qa_notes')
      .eq('id', p.id)
      .maybeSingle();
    if (!frais || !['approved', 'scheduled', 'pending'].includes(frais.status)) continue;

    requalifies++;

    // ── La note TECHNIQUE du visuel, pas seulement sa cohérence ──
    //
    // Constaté le 12 août sur les mesures réelles : des visuels du stock
    // recyclé sortent à 3/10 au contrôle technique, sont régénérés trois fois,
    // et le créneau finit vide. La requalification ne regardait que la
    // cohérence entre l'image et la légende — un visuel parfaitement cohérent
    // mais flou, plat ou marqué « généré » passait donc ici, pour être refusé
    // au moment de publier. Trop tard : à cet instant, le créneau est perdu.
    //
    // On juge donc aussi la qualité de l'image, quelques jours à l'avance, ce
    // qui laisse le temps de régénérer plutôt que de renoncer.
    if (frais.visual_url && !frais.video_url) {
      try {
        const { scoreVisualQuality } = await import('@/lib/visuals/qa-check');
        const note = await scoreVisualQuality(
          frais.visual_url, frais.hook || '', 'the intended subject of this post',
          undefined, frais.platform,
        );
        const eliminatoire = (note.amateur_flags || []).some((f: string) =>
          ['blurry_subject', 'out_of_focus', 'looks_generated'].includes(f));
        if (note.score < 7 || eliminatoire) {
          // Une image insuffisante ne se répare pas par le texte : il faudrait
          // la regénérer, c'est-à-dire payer une génération neuve pour sauver un
          // sujet ancien. Autant la laisser à la génération du jour, qui part
          // du standard actuel. On abandonne donc, motif en clair.
          await supabase.from('content_calendar').update({
            status: STATUT_ABANDON,
            qa_notes: `${frais.qa_notes ? frais.qa_notes + '\n' : ''}${MARQUE_STANDARD} visuel insuffisant (${note.score}/10${eliminatoire ? ', défaut éliminatoire' : ''})`.slice(0, 4000),
            publish_diagnostic: `qc_visuel_insuffisant: ${note.score}/10 — ${(note.amateur_flags || []).join(', ') || note.notes}`.slice(0, 500),
            updated_at: maintenant,
          }).eq('id', frais.id);
          requalifiesEcartes++;
          if (exemples.length < 10) exemples.push(`${p.scheduled_date} ${frais.platform} — visuel ${note.score}/10 : ${(note.amateur_flags || []).join(', ') || 'sous la barre'}`);
          continue;
        }
      } catch { /* contrôle indisponible : on laisse passer au contrôle suivant */ }
    }

    const verdict = await controlerAvantPublication(supabase, {
      id: frais.id,
      user_id: frais.user_id,
      hook: frais.hook,
      caption: frais.caption,
      hashtags: frais.hashtags as any,
      visual_url: frais.visual_url,
      video_url: frais.video_url,
      platform: frais.platform,
      format: frais.format,
    });

    // Contrôle indisponible : on ne marque pas, on repassera. Marquer une
    // publication « vérifiée » sur une panne de notre côté serait le pire des
    // résultats — elle partirait sans avoir jamais été contrôlée.
    if (!verdict.publiable && verdict.code === 'qc_indisponible') continue;

    // ── Réparer avant de jeter ──
    //
    // Premier passage réel : 19 publications écartées sur 25. À ce rythme le
    // calendrier se vide en une semaine, et « toujours publier pour livrer le
    // client » ne tient plus.
    //
    // Or le contrôle rend DEUX jugements séparés, précisément pour ça : le post
    // est-il publiable en l'état, et l'image mérite-t-elle une autre légende ?
    // La quasi-totalité des motifs relevés — client inventé, chiffre aberrant,
    // image hors-sujet — se corrigent en réécrivant le TEXTE. Jeter un visuel
    // réussi parce que sa légende ment serait payer deux fois la même erreur.
    //
    // On réécrit donc la légende À PARTIR DE CE QUE LE CONTRÔLE A VU sur
    // l'image : le nouveau texte parle du bon sujet par construction. Pas de
    // second appel de vision — le contrôle au moment de publier reste le juge
    // final, et il ne coûte rien de plus puisqu'il a lieu de toute façon.
    const d = verdict.details || {};
    if (!verdict.publiable && d.imageUsable && d.imageDescription
        && (verdict.code === 'coherence' || verdict.code === 'claim_invente')) {
      const nouvelle = await reecrireLegende({
        descriptionImage: String(d.imageDescription),
        motifs: (d.reasons || [verdict.diagnostic]).slice(0, 3).join(' · '),
        plateforme: frais.platform,
        ancienneLegende: frais.caption || '',
      });
      if (nouvelle?.caption) {
        try {
          await supabase.from('agent_logs').insert({
            agent: 'content', action: 'qc_legende_reecrite', status: 'ok', user_id: frais.user_id || undefined,
            data: {
              post_id: frais.id, reseau: frais.platform, motif: verdict.diagnostic,
              avant: { hook: frais.hook, caption: frais.caption },
              apres: { hook: nouvelle.hook, caption: nouvelle.caption },
            },
            created_at: maintenant,
          });
        } catch { /* la trace ne bloque pas */ }
        await supabase.from('content_calendar').update({
          hook: nouvelle.hook || frais.hook,
          caption: nouvelle.caption,
          qa_notes: `${frais.qa_notes ? frais.qa_notes + '\n' : ''}${MARQUE_STANDARD} légende réécrite (${verdict.code})`.slice(0, 4000),
          publish_diagnostic: `qc_legende_reecrite: ${verdict.diagnostic}`.slice(0, 500),
          updated_at: maintenant,
        }).eq('id', frais.id);
        requalifiesReecrits++;
        if (exemples.length < 10) exemples.push(`${p.scheduled_date} ${frais.platform} — légende réécrite sur l'image réelle`);
        continue;
      }
    }

    const notes = `${frais.qa_notes ? frais.qa_notes + '\n' : ''}${MARQUE_STANDARD} ${verdict.publiable ? 'conforme' : verdict.code}`.slice(0, 4000);
    if (verdict.publiable) {
      await supabase.from('content_calendar').update({ qa_notes: notes }).eq('id', frais.id);
    } else {
      // Refusé, et la réécriture ci-dessus n'a rien pu en tirer : abandon.
      await supabase.from('content_calendar').update({
        status: STATUT_ABANDON,
        qa_notes: notes,
        publish_diagnostic: verdict.diagnostic,
        updated_at: maintenant,
      }).eq('id', frais.id);
      requalifiesEcartes++;
      if (exemples.length < 10) exemples.push(`${p.scheduled_date} ${frais.platform} — abandonné au nouveau standard : ${verdict.diagnostic}`);
    }
  }

  const bilan = {
    examines, signales, reecrits, ecartes, faux_positifs: fauxPositifs, indisponibles,
    requalifies, requalifies_reecrits: requalifiesReecrits, requalifies_ecartes: requalifiesEcartes, fenetre_jours: fenetre, balayage_total: balayageTotal,
  };

  try {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'fraicheur_planifies', status: 'ok',
      data: { ...bilan, exemples }, created_at: maintenant,
    });
  } catch { /* la trace ne bloque pas */ }

  return NextResponse.json({ ok: true, ...bilan, exemples });
}
