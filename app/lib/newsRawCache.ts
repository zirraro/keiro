type RawItem = any;
type Bucket = { t:number; items: RawItem[]; providers:{gnews:number;newsdata:number;newsapiai:number} };
const ONE_DAY = 24*60*60*1000;
// @ts-ignore
const store: Map<string, Bucket> = (globalThis as any).__newsRawCache ||= new Map();

export function key(cat:string, period:string){
  const kDay = new Date().toISOString().slice(0,10);
  return `${kDay}:${cat}:${period}`;
}
export function get(cat:string, period:string){
  const b = store.get(key(cat,period));
  if (!b) return null;
  if (Date.now() - b.t > ONE_DAY) { store.delete(key(cat,period)); return null; }
  return b;
}
export function put(cat:string, period:string, items:any[], providers:{gnews:number;newsdata:number;newsapiai:number}){
  store.set(key(cat,period), { t: Date.now(), items, providers });
}
