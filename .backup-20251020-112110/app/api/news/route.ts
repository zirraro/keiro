export const runtime = "nodejs";
import { fetchNews } from "@/lib/news";

export async function GET() {
  try {
    const data = await fetchNews();
    return Response.json( { ok: true, items: data } );
  } catch (e: any) {
    console.error("Ereur fetchNews:", e);
    return new Response( JSON.stringify( { ok: false, error: e.message } ), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    } );
  }
}
