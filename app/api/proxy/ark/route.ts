import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const ARK_API_KEY = process.env.ARK_API_KEY;
    const res = await fetch('https://ark.ap-southeast-1.bytepluses.com/api/v3/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const data = await res.text();
    return new NextResponse(data, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return NextResponse.json({ error: 'proxy_error', message: e.message }, { status: 500 });
  }
}
