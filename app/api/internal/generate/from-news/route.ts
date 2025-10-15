export const runtime = 'nodejs';
export async function POST(req: Request) {
  // TODO: brancher ta vraie génération depuis news ici
  return Response.json(
    { kind: 'error', code: 'NOT_IMPLEMENTED', message: 'From-news generation not implemented yet' },
    { status: 503 }
  );
}
