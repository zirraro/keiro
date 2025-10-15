export const runtime = 'nodejs';
export async function GET() {
  const provider = (process.env.SEEDREAM_PROVIDER || 'direct').toLowerCase();
  const editing = provider === 'direct';
  return Response.json({
    provider,
    editing,             // true => /api/edit/image utilisable
    seedreamBase: process.env.SEEDREAM_BASE_URL ? 'set' : 'missing'
  });
}
