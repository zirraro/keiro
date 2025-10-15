'use client';
import React from 'react';

type Platform = 'instagram'|'tiktok'|'facebook'|'linkedin'|'x';
const LIMITS: Record<Platform, number> = {
  instagram: 2200, tiktok: 2200, facebook: 63206, linkedin: 3000, x: 280
};

// Heuristiques FR légères
function polishLocal(input: string){
  if (!input) return input;
  let s = input;

  // espaces insécables FR avant : ; ? ! (ici on met un espace simple)
  s = s.replace(/\s*([:;!?])/g, ' $1');

  // apostrophes typographiques
  s = s.replace(/\b([cdjlmtsnC D J L M T S N])\s*'\s*(est|ai|as|a|avons|avez|ont|étais|était|étions|étiez|étaient)\b/gi, "$1’ $2").replace(/\s’/g,'’');
  s = s.replace(/\bc ?est\b/gi, "c’est");

  // petites confusions fréquentes
  s = s.replace(/\bca\b/gi, "ça");
  s = s.replace(/\bsa (?:est|était|sera)\b/gi, (m)=>m.replace(/^sa/i,'ça'));

  // Double espaces & espaces avant virgule/point
  s = s.replace(/\s{2,}/g,' ').replace(/\s+([,.])/g,'$1');

  // Trop de !!! ou ??? -> limite
  s = s.replace(/!{3,}/g,'!!').replace(/\?{3,}/g,'??');

  // Limiter les emojis répétés
  s = s.replace(/([\p{Emoji_Presentation}\p{Emoji}\uFE0F])\1{2,}/gu, '$1$1');

  // Capitales criardes > 12 caractères -> met en phrase
  s = s.replace(/\b([A-ZÉÀÈÙÂÊÎÔÛÄËÏÖÜÇ]{12,})\b/g, (m)=> m.toLowerCase());

  return s.trim();
}

function slugify(s:string){
  return s.toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,'-');
}
function keywordsFrom(text:string, n=8){
  const words = (text||'').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu,' ')
    .split(/\s+/).filter(Boolean)
    .filter(w=>!['le','la','les','des','un','une','de','du','et','en','dans','pour','sur','avec','par','au','aux','ce','cet','cette','qui','que','quoi','dont','ou','mais','donc','or','ni','car'].includes(w));
  const freq:Record<string,number>={}; words.forEach(w=>freq[w]=(freq[w]||0)+1);
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k);
}
function makeHashtags(keywords:string[], brand?:string){
  const base = keywords.slice(0,10).map(k=>'#'+slugify(k));
  if (brand) base.unshift('#'+slugify(brand));
  return Array.from(new Set(base));
}
function trimToLimit(txt:string, limit:number){
  if (txt.length<=limit) return txt;
  return txt.slice(0, Math.max(0, limit-1))+'…';
}

export default function SocialAssistant({
  seedText, brand, imageUrl
}:{
  seedText?: string,
  brand?: string,
  imageUrl?: string
}){
  const [tone, setTone] = React.useState<'neutre'|'expert'|'fun'|'urgent'|'inspirant'>('inspirant');
  const [cta, setCta] = React.useState<string>('Découvrez maintenant');
  const [platform, setPlatform] = React.useState<Platform>('instagram');
  const [length, setLength] = React.useState<'court'|'moyen'|'long'>('moyen');
  const [includeEmoji, setIncludeEmoji] = React.useState(true);
  const [polished, setPolished] = React.useState<string>('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string>();

  const kw = React.useMemo(()=>keywordsFrom(seedText||'', 10),[seedText]);
  const hashtags = React.useMemo(()=>makeHashtags(kw, brand),[kw, brand]);

  function baseCaption(){
    const emo = includeEmoji ? { star:'✨', fire:'🔥', pin:'📌', arrow:'➡️', spark:'💡', hand:'👉' } :
                               { star:'', fire:'', pin:'', arrow:'', spark:'', hand:'' };
    const base = seedText || 'Nouvelle actu, nouvelles idées.';
    let hook = base;

    if (tone==='expert') hook = `${emo.spark} ${base} — analyse et points clés.`;
    if (tone==='fun') hook = `${emo.fire} ${base} — petite dose de fun !`;
    if (tone==='urgent') hook = `⚠️ URGENT : ${base}`;
    if (tone==='inspirant') hook = `${emo.star} ${base}`;

    const add = {
      court: `${emo.hand} ${cta}.`,
      moyen: `${emo.hand} ${cta}. ${emo.arrow} Dites-nous ce que vous en pensez.`,
      long: `${emo.hand} ${cta}.\n\nPoints clés :\n• ${kw.slice(0,3).join(' • ')}\n${emo.arrow} Votre avis compte !`
    }[length];

    const core = `${hook}\n\n${add}`;
    const tags = '\n\n' + hashtags.slice(0,12).join(' ');
    return core + tags;
  }

  const rawCaption = React.useMemo(()=>baseCaption(),[tone,cta,platform,length,includeEmoji,seedText,brand,hashtags]);
  const preview = polished || trimToLimit(polishLocal(rawCaption), LIMITS[platform]);

  async function runProofread(){
    try{
      setBusy(true); setErr(undefined); setPolished('');
      // Appelle /api/proofread ; si 204 => pas configuré, on garde le local
      const res = await fetch('/api/proofread', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ text: trimToLimit(polishLocal(rawCaption), LIMITS[platform]), lang:'fr' }) });
      if (res.status===204){ setPolished(trimToLimit(polishLocal(rawCaption), LIMITS[platform])); return; }
      const data = await res.json();
      if (!res.ok || !data?.text){ setErr(data?.error||'proofread_failed'); setPolished(trimToLimit(polishLocal(rawCaption), LIMITS[platform])); return; }
      setPolished(trimToLimit(data.text, LIMITS[platform]));
    }catch(e:any){
      setErr(String(e?.message||e));
      setPolished(trimToLimit(polishLocal(rawCaption), LIMITS[platform]));
    }finally{
      setBusy(false);
    }
  }

  function copy(txt:string){ navigator.clipboard.writeText(txt).catch(()=>{}); }

  return (
    <div className="rounded-2xl border border-neutral-200 p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium">Assistant Social (posts & hashtags)</h4>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-3">
          <label className="text-sm text-neutral-700">Texte source (actu / description)</label>
          <textarea
            className="w-full border rounded px-3 py-2 h-28"
            placeholder="Colle ici le titre/description d’actu…"
            defaultValue={seedText}
            onChange={(e)=>{ /* facultatif : si tu veux recomposer live */ }}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <select className="border rounded px-2 py-1" value={tone} onChange={e=>setTone(e.target.value as any)}>
              <option value="inspirant">Tonalité : Inspirant</option>
              <option value="neutre">Tonalité : Neutre</option>
              <option value="expert">Tonalité : Expert</option>
              <option value="fun">Tonalité : Fun</option>
              <option value="urgent">Tonalité : Urgent</option>
            </select>
            <select className="border rounded px-2 py-1" value={platform} onChange={e=>setPlatform(e.target.value as any)}>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="facebook">Facebook</option>
              <option value="linkedin">LinkedIn</option>
              <option value="x">X / Twitter</option>
            </select>
            <select className="border rounded px-2 py-1" value={length} onChange={e=>setLength(e.target.value as any)}>
              <option value="court">Court</option>
              <option value="moyen">Moyen</option>
              <option value="long">Long</option>
            </select>
            <label className="text-sm inline-flex items-center gap-2">
              <input type="checkbox" checked={includeEmoji} onChange={e=>setIncludeEmoji(e.target.checked)}/> Emojis
            </label>
          </div>
          <button onClick={runProofread} disabled={busy} className="px-3 py-2 rounded border bg-white hover:bg-neutral-50">
            {busy ? 'Correction…' : 'Corriger (FR)'}
          </button>
          {err && <div className="text-xs text-red-600">Correction : {err}</div>}
        </div>

        <div className="space-y-2">
          <div className="text-sm text-neutral-700">Prévisualisation</div>
          <div className="border rounded p-3 bg-neutral-50 whitespace-pre-wrap break-words">{preview}</div>
          <div className="text-xs text-neutral-500">Hashtags (top 12) : {hashtags.slice(0,12).join(' ')}</div>
          <div className="flex gap-2">
            <button onClick={()=>copy(preview)} className="px-3 py-2 rounded border bg-white hover:bg-neutral-50">Copier le post</button>
            <button onClick={()=>copy(hashtags.slice(0,12).join(' '))} className="px-3 py-2 rounded border bg-white hover:bg-neutral-50">Copier hashtags</button>
          </div>
        </div>
      </div>
    </div>
  );
}
