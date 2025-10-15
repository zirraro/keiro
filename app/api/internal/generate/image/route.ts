export const runtime = 'nodejs';
export async function POST(req: Request) {
  // TODO: brancher ta vraie génération ici (modèle, provider, etc.)
  return Response.json(
    { kind: 'error', code: 'NOT_IMPLEMENTED', message: 'Image generation not implemented yet' },
    { status: 503 }
  );
}
