export const runtime = 'edge';

/**
 * Démo: renvoie une URL vidéo publique (placeholder)
 * + une légende générée à partir des champs news + refinements.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const news = body?.news;
    const ref = body?.refinement;

    const title = news?.title || "Vidéo générée (démo)";
    const angle = news?.angle || "Angle générique";
    const hook = ref?.hook ? `🎯 ${ref.hook}` : "🎯 Découvrez en 60s";
    const cta = ref?.cta || "Passez en Fast Marketing avec KeiroAI";
    const tags = "#KeiroAI #Marketing #Video";

    // Petite vidéo libre de test (placeholder)
    const videoUrl = "https://filesamples.com/samples/video/mp4/sample_640x360.mp4";

    const caption = `Actu : ${title}\nAngle : ${angle}\n\n${hook}\n${cta}\n\n${tags}`;
    return Response.json({ ok: true, videoUrl, caption });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
