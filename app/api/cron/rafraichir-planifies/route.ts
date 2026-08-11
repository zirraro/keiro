import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { reperesPerissables, rafraichirPublication } from '@/lib/agents/fraicheur';

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
const MARQUE_STANDARD = '[qc 2026-08-11]';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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
    return NextResponse.json({ ok: true, passages, corrections });
  }

  const aujourdhui = maintenant.slice(0, 10);
  const limite = new Date(Date.now() + FENETRE_JOURS * 86400000).toISOString().slice(0, 10);

  const { data: posts, error } = await supabase
    .from('content_calendar')
    .select('id, user_id, platform, scheduled_date, hook, caption, qa_notes, status')
    .in('status', ['approved', 'scheduled', 'pending'])
    .gte('scheduled_date', aujourdhui)
    .lte('scheduled_date', limite)
    .order('scheduled_date', { ascending: true })
    .limit(500);

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
        status: 'draft',
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
  let requalifies = 0, requalifiesEcartes = 0;
  const { controlerAvantPublication } = await import('@/lib/visuals/portail-publication');
  for (const p of posts) {
    if (requalifies >= PLAFOND_REQUALIFICATION) break;
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

    const notes = `${frais.qa_notes ? frais.qa_notes + '\n' : ''}${MARQUE_STANDARD} ${verdict.publiable ? 'conforme' : verdict.code}`.slice(0, 4000);
    if (verdict.publiable) {
      await supabase.from('content_calendar').update({ qa_notes: notes }).eq('id', frais.id);
    } else {
      await supabase.from('content_calendar').update({
        status: 'draft',
        qa_notes: notes,
        publish_diagnostic: verdict.diagnostic,
        updated_at: maintenant,
      }).eq('id', frais.id);
      requalifiesEcartes++;
      if (exemples.length < 10) exemples.push(`${p.scheduled_date} ${frais.platform} — écarté au nouveau standard : ${verdict.diagnostic}`);
    }
  }

  const bilan = {
    examines, signales, reecrits, ecartes, faux_positifs: fauxPositifs, indisponibles,
    requalifies, requalifies_ecartes: requalifiesEcartes, fenetre_jours: FENETRE_JOURS,
  };

  try {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'fraicheur_planifies', status: 'ok',
      data: { ...bilan, exemples }, created_at: maintenant,
    });
  } catch { /* la trace ne bloque pas */ }

  return NextResponse.json({ ok: true, ...bilan, exemples });
}
