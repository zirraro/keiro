import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callGemini } from '@/lib/agents/gemini';
import { getDMSystemPrompt } from '@/lib/agents/dm-prompt';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Réécrit les DM des comptes vérifiés, à partir de ce qu'on a VRAIMENT vu.
 *
 * Question du fondateur (2026-08-03) : « on arrive à identifier les bons
 * comptes pour envoyer le DM personnalisé, avec analyse du profil et du
 * business au préalable ? »
 *
 * La chaîne était à moitié faite. La vérification collecte bien les vraies
 * données — bio, abonnés, et les cinq derniers posts avec leurs légendes, 271
 * posts réels stockés à ce jour. Mais les DM en file portaient toujours leur
 * détail d'origine, inventé à une époque où aucun profil n'était consulté :
 *
 *   profil réel vu  : « Des fleurs, de la couleur, une nouvelle collection 🌸 »
 *   détail du DM    : « l'ambiance et les looks que vous proposez »
 *
 * Le second est du remplissage générique là où le premier permet une accroche
 * précise et vérifiable. Ce passage referme l'écart : il ne régénère QUE les
 * DM dont le compte est confirmé vivant ET dont on possède les publications,
 * et il redonne au modèle exactement ce qu'on a observé.
 *
 * On ne touche jamais à un DM sans données réelles : mieux vaut un message
 * générique qu'un message qui prétend décrire un post qu'on n'a pas vu.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const LOT = Number(process.env.DM_REWRITE_BATCH || 25);

/** Le champ est stocké tantôt en objet, tantôt en chaîne JSON. */
function lirePerso(v: any): any {
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return v || {};
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = sb();

  // Réécriture ciblée : les DM déjà réécrits l'ont été AVANT que l'on dispose
  // des données Instagram vérifiées (abonnés, publications, ancienneté du
  // dernier post). Les reprendre TOUS coûterait un appel par message pour une
  // majorité qui n'aurait rien de plus ; on ne reprend donc que ceux dont le
  // prospect a été enrichi depuis.
  const cibleEnrichis = req.nextUrl.searchParams.get('enrichis') === '1';
  const enrichisRecents = new Set<string>();
  if (cibleEnrichis) {
    const { data: rows } = await supabase
      .from('crm_prospects')
      .select('id')
      .eq('ig_status', 'professional')
      .not('ig_enriched_at', 'is', null)
      .limit(1000);
    for (const r of rows || []) enrichisRecents.add((r as any).id);
  }

  const { data: candidats } = await supabase
    .from('dm_queue')
    .select('id, handle, prospect_id, personalization, message, channel')
    .eq('status', 'pending')
    .eq('verified_exists', true)
    .limit(200);

  const bilan = { examines: 0, reecrits: 0, sansDonnees: 0, dejaAJour: 0, rejetes: 0, echecs: 0 };
  const exemples: any[] = [];

  for (const dm of candidats || []) {
    if (bilan.reecrits >= LOT) break;
    bilan.examines++;

    const perso = lirePerso(dm.personalization);
    const profil = perso.profil_reel;
    const posts = (profil?.posts || []).filter((p: any) => String(p?.caption || '').trim().length > 8);

    // Sans publication réelle, on ne réécrit pas : le modèle n'aurait rien de
    // plus qu'avant et réinventerait un détail.
    if (!profil || posts.length === 0) { bilan.sansDonnees++; continue; }
    // Déjà réécrit lors d'un passage précédent — sauf si le prospect a depuis
    // été enrichi : le message avait alors été rédigé sans savoir combien
    // d'abonnés avait le compte ni depuis quand il dormait.
    const aRedigerMalgreTout = cibleEnrichis && enrichisRecents.has(dm.prospect_id);
    if (perso.reecrit_le && !aRedigerMalgreTout) { bilan.dejaAJour++; continue; }
    if (cibleEnrichis && !enrichisRecents.has(dm.prospect_id)) { bilan.dejaAJour++; continue; }

    const { data: p } = await supabase
      .from('crm_prospects')
      .select('company, type, quartier, note_google, google_rating, google_reviews, website, notes, instagram, ig_status, ig_followers, ig_media_count, ig_days_since_post')
      .eq('id', dm.prospect_id).maybeSingle();

    // Ce qu'on a réellement observé, formulé pour le modèle.
    const contexte = [
      `PROFIL INSTAGRAM @${dm.handle} — observé via business_discovery le ${String(profil.vu_le || '').slice(0, 10)} :`,
      profil.bio ? `- Bio : "${String(profil.bio).slice(0, 250)}"` : null,
      typeof profil.followers === 'number' ? `- ${profil.followers} abonnés` : null,
      `- Ses ${posts.length} dernières publications, la plus récente en premier :`,
      ...posts.slice(0, 5).map((x: any, i: number) => `   ${i + 1}. "${String(x.caption).slice(0, 220)}"`),
      '',
      'Ces publications ont été RÉELLEMENT consultées : tu peux en citer une précisément, c\'est vérifiable.',
      'N\'invente rien au-delà de ce qui est listé ci-dessus.',
    ].filter(Boolean).join('\n');

    const donneesProspect = JSON.stringify({
      business_name: p?.company || null,
      business_type: p?.type || 'commerce',
      quartier: p?.quartier || null,
      google_rating: p?.google_rating ?? p?.note_google ?? null,
      google_reviews: p?.google_reviews ?? null,
      website: p?.website || null,
      specialites: p?.notes ? String(p.notes).slice(0, 200) : null,
      instagram_handle: dm.handle,
    });

    try {
      const brut = await callGemini({
        system: getDMSystemPrompt(dm.channel === 'tiktok' ? 'tiktok' : 'instagram'),
        message: `${donneesProspect}\n\n${contexte}`,
        maxTokens: 1600,
        thinking: false,
      });
      const net = brut.trim().replace(/^```[\w]*\s*\n?/gm, '').replace(/\n?```\s*$/gm, '');
      const a = net.indexOf('{'); const b = net.lastIndexOf('}');
      if (a === -1 || b <= a) { bilan.echecs++; continue; }
      const j = JSON.parse(net.slice(a, b + 1));
      const nouveauTexte = j.dm_text || j.message || '';
      const nouveauDetail = j.personalization_detail || '';
      if (!nouveauTexte || nouveauTexte.length < 30) { bilan.echecs++; continue; }

      // Contrôle d'exactitude AVANT enregistrement : un détail précis mais
      // faux est pire qu'un générique, parce qu'il est vérifiable en trois
      // secondes par le prospect. Si le modèle a cité un produit ou une personne
      // qu'on ne retrouve pas dans les légendes relevées, on garde l'ancien
      // message plutôt que d'envoyer une affirmation invérifiable.
      const { factCheckDm } = await import('@/lib/agents/dm-fact-check');
      const controle = factCheckDm({
        message: nouveauTexte,
        detail: nouveauDetail,
        captions: posts.map((x: any) => String(x.caption || '')),
        bio: profil.bio,
        donneesConnues: [p?.company, p?.quartier, p?.type, p?.notes, p?.website],
      });
      if (!controle.ok) {
        bilan.rejetes++;
        console.warn('[dm-rewrite] @' + dm.handle + ' rejeté — termes introuvables : ' + controle.introuvables.join(', '));
        continue;
      }

      const persoMaj = {
        ...perso,
        detail: nouveauDetail || perso.detail,
        detail_precedent: perso.detail || null,
        reecrit_le: new Date().toISOString(),
      };

      await supabase.from('dm_queue').update({
        message: nouveauTexte,
        personalization: persoMaj,
        error_message: null,
      }).eq('id', dm.id);

      bilan.reecrits++;
      if (exemples.length < 3) {
        exemples.push({
          handle: dm.handle,
          post_reel: String(posts[0].caption).slice(0, 70),
          avant: String(perso.detail || '').slice(0, 60),
          apres: String(nouveauDetail).slice(0, 70),
        });
      }
    } catch (e: any) {
      bilan.echecs++;
      console.warn('[dm-rewrite] échec sur', dm.handle, e?.message);
    }
  }

  try {
    await supabase.from('agent_logs').insert({
      agent: 'dm_instagram', action: 'dm_rewrite_verified', status: 'success', data: bilan,
    });
  } catch { /* le journal ne doit pas faire échouer la réécriture */ }

  return NextResponse.json({ ok: true, ...bilan, exemples });
}
