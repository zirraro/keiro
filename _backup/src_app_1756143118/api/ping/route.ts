export async function GET() {
  return new Response(JSON.stringify({ ok: true, where: "src/app/api/ping" }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
}
