import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // On ne dépense rien ici : on renvoie des images de démo
  const { prompt } = await req.json().catch(() => ({}));
  const demoImages = [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1024&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517702145080-e4a4d91435d5?q=80&w=1024&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1485808191679-5f86510681a2?q=80&w=1024&auto=format&fit=crop',
  ];
  return NextResponse.json({
    ok: true,
    demo: true,
    note: 'Images de démonstration (aucun crédit consommé).',
    prompt: prompt || null,
    images: demoImages,
  });
}
