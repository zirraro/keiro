/**
 * Curateur de photos par VISION (founder: "inspire-toi sur internet, sois très
 * fin et rigoureux dans la sélection pour avoir les meilleures").
 *
 * Le stock brut renvoie des univers disparates → un montage incohérent. Ici on
 * fetch beaucoup de candidats puis un modèle vision sélectionne le SOUS-ENSEMBLE
 * le plus (a) clairement le bon commerce, (b) cohérent entre eux (même type de
 * lieu/style/lumière), (c) de qualité pro (vraie photo, sans texte/watermark).
 * Résultat = vraies photos cohérentes → réalisme 9 + cohérence haute, zéro IA.
 */

export interface PhotoCandidate { url: string; thumb: string; tags?: string }

async function thumbToB64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 1000) return null;
    return b.toString('base64');
  } catch { return null; }
}

/**
 * Pick the best COHERENT set of real photos for a business.
 * @returns the large URLs of the selected photos, in display order (or [] on failure).
 */
export async function curateCoherentPhotos(
  candidates: PhotoCandidate[],
  opts: { businessType: string; want?: number; apiKey?: string },
): Promise<string[]> {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  const want = opts.want ?? 3;
  const pool = (candidates || []).filter(c => c.url && c.thumb).slice(0, 12); // cap cost
  if (!apiKey || pool.length === 0) return [];
  if (pool.length <= want) return pool.map(c => c.url);

  // Download thumbnails for the vision pass.
  const imgs: { idx: number; b64: string }[] = [];
  for (let i = 0; i < pool.length; i++) {
    const b64 = await thumbToB64(pool[i].thumb);
    if (b64) imgs.push({ idx: i, b64 });
  }
  if (imgs.length <= want) return imgs.map(x => pool[x.idx].url);

  try {
    const content: any[] = [{
      type: 'text',
      text: `Voici ${imgs.length} photos candidates (numérotées 0 à ${imgs.length - 1}, dans l'ordre montré) pour un montage vidéo de : "${opts.businessType}".\nSélectionne les ${want} MEILLEURES qui, ENSEMBLE, forment une série COHÉRENTE et premium :\n- clairement ce type de commerce (pas hors-sujet),\n- visuellement cohérentes entre elles (même type de lieu/ambiance/lumière/palette — comme prises dans le même établissement),\n- qualité pro : vraie photo nette, lumière soignée, AUCUN texte/logo/watermark, pas de visage en gros plan reconnaissable.\nClasse-les dans le meilleur ordre de montage (plan d'ensemble → détails).`,
    }];
    imgs.forEach((im) => content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.b64 } }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 300,
        tools: [{ name: 'select', description: 'pick coherent photo set', input_schema: {
          type: 'object', properties: {
            indices: { type: 'array', items: { type: 'integer' }, description: `les ${want} index (0-based, dans l'ordre des images montrées) de la meilleure série cohérente, classés` },
            reason: { type: 'string' },
          }, required: ['indices'], additionalProperties: false,
        } as any }],
        tool_choice: { type: 'tool', name: 'select' },
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) return pool.slice(0, want).map(c => c.url);
    const data = await res.json();
    const tu = (data.content || []).find((b: any) => b.type === 'tool_use');
    const picked: number[] = (tu?.input?.indices || []).filter((n: any) => Number.isInteger(n));
    // Map vision indices (over imgs order) back to pool urls.
    const urls = picked.map((p) => imgs[p] && pool[imgs[p].idx]?.url).filter(Boolean) as string[];
    return urls.length ? urls.slice(0, want) : pool.slice(0, want).map(c => c.url);
  } catch {
    return pool.slice(0, want).map(c => c.url);
  }
}
