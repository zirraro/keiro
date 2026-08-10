import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const g = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^["']|["']$/g,'')||'';
for (const k of ['ANTHROPIC_API_KEY','GEMINI_API_KEY','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']) process.env[k] = g(k);
const U = g('NEXT_PUBLIC_SUPABASE_URL'), K = g('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey:K, Authorization:'Bearer '+K };
const { reviewGeneratedImage } = await import('../tmpqa/m/lib__visuals__image-qa.mjs');

const r = await fetch(`${U}/rest/v1/content_calendar?select=id,format,hook,visual_description,visual_url,scheduled_date&source=eq.recycled_pool&status=in.(approved,scheduled,pending)&visual_url=not.is.null&order=scheduled_date&limit=12`,{headers:H});
const posts = await r.json();
console.log(`échantillon de ${posts.length} posts rapatriés\n`);
const compte={};
for (const p of posts){
  const v = await reviewGeneratedImage({ imageUrl: p.visual_url, visualBrief: p.visual_description || p.hook || '', clientLanguage: 'fr' });
  compte[v.verdict]=(compte[v.verdict]||0)+1;
  console.log(`${p.scheduled_date} ${String(p.format).padEnd(9)} ${v.verdict.padEnd(12)} ${v.issue ? '· '+v.issue.slice(0,72) : ''}`);
}
console.log('\nrépartition :', JSON.stringify(compte));
