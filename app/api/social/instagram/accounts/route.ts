import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

/** Public demo stub – replace with real IG accounts listing once auth is enabled */
export async function GET() {
  return NextResponse.json({
    ok: true,
    demo: true,
    accounts: [
      { id: "ig_demo_1", username: "keiro_demo", type: "business" },
      { id: "ig_demo_2", username: "brand_demo", type: "creator" },
    ],
  });
}
