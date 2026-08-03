import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getInstagramProfileSnapshot } from '@/lib/agents/ig-profile-snapshot';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Vérifie en LOT les DM en attente, avant que le client ne clique.
 *
 * Deux plaintes du fondateur (2026-08-01), qui n'en font qu'une :
 *   « y'a trop de liens où les comptes sont juste pas bons, ça tue la
 *     productivité de cliquer sur 10 liens d'affilée non fonctionnels »
 *   « j'ai ouvert le profil et le message n'avait rien à voir »
 *
 * Constat : 986 DM en attente, ZÉRO vérifié. La vérification existait déjà
 * (preflight) mais n'était appelée qu'au clic, un DM à la fois — le client
 * découvrait donc le compte mort APRÈS avoir cliqué. C'est le pire endroit
 * possible pour apprendre une mauvaise nouvelle.
 *
 * Et comme aucun profil n'était consulté, aucune donnée réelle n'alimentait la
 * personnalisation : le modèle inventait les détails (« le banh mi de votre
 * dernier post ») sur des comptes qu'il n'avait jamais vus.
 *
 * Un seul appel `business_discovery` règle les deux : il dit si le compte
 * existe ET renvoie les cinq derniers posts avec leurs légendes. On vérifie
 * donc en amont, en lot, et on stocke ce qu'on a vu pour que le message soit
 * écrit à partir du vrai.
 *
 * Rien n'est supprimé : un compte mort passe en `skipped` avec son motif, il
 * reste consultable.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Meta limite les appels : on avance par petits lots plutôt que tout d'un coup. */
const LOT = Number(process.env.DM_VERIFY_BATCH || 60);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = sb();

  // Identifiants Instagram du compte qui interroge (business_discovery exige
  // un compte pro appelant).
  const { data: compte } = await supabase
    .from('profiles')
    // Même résolution que la publication (content/route) : instagram_igaa_token
    // d'abord, jeton de page ensuite. La colonne instagram_access_token est un
    // reliquat qui n'est plus alimenté — l'avoir lue ici a fait échouer tous
    // les appels, donc condamner tous les comptes.
    .select('id, instagram_business_account_id, instagram_igaa_token, facebook_page_access_token')
    .not('instagram_business_account_id', 'is', null)
    .limit(1)
    .maybeSingle();

  const jetonIg = compte?.instagram_igaa_token || compte?.facebook_page_access_token;
  if (!compte?.instagram_business_account_id || !jetonIg) {
    return NextResponse.json({ ok: false, raison: 'aucun_compte_instagram_connecte' });
  }

  const { data: aVerifier } = await supabase
    .from('dm_queue')
    .select('id, handle, prospect_id, personalization, verification_attempts')
    .eq('status', 'pending')
    .is('verified_exists', null)
    .order('created_at')
    .limit(LOT);

  const liste = aVerifier || [];
  const bilan: any = { verifies: 0, vivants: 0, morts: 0, aReecrire: 0, perdus: 0, erreurs: 0, interrompu: null };

  // Un prospect passé en perdu, mort ou opt-out ne doit plus être contacté —
  // règle établie, mais 30 DM en attente visaient encore des prospects perdus.
  // On les sort AVANT de dépenser un appel d'API à les vérifier.
  const idsProspects = [...new Set(liste.map(d => d.prospect_id).filter(Boolean))];
  const interdits = new Set<string>();
  for (let i = 0; i < idsProspects.length; i += 200) {
    const { data: ps } = await supabase
      .from('crm_prospects')
      .select('id, status, no_outbound')
      .in('id', idsProspects.slice(i, i + 200));
    for (const p of ps || []) {
      if (p.no_outbound || ['perdu', 'dead', 'opt_out', 'desabonne'].includes(String(p.status))) {
        interdits.add(p.id as string);
      }
    }
  }

  for (const dm of liste) {
    if (dm.prospect_id && interdits.has(dm.prospect_id as string)) {
      await supabase.from('dm_queue').update({
        status: 'skipped',
        error_message: 'prospect perdu / opt-out — ne plus contacter',
      }).eq('id', dm.id);
      bilan.perdus++;
      continue;
    }
    try {
      const snap = await getInstagramProfileSnapshot(
        dm.handle || '',
        compte.instagram_business_account_id,
        jetonIg,
      );
      bilan.verifies++;

      if (!snap.exists) {
        // ⚠️ getInstagramProfileSnapshot renvoie exists:false pour TOUT échec —
        // compte inexistant, mais aussi jeton invalide, quota dépassé, panne
        // réseau. Confondre les deux coûte cher : le 2026-08-03, le jeton
        // Instagram était expiré, l'API répondait « Cannot parse access token »
        // sur chaque appel (y compris pour @instagram ou @nike), et ce balayage
        // a déclaré morts 397 comptes parfaitement valides avant qu'on ne
        // restaure la file.
        //
        // On ne conclut donc à l'inexistence QUE sur un motif qui la prouve.
        const motif = String(snap.rawError || '');
        const panneApi = /access token|oauth|expired|rate limit|too many|rate_limit|\(#4\)|\(#17\)|\(#32\)|permission|unsupported get request|fetch|timeout|econn/i.test(motif);

        if (panneApi) {
          // Ce n'est pas le compte qui est en cause, c'est notre accès. On
          // ARRÊTE tout : continuer condamnerait toute la file un par un.
          console.error(`[dm-verify] accès Instagram en panne (${motif.slice(0, 120)}) — balayage interrompu, aucun compte marqué`);
          bilan.interrompu = motif.slice(0, 200);

          // Un jeton expiré arrête AUSSI la publication Instagram, et personne
          // n'était prévenu : zéro alerte en 7 jours alors que le jeton est mort
          // depuis le 2 août. Ce balayage interroge l'API toutes les 30 minutes,
          // c'est donc le détecteur naturel. On émet l'événement que le mailer
          // de reconnexion (cron process-ig-reauth) attend déjà.
          if (/access token|oauth|expired/i.test(motif)) {
            try {
              const dejaSignale = await supabase.from('agent_logs').select('id')
                .eq('action', 'ig_token_expired_auto_disconnect')
                .gte('created_at', new Date(Date.now() - 12 * 3600_000).toISOString())
                .limit(1);
              if (!dejaSignale.data?.length) {
                await supabase.from('agent_logs').insert({
                  agent: 'content',
                  action: 'ig_token_expired_auto_disconnect',
                  status: 'error',
                  data: { user_id: compte.id, motif: motif.slice(0, 200), detecte_par: 'dm-verify-queue' },
                });
                console.error('[dm-verify] jeton Instagram expiré — reconnexion demandée au client');
              }
            } catch { /* la détection ne doit pas faire échouer le balayage */ }
          }
          break;
        }

        // Motif qui prouve vraiment l'inexistence : on écarte.
        await supabase.from('dm_queue').update({
          status: 'skipped',
          verified_exists: false,
          verified_at: new Date().toISOString(),
          verification_attempts: (dm.verification_attempts || 0) + 1,
          error_message: `compte introuvable (${motif || 'business_discovery'})`,
        }).eq('id', dm.id);
        bilan.morts++;
        continue;
      }

      // Compte vivant : on garde ce qu'on a RÉELLEMENT vu, pour que la
      // personnalisation s'appuie dessus au lieu d'être inventée.
      const posts = (snap.recent_posts || []).slice(0, 5).map((p: any) => ({
        caption: String(p.caption || '').slice(0, 300),
        type: p.media_type,
        permalink: p.permalink,
      }));

      const perso: any = { ...((dm.personalization as any) || {}) };
      perso.profil_reel = {
        bio: (snap as any).biography || null,
        followers: (snap as any).followers_count ?? null,
        posts,
        vu_le: new Date().toISOString(),
      };

      // Le message actuel prétend-il décrire une publication ? Si oui et qu'il
      // a été écrit sans données, il est faux : on le marque à réécrire plutôt
      // que de laisser partir une invention.
      const detail = String(perso.detail || '');
      const pretendVoirUnPost = /dernier post|dernière photo|dernier reel|votre reel|vos stories|dernière collection|dernier contenu/i.test(detail);
      const ecritSansDonnees = pretendVoirUnPost && !((dm.personalization as any)?.profil_reel);

      await supabase.from('dm_queue').update({
        verified_exists: true,
        verified_at: new Date().toISOString(),
        verification_attempts: (dm.verification_attempts || 0) + 1,
        personalization: perso,
        ...(ecritSansDonnees
          ? { status: 'pending', error_message: 'a_reecrire: détail de personnalisation inventé (profil jamais consulté)' }
          : {}),
      }).eq('id', dm.id);

      bilan.vivants++;
      if (ecritSansDonnees) bilan.aReecrire++;
    } catch (e: any) {
      bilan.erreurs++;
      try {
        await supabase.from('dm_queue').update({
          verification_attempts: (dm.verification_attempts || 0) + 1,
          error_message: `verification: ${String(e?.message || 'erreur').slice(0, 180)}`,
        }).eq('id', dm.id);
      } catch { /* la trace de l'échec ne doit pas masquer l'échec lui-même */ }
    }
  }

  // Un lot où TOUT est mort et RIEN n'est vivant trahit presque toujours un
  // problème d'accès, pas 60 comptes réellement supprimés le même jour.
  if (bilan.morts >= 10 && bilan.vivants === 0 && !bilan.interrompu) {
    console.warn(`[dm-verify] ${bilan.morts} morts et 0 vivant sur ce lot — vérifier l'accès Instagram avant de s'y fier`);
    bilan.suspect = true;
  }

  const { count: restants } = await supabase
    .from('dm_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('verified_exists', null);

  try {
    await supabase.from('agent_logs').insert({
      agent: 'dm_instagram',
      action: 'dm_verify_queue',
      status: 'success',
      data: { ...bilan, restants },
    });
  } catch { /* le journal ne doit pas faire échouer la vérification */ }

  return NextResponse.json({ ok: true, ...bilan, restants });
}
