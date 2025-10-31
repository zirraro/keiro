import { NextRequest, NextResponse } from 'next/server';

const ARK_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const VIDEO_ENDPOINT = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

type VideoGenerationRequest = {
  prompt: string;
  resolution?: '720p' | '1080p';
  duration?: number; // en secondes, 5-10
  cameraFixed?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const body: VideoGenerationRequest = await req.json();

    if (!body.prompt || body.prompt.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Le prompt est requis' },
        { status: 400 }
      );
    }

    // Construire le prompt avec les paramètres
    const resolution = body.resolution || '1080p';
    const duration = body.duration || 5;
    const cameraFixed = body.cameraFixed !== undefined ? body.cameraFixed : false;

    const fullPrompt = `${body.prompt.trim()} --resolution ${resolution} --duration ${duration} --camerafixed ${cameraFixed}`;

    // Appeler l'API Seedream pour générer la vidéo
    const response = await fetch(VIDEO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'seedance-1-0-pro-250528',
        content: [
          {
            type: 'text',
            text: fullPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Seedream video API error:', response.status, errorText);
      return NextResponse.json(
        { ok: false, error: `Erreur API Seedream: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    console.log('[Video API] Seedream response:', JSON.stringify(data, null, 2));

    if (!data.id) {
      console.error('[Video API] Missing id in response:', data);
      return NextResponse.json(
        { ok: false, error: 'Réponse invalide de l\'API Seedream' },
        { status: 500 }
      );
    }

    console.log('[Video API] Task created successfully:', data.id);

    // Retourner l'ID de la tâche
    // Note: La génération vidéo est asynchrone, il faudra interroger l'API pour récupérer le résultat
    return NextResponse.json({
      ok: true,
      taskId: data.id,
      message: 'Génération vidéo lancée. Veuillez patienter...',
    });
  } catch (error: any) {
    console.error('Video generation error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la génération vidéo' },
      { status: 500 }
    );
  }
}
