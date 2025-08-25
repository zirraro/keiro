import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/social/instagram/accounts
 * Stub temporaire (pas de NextAuth). Renvoie 501 tant que l’OAuth Meta n’est pas câblé.
 */
export async function GET() {
  const hasMetaEnv = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  return NextResponse.json(
    {
      ok: false,
      configured: hasMetaEnv,
      info: hasMetaEnv
        ? "Meta app détectée mais aucun user access token n'est stocké. Compléter l’OAuth pour lister les comptes IG."
        : "Définir META_APP_ID et META_APP_SECRET (et l’URL de redirection) pour activer la liste des comptes Instagram.",
    },
    { status: 501 }
  );
}
