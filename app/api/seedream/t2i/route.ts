export const runtime = "nodejs";

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, size = '2K' } = body;

    if (!prompt || typeof prompt !== 'string') {
      return Response.json({
        ok: false,
        error: 'Prompt is required and must be a string'
      }, { status: 400 });
    }

    console.log('[Seedream T2I] Generating image with prompt:', prompt.substring(0, 100) + '...');

    // Appeler l'API Seedream 4.0
    const response = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`
      },
      body: JSON.stringify({
        model: 'seedream-4-0-250828',
        prompt: prompt,
        sequential_image_generation: 'disabled',
        response_format: 'url',
        size: size,
        stream: false,
        watermark: false // Pas de watermark "AI generated"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Seedream T2I] API Error:', response.status, errorText);
      return Response.json({
        ok: false,
        error: 'Impossible de générer l\'image. Vérifiez votre connexion et réessayez.'
      }, { status: response.status });
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].url) {
      console.error('[Seedream T2I] Invalid response:', data);
      return Response.json({
        ok: false,
        error: 'Erreur lors de la génération. Veuillez réessayer.'
      }, { status: 500 });
    }

    console.log('[Seedream T2I] Image generated successfully:', data.data[0].url);

    return Response.json({
      ok: true,
      imageUrl: data.data[0].url,
      size: data.data[0].size,
      usage: data.usage
    });

  } catch (error: any) {
    console.error('[Seedream T2I] Error:', error);
    return Response.json({
      ok: false,
      error: 'Une erreur s\'est produite. Veuillez réessayer.'
    }, { status: 500 });
  }
}
