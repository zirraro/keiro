import { NextRequest, NextResponse } from 'next/server';

const ARK_API_KEY = process.env.SEEDREAM_API_KEY || '341cd095-2c11-49da-82e7-dc2db23c565c';
const STATUS_ENDPOINT = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { ok: false, error: 'taskId est requis' },
        { status: 400 }
      );
    }

    // Interroger l'API Seedream pour le statut de la tâche
    const response = await fetch(`${STATUS_ENDPOINT}/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ARK_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Seedream status API error:', response.status, errorText);
      return NextResponse.json(
        { ok: false, error: `Erreur API: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Format de la réponse Seedream:
    // status: "pending" | "processing" | "completed" | "failed"
    // video_url: présent quand status === "completed"

    return NextResponse.json({
      ok: true,
      status: data.status || 'unknown',
      videoUrl: data.video_url || null,
      error: data.error || null,
    });
  } catch (error: any) {
    console.error('Video status check error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur lors de la vérification du statut' },
      { status: 500 }
    );
  }
}
