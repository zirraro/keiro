import { Agent, fetch as undiciFetch } from 'undici';

const base = (process.env.SEEDREAM_BASE_URL || 'https://api.seedream.ai').replace(/\/+$/,'');
const key  = (process.env.SEEDREAM_API_KEY || '').trim();
if (!key) { console.error('❌ SEEDREAM_API_KEY missing'); process.exit(1); }

const u = new URL(base);
const sniVar = (process.env.SEEDREAM_SNI || '').trim();
const servername = sniVar ? (sniVar.toLowerCase()==='disable' ? undefined : sniVar) : u.hostname;
const insecure = (process.env.SEEDREAM_INSECURE || '')==='1';

const dispatcher = new Agent({
  connect: {
    servername,
    // @ts-ignore
    tls: { rejectUnauthorized: !insecure },
    // @ts-ignore
    alpnProtocols: ['http/1.1'],
    timeout: 30_000,
  }
});

try{
  const r = await undiciFetch(`${base}/v1/images/generate`, {
    method:'POST',
    headers:{
      authorization:`Bearer ${key}`,
      'content-type':'application/json',
      accept:'application/json'
    },
    body: JSON.stringify({ prompt:'ping from test-seedream.mjs', size:'256x256' }),
    dispatcher
  });
  const txt = await r.text();
  console.log('HTTP', r.status);
  console.log('HEAD', txt.slice(0,180));
}catch(e){
  console.error('❌ Node test error:', e?.message || e);
  process.exit(2);
}
