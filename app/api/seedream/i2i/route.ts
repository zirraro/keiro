export const runtime = "nodejs";

const SEEDREAM_API_KEY = '341cd095-2c11-49da-82e7-dc2db23c565c';
const SEEDREAM_API_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, image, size = 'adaptive', seed, guidance_scale = 5.5 } = body;

    if (!prompt || typeof prompt !== 'string') {
      return Response.json({
        ok: false,
        error: 'Prompt is required and must be a string'
      }, { status: 400 });
    }

    if (!image || typeof image !== 'string') {
      return Response.json({
        ok: false,
        error: 'Image URL is required and must be a string'
      }, { status: 400 });
    }

    console.log('[Seedream I2I] Editing image with prompt:', prompt.substring(0, 100) + '...');
    console.log('[Seedream I2I] Source image:', image.substring(0, 100) + '...');

    // Appeler l'API Seedream 3.0 i2i
    const requestBody: any = {
      model: 'seededit-3-0-i2i-250628',
      prompt: prompt,
      image: image,
      response_format: 'url',
      guidance_scale: guidance_scale,
      watermark: false // Pas de watermark
    };

    // N'ajouter size que si ce n'est pas 'adaptive' (non supporté par l'API)
    if (size && size !== 'adaptive') {
      requestBody.size = size;
    }

    // Ajouter seed si fourni
    if (seed !== undefined) {
      requestBody.seed = seed;
    }

    const response = await fetch(SEEDREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Seedream I2I] API Error:', response.status, errorText);
      return Response.json({
        ok: false,
        error: `Seedream API error: ${response.status} - ${errorText}`
      }, { status: response.status });
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].url) {
      console.error('[Seedream I2I] Invalid response:', data);
      return Response.json({
        ok: false,
        error: 'Invalid response from Seedream API'
      }, { status: 500 });
    }

    console.log('[Seedream I2I] Image edited successfully:', data.data[0].url);

    return Response.json({
      ok: true,
      imageUrl: data.data[0].url,
      size: data.data[0].size,
      usage: data.usage
    });

  } catch (error: any) {
    console.error('[Seedream I2I] Error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}
