import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
function env(n:string,d=''){ return (process.env as any)[n] ?? d; }

export async function POST(req: Request){
  const LT_BASE = env('LT_BASE', '');       // ex: https://api.languagetoolplus.com
  const LT_KEY  = env('LT_API_KEY', '');    // optionnel selon instance
  if (!LT_BASE) return new Response(null, { status: 204 });

  try{
    const { text, lang } = await req.json();
    const body = new URLSearchParams({
      text: text || '',
      language: lang || 'fr',
    });
    const headers: Record<string,string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (LT_KEY) headers['Authorization'] = `Bearer ${LT_KEY}`;

    const res = await fetch(`${LT_BASE}/v2/check`, { method:'POST', headers, body });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error:'lt_error', body:data }, { status: res.status });

    // Applique les suggestions (simplement la première pour chaque match)
    let out = text || '';
    // Pour ne pas casser les index, on applique de droite à gauche
    const matches = (data.matches || []).sort((a:any,b:any)=> (b.offset - a.offset));
    for(const m of matches){
      const r = m.replacements?.[0]?.value;
      if (!r) continue;
      const off = m.offset, len = m.length;
      out = out.slice(0, off) + r + out.slice(off+len);
    }
    return NextResponse.json({ text: out, raw: data });
  }catch(e:any){
    return NextResponse.json({ error:'proofread_failed', message:String(e?.message||e) }, { status: 500 });
  }
}
