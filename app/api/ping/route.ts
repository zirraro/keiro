export async function GET() {
  return new Response(JSON.stringify({ ok: true, where: "app/api/ping" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
