import https from 'https';
import tls from 'tls';

const base = process.env.SEEDREAM_BASE_URL || 'https://api.seedream.ai';
const key  = (process.env.SEEDREAM_API_KEY || '').trim();
const sni  = (process.env.SEEDREAM_SNI || new URL(base).hostname).trim();

const url = new URL(base);
const host = url.hostname;

function tlsCheck(rejectUnauthorized=true) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port: 443,
      servername: sni,
      rejectUnauthorized
    }, () => {
      const cert = socket.getPeerCertificate();
      const subject = cert && cert.subject ? JSON.stringify(cert.subject) : '(no subject)';
      console.log(`TLS OK (rejectUnauthorized=${rejectUnauthorized}) — subject=${subject}`);
      socket.end(); resolve(true);
    });
    socket.on('error', (e)=>{ console.error(`TLS ERR (rejectUnauthorized=${rejectUnauthorized}):`, e.message); resolve(false); });
  });
}

function postJSON(path, rejectUnauthorized=true) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ prompt: "diag keiro seedream", size: "256x256" });
    const req = https.request({
      host,
      port: 443,
      path,
      method: 'POST',
      servername: sni,
      rejectUnauthorized,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res)=>{
      let buf = '';
      res.setEncoding('utf8');
      res.on('data',d=>buf+=d);
      res.on('end', ()=>{
        console.log(`HTTPS POST ${path} -> HTTP ${res.statusCode}`);
        console.log(buf.slice(0, 400));
        resolve(true);
      });
    });
    req.on('error',(e)=>{ console.error(`POST ERR (rejectUnauthorized=${rejectUnauthorized}):`, e.message); resolve(false); });
    req.write(data); req.end();
  });
}

(async ()=>{
  console.log('— Seedream DIAG —');
  console.log('BASE_URL =', base);
  console.log('SNI      =', sni);
  console.log('KEY len  =', key.length);

  const t1 = await tlsCheck(true);
  const t2 = t1 ? await postJSON('/v1/images/generate', true) : false;

  if (!t2) {
    console.log('\nRetry with rejectUnauthorized=false (diagnostic only)…');
    await tlsCheck(false);
    await postJSON('/v1/images/generate', false);
  }
})();
