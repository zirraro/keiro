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

  const bilan = { examines, signales, reecrits, ecartes, faux_positifs: fauxPositifs, indisponibles, fenetre_jours: FENETRE_JOURS };

  try {
    await supabase.from('agent_logs').insert({
      agent: 'content', action: 'fraicheur_planifies', status: 'ok',
      data: { ...bilan, exemples }, created_at: maintenant,
    });
  } catch { /* la trace ne bloque pas */ }

  return NextResponse.json({ ok: true, ...bilan, exemples });
}
