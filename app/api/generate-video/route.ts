import { NextResponse } from 'next/server';
import Replicate from 'replicate';

export const runtime = 'nodejs';

type Body = {
  sector?: string;
  context?: string;
  offer?: string;
  headline?: string;
  cta?: string;
  meta?: {
    objective?: string;
    brandColor?: string;
    businessType?: string;
    platform?: string;
  };
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body | undefined;

    const token = process.env.REPLICATE_API_TOKEN || '';
    const videoModelEnv =
      process.env.REPLICATE_VIDEO_MODEL ||
      'stability-ai/stable-video-diffusion-img2vid';

    // ✅ Typage explicite pour satisfaire replicate.run()
    const videoModel =
      videoModelEnv as `${string}/${string}` | `${string}/${string}:${string}`;

    // Fallback démo si env manquant
    if (!token || !videoModelEnv) {
      return NextResponse.json(
        {
          demo: true,
          note:
            "Mode démo (clé ou modèle Replicate manquant). Ajoute REPLICATE_API_TOKEN et REPLICATE_VIDEO_MODEL.",
          videos: [
            // petite vidéo de démo (gif/mp4 public neutre)
            'https://cdn.jsdelivr.net/gh/ismamz/stock-assets@main/video/placeholder-clip-1.mp4',
          ],
        },
        { status: 200 }
      );
    }

    const replicate = new Replicate({ auth: token });

    // Prompt très simple (à affiner plus tard)
    const promptParts = [
      body?.headline || 'Annonce courte et dynamique',
      body?.offer,
      body?.context,
      body?.sector,
      body?.meta?.businessType,
    ]
      .filter(Boolean)
      .join(' · ');

    // Chaque modèle a ses champs — on reste générique.
    const input: Record<string, unknown> = {
      prompt: promptParts,
      // Valeurs par défaut raisonnables (le modèle ignorera ce qui ne le concerne pas)
      fps: 24,
      num_frames: 48,
      // Certaines implémentations acceptent "width"/"height" ou "resolution"
      width: 768,
      height: 768,
    };

    // ✅ Appel typé
    const output = (await replicate.run(videoModel, { input })) as any;

    // Normaliser la sortie en tableau d’URLs
    let urls: string[] = [];
    if (typeof output === 'string') {
      urls = [output];
    } else if (Array.isArray(output)) {
      urls = output.map((o) => String(o));
    } else if (output?.output) {
      const out = output.output;
      urls = Array.isArray(out) ? out.map((o: any) => String(o)) : [String(out)];
    }

    if (!urls.length) {
      return NextResponse.json(
        { error: 'Aucune vidéo renvoyée par le modèle.' },
        { status: 422 }
      );
    }

    return NextResponse.json({ videos: urls }, { status: 200 });
  } catch (err: any) {
    const msg =
      err?.error?.message ||
      err?.message ||
      'Replicate create failed (video)';
    const detail = err?.error || err?.response || err;
    return NextResponse.json(
      {
        error: 'Replicate create failed',
        detail: typeof detail === 'string' ? detail : undefined,
        message: msg,
      },
      { status: 422 }
    );
  }
}
