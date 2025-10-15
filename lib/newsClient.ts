type Plan = { topic?: string; q?: string; timeframe: string; limit: number };

const MAP: Record<string, { topic?: string; q?: string; kw?: string[] }> = {
  technology:  { topic: 'technology' },
  science:     { topic: 'science' },
  world:       { topic: 'world' },
  business:    { topic: 'business' },
  sports:      { topic: 'sports',
    q: '(sport OR football OR foot OR rugby OR tennis OR basket OR NBA OR JO OR olympique OR "Ligue 1" OR PSG OR OM)',
    kw: ['sport','football','rugby','tennis','basket','NBA','JO','Ligue 1','PSG','OM'] },
  health:      { topic: 'health',
    q: '(santé OR médical OR médecine OR hôpital OR hopital OR maladie OR vaccin OR "santé publique")',
    kw: ['santé','médical','médecine','hôpital','maladie','vaccin'] },
  restauration:{ q: '(restauration OR restaurant OR restaurants OR food OR cuisine OR agroalimentaire OR "fast-food" OR "chaîne de restaurants")',
    kw: ['restaurant','restauration','cuisine','food','agroalimentaire','fast-food'] },
  environment: { q: '(environnement OR écologie OR climat OR "changement climatique" OR biodiversité OR "énergie verte" OR recyclage OR COP)',
    kw: ['environnement','écologie','climat','biodiversité','énergie','COP'] },
  gaming:      { q: '(gaming OR "jeu vidéo" OR "jeux vidéo" OR Xbox OR PlayStation OR Nintendo OR Steam OR e-sport OR esports)',
    kw: ['gaming','jeu vidéo','PlayStation','Xbox','Nintendo','Steam','e-sport','esports'] },
};

function dedupe(items: any[]) {
  const m = new Map<string, any>();
  for (const it of items || []) {
    const k = ((it?.url||'')+'::'+(it?.title||'')).toLowerCase();
    if (!m.has(k)) m.set(k, it);
  }
  return [...m.values()];
}
function filterRelevant(items: any[], key: string) {
  const kw = MAP[key]?.kw;
  if (!kw) return items;
  const out = (items||[]).filter((it:any) => {
    const h = ((it.title||'')+' '+(it.snippet||'')+' '+(it.source||'')).toLowerCase();
    return kw.some(k => h.includes(k.toLowerCase()));
  });
  return out.length >= Math.min(3, (items||[]).length) ? out : items;
}
function qsOf(p: Plan, extraSearch?: string) {
  const sp = new URLSearchParams();
  sp.set('timeframe', p.timeframe);
  sp.set('limit', String(p.limit));
  if (p.topic) sp.set('topic', p.topic);
  const qParts:string[] = [];
  if (p.q) qParts.push(p.q);
  if (extraSearch?.trim()) qParts.push(extraSearch.trim());
  if (qParts.length) sp.set('q', qParts.join(' AND '));
  sp.set('nc', String(Date.now()));
  return sp.toString();
}

function buildPlans(key: string, timeframe: string, search: string, limit: number): Plan[] {
  const tfAll = ['24h','48h','72h','7d'];
  const start = tfAll.includes(timeframe) ? timeframe : '24h';
  const tfs = [start, ...tfAll.filter(t => t!==start)];
  const m = MAP[key] || {};
  const baseTopic = m.topic;
  const fq = m.q;

  const plans: Plan[] = [];
  for (const tf of tfs) {
    // 1) topic seul (+ recherche libre)
    if (baseTopic) plans.push({ topic: baseTopic, timeframe: tf, limit, q: undefined });
    // 2) topic + q ciblé
    if (baseTopic && fq) plans.push({ topic: baseTopic, q: fq, timeframe: tf, limit });
    // 3) q seul (sans topic) si cat "difficile"
    if (fq) plans.push({ q: fq, timeframe: tf, limit });
  }
  // filet de sécurité: si aucune règle → topic=world/business…
  if (!plans.length) plans.push({ timeframe: start, limit, topic: key as any });

  // Raccourcir: on n’essaie pas 100 plans; 10 suffisent
  return plans.slice(0, 10);
}

export async function getNewsRobust(key: string, timeframe: string, search: string, limit = 30) {
  const plans = buildPlans(key, timeframe, search, limit);
  let best:any[] = [];
  for (const p of plans) {
    const url = `/api/news?${qsOf(p, search)}`;
    // console.debug('[news plan]', url);
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json().catch(()=>({}));
    const items = Array.isArray(j?.items) ? j.items : [];
    if (items.length) {
      best = items;
      break;
    }
  }
  const merged = filterRelevant(dedupe(best), key);
  return { items: merged };
}
