import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { getReviewRequestLink } from '@/lib/agents/review-collection';

export const runtime = 'nodejs';

/**
 * THÉO v2 — lien de demande d'avis Google du client + QR (kit vitrine / email).
 * GET → { connected, reviewUrl, qrUrl, name, source }.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const link = await getReviewRequestLink(supabase, user.id);

  // QR rendu côté service (image PNG) pour l'afficher/imprimer directement.
  const qrUrl = link.reviewUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(link.reviewUrl)}`
    : null;

  return NextResponse.json({ ok: true, ...link, qrUrl });
}
