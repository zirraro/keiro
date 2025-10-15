/** Tokenise FR très simple */
function tok(s:string){ return (s||"").toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu,' ')
  .replace(/[^a-z0-9éèêàùçïüœ\- ]/gi,' ')
  .split(/\s+/).filter(Boolean); }

export function relevanceScore(
  item:{title?:string; description?:string; source?:string},
  query:string
){
  const Q = new Set(tok(query));
  if (!Q.size) return 0;
  const title = tok(item.title||"");
  const desc  = tok(item.description||"");
  const src   = tok(item.source||"");

  let s = 0;
  for (const w of title) if (Q.has(w)) s += 3;     // poids fort dans le titre
  for (const w of desc)  if (Q.has(w)) s += 1.5;   // moyen dans la desc
  for (const w of src)   if (Q.has(w)) s += 0.5;   // léger sur la source

  // petit bonus si plusieurs mots-clés différents apparaissent
  const uniqHits = new Set([...title, ...desc].filter(w=>Q.has(w))).size;
  s += Math.min(uniqHits, 4)*0.5;

  return s;
}
