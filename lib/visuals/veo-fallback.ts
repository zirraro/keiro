import { fetchIPv4 } from '@/lib/net/ipv4';

/**
 * Le secours vidéo qui manquait : Veo, quand Seedance ne répond plus.
 *
 * ── Pourquoi ──
 *
 * 2026-08-19 : un prélèvement ByteDance refusé (403 AccountOverdueError) a
 * coupé d'un coup les images, la vidéo, le texte DeepSeek et le juge de vision.
 * Les images avaient trois filets derrière elles (Kling, Gemini, Flux). La
 * vidéo n'en avait AUCUN : Seedance tombe, la vidéo s'arrête net.
 *
 * Le fondateur : « branche Gemini en vidéo aussi, attention seulement au coût ».
 *
 * ── Le coût, vérifié à la source et non de mémoire ──
 *
 * Une erreur d'un facteur 50 sur le coût vidéo remonte à deux jours ; les
 * chiffres ci-dessous viennent de ai.google.dev/gemini-api/docs/pricing, pas
 * d'un souvenir. Prix par seconde, en USD :
 *
 *   Veo 3.1 standard : $0,40 (720p/1080p) · $0,60 (4K)
 *   Veo 3.1 fast     : $0,10 (720p) · $0,12 (1080p) · $0,30 (4K)
 *   Veo 3.1 lite     : $0,05 (720p) · $0,08 (1080p)
 *
 * Rapporté à nos 1,10 € les 10 s de Seedance (0,11 €/s), en 1080p :
 *   lite ≈ 0,74 € (−33 %) · fast ≈ 1,11 € (parité) · standard ≈ 3,70 € (3,4×)
 *
 * D'où l'ordre retenu : FAST d'abord — à parité de prix, on ne dégrade pas la
 * qualité pendant une panne — puis LITE si fast échoue, parce qu'une vidéo un
 * cran en dessous vaut mieux que pas de vidéo. Le standard n'est jamais appelé
 * automatiquement : 3,4× le prix ne se déclenche pas sans décision humaine.
 *
 * Ce module ne s'active QUE si Seedance a échoué. En marche normale il ne coûte
 * rien.
 */

const MODELES = [
  { id: 'veo-3.1-fast-generate-preview', label: 'veo_fast', usdParSeconde: 0.12 },
  { id: 'veo-3.1-lite-generate-preview', label: 'veo_lite', usdParSeconde: 0.08 },
] as const;

export type ResultatVeo = {
  videoUrl: string;
  modele: string;
  coutEur: number;
};

/**
 * Rapatrie une vidéo Veo dans notre stockage et rend une URL publique stable.
 *
 * Rend `null` en cas d'échec plutôt que de lever : une vidéo derrière une clé
 * vaut mieux que pas de vidéo du tout, et l'appelant retombe sur l'URI Google.
 */
async function rapatrier(url: string, modele: string, essai = 0): Promise<string | null> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!r.ok) {
      // ── Pourquoi une reprise, et pourquoi elle change tout ──
      //
      // Banc élargi du 21 août : trois échecs sur neuf, tous « rapatriement
      // impossible ». Neuf téléchargements simultanés saturaient la bande
      // passante et les requêtes expiraient. J'en avais d'abord conclu que Veo
      // était peu fiable (1/3) — c'était MON code qui lâchait, pas le modèle.
      // Un chiffre de fiabilité contamine tout un arbitrage : je faillais
      // recommander de garder Seedance sur une mesure fausse.
      //
      // En production l'enjeu est plus direct : un rapatriement raté, c'est une
      // vidéo perdue pour un client alors que le fournisseur l'avait produite —
      // on a payé la génération et on ne livre rien.
      if (essai < 2) {
        await new Promise((r2) => setTimeout(r2, 5000 * (essai + 1)));
        return rapatrier(url, modele, essai + 1);
      }
      return null;
    }
    const octets = Buffer.from(await r.arrayBuffer());
    if (octets.length < 1024) {
      console.warn(`[Veo] fichier vide ou tronqué (${octets.length} octets)`);
      return null;
    }

    // Pas de Date.now() dans le nom seul : deux vidéos de la même seconde se
    // écraseraient. On ajoute la taille, qui les distingue en pratique.
    //
    // Et on assainit : Supabase refuse les caractères non-ASCII dans une clé
    // d'objet — « Invalid key: …caméra… ». Découvert au banc du 21 août, où un
    // seul accent a fait échouer six rapatriements sur neuf. J'en ai
    // successivement accusé Veo, la bande passante, puis un verrou de ma
    // fabrication, avant de simplement journaliser l'erreur : la cause était
    // écrite dedans depuis le début.
    //
    // Ici `modele` ne contient jamais d'accent aujourd'hui, mais rien ne le
    // garantit demain — et le mode de panne est silencieux.
    const sur = String(modele).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
    const chemin = `veo/${sur}-${Date.now()}-${octets.length}.mp4`;
    const { error } = await sb.storage.from('generated-images').upload(chemin, octets, {
      contentType: 'video/mp4',
      upsert: false,
    });
    if (error) {
      console.warn('[Veo] rapatriement impossible :', error.message);
      return null;
    }
    const { data } = sb.storage.from('generated-images').getPublicUrl(chemin);
    return data?.publicUrl || null;
  } catch (e: any) {
    if (essai < 2) {
      console.warn(`[Veo] rapatriement essai ${essai + 1} échoué (${e?.message}) — on retente`);
      await new Promise((r2) => setTimeout(r2, 5000 * (essai + 1)));
      return rapatrier(url, modele, essai + 1);
    }
    console.warn('[Veo] rapatriement abandonné :', e?.message);
    return null;
  }
}

/**
 * Une génération Veo est une opération longue : on poste, on reçoit un nom
 * d'opération, on interroge jusqu'à `done`. Pas de webhook — donc une borne
 * explicite, parce que `maxDuration` est un réglage Vercel sans aucun effet
 * ici : sur notre VPS, c'est au travail de borner son propre temps.
 */
async function genererAvecModele(
  modele: (typeof MODELES)[number],
  prompt: string,
  opts: { aspectRatio?: string; secondes?: number; imageBase64?: string },
): Promise<ResultatVeo> {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('GEMINI_API_KEY absente');

  const instance: Record<string, unknown> = { prompt };
  // Veo accepte une image de départ : on garde l'i2v quand l'appelant en a une.
  if (opts.imageBase64) {
    instance.image = { bytesBase64Encoded: opts.imageBase64, mimeType: 'image/jpeg' };
  }

  const lancement = await fetchIPv4(
    `https://generativelanguage.googleapis.com/v1beta/models/${modele.id}:predictLongRunning?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio: opts.aspectRatio || '9:16',
          resolution: '1080p',
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!lancement.ok) {
    const t = await lancement.text().catch(() => '');
    throw new Error(`Veo ${modele.label} HTTP ${lancement.status} ${t.slice(0, 160)}`);
  }

  const { name } = (await lancement.json()) as { name?: string };
  if (!name) throw new Error(`Veo ${modele.label} : pas de nom d'opération`);

  // Une vidéo met une à trois minutes. On interroge toutes les 10 s pendant
  // 6 min au plus : au-delà, on rend la main plutôt que de bloquer la requête
  // du client indéfiniment.
  const limite = Date.now() + 6 * 60_000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 10_000));

    const sondage = await fetchIPv4(
      `https://generativelanguage.googleapis.com/v1beta/${name}?key=${key}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!sondage.ok) continue;

    const op = (await sondage.json()) as any;
    if (!op.done) continue;

    if (op.error) throw new Error(`Veo ${modele.label} : ${op.error.message || 'échec'}`);

    const echantillon =
      op.response?.generateVideoResponse?.generatedSamples?.[0] ??
      op.response?.generatedSamples?.[0];
    const uri = echantillon?.video?.uri;
    if (!uri) throw new Error(`Veo ${modele.label} : opération finie sans vidéo`);

    const secondes = opts.secondes ?? 8;
    const uriAvecCle = uri.includes('key=') ? uri : `${uri}${uri.includes('?') ? '&' : '?'}key=${key}`;

    /**
     * ── Pourquoi on rapatrie la vidéo au lieu de rendre l'URI de Google ──
     *
     * Fondateur, 20 août : « il faut absolument qu'ARK juge la génération vidéo
     * Gemini, et ça doit fonctionner en système automatique, donc trouve un
     * moyen stable ».
     *
     * L'URI que rend Veo n'est lisible qu'avec la clé Google en paramètre.
     * Résultat au banc : ARK a répondu `InvalidParameter: Invalid video_url` —
     * on ne peut pas demander à un service tiers d'aller chercher une ressource
     * derrière NOTRE authentification. Le juge ne pouvait donc jamais noter une
     * vidéo Veo, ce qui rendait tout arbitrage Seedance/Veo impossible.
     *
     * Ce n'était pas qu'un problème de banc : en production, une vidéo de
     * secours serait partie sans être jugée, et un lien signé expire — le
     * client se serait retrouvé avec une vidéo morte dans sa bibliothèque.
     *
     * On rapatrie donc chez nous, une fois, dans le seau déjà utilisé pour les
     * visuels. L'URL rendue est publique et permanente : ARK peut la lire, le
     * client aussi, et elle ne dépend plus d'une clé.
     */
    const stockee = await rapatrier(uriAvecCle, modele.label);

    return {
      videoUrl: stockee || uriAvecCle,
      modele: modele.label,
      coutEur: Number((modele.usdParSeconde * secondes * 0.925).toFixed(3)),
    };
  }

  throw new Error(`Veo ${modele.label} : dépassement de délai (6 min)`);
}

/**
 * Essaie fast puis lite. Lève si les deux échouent — l'appelant décide alors
 * quoi dire au client, mais il ne peut plus croire qu'une vidéo existe.
 */
export async function genererVideoVeo(
  prompt: string,
  opts: { aspectRatio?: string; secondes?: number; imageBase64?: string } = {},
): Promise<ResultatVeo> {
  const erreurs: string[] = [];

  for (const modele of MODELES) {
    try {
      console.log(`[Veo] essai ${modele.label}…`);
      const r = await genererAvecModele(modele, prompt, opts);
      console.log(`[Veo] ✓ ${modele.label} — ${r.coutEur} €`);
      return r;
    } catch (e: any) {
      console.warn(`[Veo] ${modele.label} a échoué :`, e?.message);
      erreurs.push(`${modele.label}: ${e?.message}`);
    }
  }

  throw new Error(`Veo indisponible — ${erreurs.join(' | ')}`);
}
