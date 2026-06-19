/**
 * Photos d'un VRAI commerce via Google Places (founder: les commerces ont déjà
 * publié des images de LEUR lieu — on les utilise comme base). Place Details
 * → photo_references → Place Photo API → re-host Supabase. Plusieurs photos du
 * MÊME établissement = cohérentes par nature + réelles → montage 8-9.
 *
 * Garde-fous (runaway €350 avril) : cap DUR de photos, AUCUN retry, budget
 * journalier Places respecté par l'appelant (isUnderDailyBudget).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { incrementDailySpend } from './prospect-pool';

export interface PlacePhotosResult { name?: string; photos: string[]; detailsCalls: number; photoCalls: number }

export async function fetchPlaceBusinessPhotos(
  placeId: string,
  supabase: SupabaseClient,
  opts: { count?: number; apiKey?: string } = {},
): Promise<PlacePhotosResult> {
  const apiKey = opts.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  const count = Math.min(6, Math.max(1, opts.count ?? 4)); // HARD cap
  if (!apiKey || !placeId) return { photos: [], detailsCalls: 0, photoCalls: 0 };

  let detailsCalls = 0, photoCalls = 0;
  // 1) Details → photo_references + name.
  let refs: string[] = [];
  let name: string | undefined;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos,name&language=fr&key=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); // no retry
    detailsCalls = 1;
    const data = await r.json();
    name = data?.result?.name;
    refs = (data?.result?.photos || []).map((p: any) => p.photo_reference).filter(Boolean).slice(0, count);
  } catch { /* none */ }
  await incrementDailySpend(supabase, { details_calls: detailsCalls });
  if (!refs.length) return { name, photos: [], detailsCalls, photoCalls };

  // 2) For each ref → Place Photo (binary) → re-host on Supabase.
  const photos: string[] = [];
  for (let i = 0; i < refs.length; i++) {
    try {
      const purl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1080&photo_reference=${encodeURIComponent(refs[i])}&key=${apiKey}`;
      const pr = await fetch(purl, { signal: AbortSignal.timeout(12000) }); // follows redirect to image
      photoCalls++;
      if (!pr.ok) continue;
      const buf = Buffer.from(await pr.arrayBuffer());
      if (buf.length < 3000) continue;
      const obj = `place-photos/${placeId}-${i}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('business-assets').upload(obj, buf, { contentType: 'image/jpeg', upsert: true });
      if (error) continue;
      const { data: pub } = supabase.storage.from('business-assets').getPublicUrl(obj);
      if (pub?.publicUrl) photos.push(pub.publicUrl);
    } catch { /* skip */ }
  }
  // Place Photo billed at the Details rate ballpark — track conservatively.
  await incrementDailySpend(supabase, { details_calls: photoCalls });
  return { name, photos, detailsCalls, photoCalls };
}
