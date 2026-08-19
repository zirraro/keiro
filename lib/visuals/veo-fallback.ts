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
    return {
      // L'URI Veo exige la clé pour être lue : l'appelant télécharge et stocke.
      videoUrl: uri.includes('key=') ? uri : `${uri}${uri.includes('?') ? '&' : '?'}key=${key}`,
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
