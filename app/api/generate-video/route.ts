import { NextResponse } from 'next/server';
import Replicate from 'replicate';

type VideoResp =
  | { videos: string[]; demo?: boolean; note?: string }
  | { error: string; details?: string };

export async function POST(req: Request) {
  // --- ENV
  const token = process.env.REPLICATE_API_TOKEN as string | undefined;
  // modèle vidéo par défaut si non fourni
  const videoModel =
    process.env.REPLICATE_VIDEO_MODEL || 'stability-ai/stable-video-diffusion-img2vid';

  // --- Fallback démo si l’API n’est pas prête (token manquant par ex.)
  if (!token || !videoModel) {
    return NextResponse.json(
      {
        demo: true,
        note:
          "Mode démo (REPLICATE_API_TOKEN ou REPLICATE_VIDEO_MODEL manquant). " +
          "Ajoute les variables d'env dans Vercel pour activer la génération vidéo.",
        videos: [
          // petite vidéo placeholder publique
          'https://media.w3.org/2010/05/sintel/trailer_hd.mp4',
        ],
      } satisfies VideoResp,
      { status: 200 },
    );
  }

  // --- Client Replicate
  const replicate = new Replicate({ auth: token });

  // --- Corps de requête
  const body = (await req.json()) as {
    prompt?: string;
    image?: string; // URL image de départ pour img2vid
    meta?: Record<string, unknown>;
  };

  const prompt = body?.prompt ?? 'short promo video';
  const image = body?.image ?? undefined;

  // Entrées pour SVD img2vid
  const input: Record<string, unknown> = {
    // Pour SVD : soit image+prompt, soit prompt seul selon la version.
    // On passe image si fournie; sinon le modèle utilisera juste le prompt.
    prompt,
    fps: 12,
    motion_bucket_id: 127,
    cond_aug: 0.02,
    decoding_t: 7,
    // image optionnelle :
    ...(image ? { image } : {}),
  };

  try {
    // IMPORTANT : on appelle le modèle par son identifiant (pas une version)
    const output = (await replicate.run(videoModel, { input })) as any;

    // Replicate peut renvoyer une string (url) ou un tableau de frames/urls.
    let urls: string[] = [];
    if (Array.isArray(output)) {
      urls = output.filter(Boolean);
    } else if (typeof output === 'string') {
      urls = [output];
    } else if (output?.output && Array.isArray(output.output)) {
      urls = output.output.filter(Boolean);
    }

    if (!urls.length) {
      return NextResponse.json(
        { error: 'Aucune sortie vidéo renvoyée par le modèle.' } satisfies VideoResp,
        { status: 502 },
      );
    }

    return NextResponse.json(
      { videos: urls } satisfies VideoResp,
      { status: 200 },
    );
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; title?: string; detail?: string };
    return NextResponse.json(
      {
        error: 'Replicate create failed',
        details: err?.message || err?.detail || err?.title || 'unknown error',
      } satisfies VideoResp,
      { status: Number(err?.status) || 500 },
    );
  }
}
