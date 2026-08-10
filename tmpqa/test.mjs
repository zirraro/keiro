import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const g = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^["']|["']$/g,'')||'';
for (const k of ['ANTHROPIC_API_KEY','GEMINI_API_KEY','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']) process.env[k] = g(k);
const { reviewGeneratedImage } = await import('../tmpqa/m/lib__visuals__image-qa.mjs');
const cas = [
  ['PHOTO réelle, brief correspondant', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=900', 'Interior of a hair salon with natural window light, a hairdresser at work'],
  ['PHOTO réelle, brief SANS RAPPORT',  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=900', 'A mechanic repairing a car engine in a garage'],
  ['ILLUSTRATION (doit être refusée)',  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Cupcake_icon.png/512px-Cupcake_icon.png', 'A professional photograph of a bakery counter at dawn'],
];
for (const [nom, url, brief] of cas) {
  const t0 = Date.now();
  try {
    const v = await reviewGeneratedImage({ imageUrl: url, visualBrief: brief, businessType: 'coiffeur', clientLanguage: 'fr' });
    console.log(`\n── ${nom}\n   verdict : ${v.verdict}${v.raisonIndisponible ? ' ('+v.raisonIndisponible+')' : ''}  · ${Date.now()-t0} ms`);
    if (v.issue) console.log(`   motif   : ${v.issue}`);
  } catch (e) { console.log(`\n── ${nom}\n   ERREUR : ${e.message}`); }
}
