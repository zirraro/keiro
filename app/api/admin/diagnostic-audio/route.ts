import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Pourquoi les reels partent muets sur TikTok.
 *
 * ── Ce qui est établi ──
 *
 * Fondateur, 18 août : « attention aux reels envoyés sur TikTok, ils doivent
 * avoir du son. »
 *
 * Vérifié plutôt que supposé : les deux derniers reels TikTok publiés portent
 * `-silent-` dans leur nom de fichier, et la mesure le confirme —
 * `mean_volume: -91.0 dB`, soit le silence absolu. La piste audio EXISTE (aac,
 * 10 s) mais elle est vide.
 *
 * C'est le repli `ensureAudioTrack` : quand l'étape musique échoue, on colle
 * une piste muette pour satisfaire Instagram, qui refuse une vidéo sans flux
 * audio. Le repli est correct pour Instagram et désastreux pour TikTok, où le
 * son est un signal de classement — une vidéo muette y est morte à l'arrivée.
 *
 * ── Ce que ce contrôle établit ──
 *
 * La cause de l'échec musique, qu'on ne peut pas voir depuis un poste : la clé
 * Jamendo est-elle posée sur le serveur, et l'API répond-elle ?
 */

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const cle = process.env.JAMENDO_CLIENT_ID;
  const out: Record<string, any> = {
    jamendo_cle: cle ? `présente (${cle.slice(0, 4)}…)` : 'ABSENTE',
  };

  if (cle) {
    try {
      const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(cle)}`
        + `&format=jsonpretty&fuzzytags=${encodeURIComponent('upbeat+corporate')}`
        + `&include=musicinfo&audioformat=mp32&limit=3&order=popularity_total_desc`;
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const j: any = await r.json().catch(() => null);
      out.jamendo_http = r.status;
      out.jamendo_message = j?.headers?.error_message || j?.headers?.status || '(sans message)';
      out.jamendo_pistes = Array.isArray(j?.results) ? j.results.length : 0;
      if (j?.results?.[0]) out.jamendo_exemple = String(j.results[0].audio || '').slice(0, 80);
    } catch (e: any) {
      out.jamendo_http = 'échec réseau';
      out.jamendo_message = e?.message;
    }
  }

  // ffmpeg est indispensable au montage audio : sans lui, ni musique ni piste
  // muette, donc pas de vidéo publiable du tout.
  try {
    const { execSync } = await import('child_process');
    out.ffmpeg = execSync('ffmpeg -version', { timeout: 8000 }).toString().split('\n')[0].slice(0, 60);
  } catch (e: any) {
    out.ffmpeg = `INDISPONIBLE (${e?.message?.slice(0, 60)})`;
  }

  /**
   * L'appel réel, avec la vraie fonction et les vrais filtres.
   *
   * L'API brute répond — mais entre elle et la vidéo il y a deux tamis : la
   * licence doit autoriser l'usage commercial, et la piste ne doit pas avoir
   * servi récemment. Tester l'API sans tester ces filtres, c'est vérifier que
   * le robinet coule sans regarder si le tuyau est bouché.
   */
  try {
    const { pickJamendoMusic, pickMoodFromContext } = await import('@/lib/audio/jamendo-music');
    const mood: any = pickMoodFromContext({ businessType: 'restaurant' });
    out.ambiance_choisie = String(mood);
    const piste = await pickJamendoMusic({ mood, minDurationSec: 8 });
    out.piste_retenue = piste?.url ? `${String(piste.url).slice(0, 70)}…` : 'AUCUNE — c\'est ici que la chaîne casse';
    if (piste) out.piste_titre = `${piste.name || '?'} — ${piste.artist || '?'}`;
  } catch (e: any) {
    out.piste_retenue = `échec : ${e?.message}`;
  }

  out.lecture = out.jamendo_cle === 'ABSENTE'
    ? "La clé Jamendo n'est pas posée sur le serveur : l'étape musique est sautée à chaque fois, et tous les reels partent muets."
    : out.jamendo_pistes > 0
      ? 'Jamendo répond et rend des pistes — la coupure est ailleurs dans la chaîne de montage.'
      : "Jamendo répond mais ne rend aucune piste : les étiquettes de recherche ne trouvent rien.";

  return NextResponse.json({ ok: true, ...out });
}
