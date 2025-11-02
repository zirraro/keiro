import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

/** Public demo stub – replace with real getServerSession + getUserPages later */
export async function GET() {
  return NextResponse.json({
    ok: true,
    demo: true,
    pages: [
      { id: "demo_ig_1", name: "Demo Instagram", platform: "instagram" },
      { id: "demo_fb_1", name: "Demo Facebook Page", platform: "facebook" },
      { id: "demo_x_1",  name: "Demo X Account", platform: "x" },
    ],
  });
}
