// Les deux juges sur les MEMES images reelles. Le fondateur tranche.
const {createClient}=await import('@supabase/supabase-js');
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const A=(process.env.SEEDREAM_API_KEY||process.env.ARK_API_KEY||'').trim();
const G=(process.env.GEMINI_API_KEY||'').trim();
const Q=`Note cette image pour le reseau social d'un commercant local.
JSON UNIQUEMENT: {"note":0-10,"sombre":true/false,"texte_parasite":true/false,"defaut":"une phrase en francais"}
- sombre: vrai si l'image est trop sombre ou melancolique pour un commerce`;
async function ark(url){
 const r=await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+A},
  body:JSON.stringify({model:'seed-2-0-pro-260328',messages:[{role:'user',content:[{type:'image_url',image_url:{url}},{type:'text',text:Q}]}],max_tokens:300,temperature:0}),signal:AbortSignal.timeout(180000)});
 const d=await r.json(); const t=d?.choices?.[0]?.message?.content||'';
 try{return JSON.parse(t.replace(/```json|```/g,'').trim())}catch{return null}
}
async function gem(url){
 const img=await fetch(url); const b64=Buffer.from(await img.arrayBuffer()).toString('base64');
 const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${G}`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({contents:[{parts:[{inline_data:{mime_type:'image/jpeg',data:b64}},{text:Q}]}],generationConfig:{temperature:0,maxOutputTokens:600,thinkingConfig:{thinkingBudget:0}}}),signal:AbortSignal.timeout(180000)});
 const d=await r.json(); const t=d?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')||'';
 try{return JSON.parse(t.replace(/```json|```/g,'').trim())}catch{return null}
}
const {data}=await s.from('content_calendar').select('visual_url,hook,platform')
 .eq('status','published').not('visual_url','is',null).order('published_at',{ascending:false}).limit(5);
console.log('\nARBITRAGE DES DEUX JUGES — images reellement publiees\n'+'='.repeat(70));
for(const p of data||[]){
 const [a,g]=await Promise.all([ark(p.visual_url),gem(p.visual_url)]);
 console.log(`\n« ${String(p.hook||'').slice(0,60)} » (${p.platform})`);
 console.log(`  ARK    note ${a?.note??'?'}/10  sombre=${a?.sombre??'?'}  texte=${a?.texte_parasite??'?'}  ${String(a?.defaut||'').slice(0,70)}`);
 console.log(`  GEMINI note ${g?.note??'?'}/10  sombre=${g?.sombre??'?'}  texte=${g?.texte_parasite??'?'}  ${String(g?.defaut||'').slice(0,70)}`);
 console.log(`  ${p.visual_url}`);
}
