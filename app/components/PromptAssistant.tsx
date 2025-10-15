'use client';
import React, { useEffect, useMemo, useState } from 'react';

type NewsItem = { title?: string; description?: string; source?: string; url?: string; };

const FIELD = (p:string)=>`keiro_prompt_${p}`;

export default function PromptAssistant({ selected }: { selected?: NewsItem }) {
  const [brand, setBrand] = useState('');
  const [sector, setSector] = useState('');
  const [audience, setAudience] = useState('');
  const [objective, setObjective] = useState('attirer des prospects');
  const [tone, setTone] = useState('Convaincant, clair, professionnel');
  const [emotions, setEmotions] = useState('Confiance, curiosité, désir');
  const [painPoints, setPainPoints] = useState('Perte de temps, coûts, manque de leads');
  const [valueProps, setValueProps] = useState('Gains de temps, ROI mesurable, accompagnement');
  const [offer, setOffer] = useState('Offre limitée, bonus de lancement');
  const [channels, setChannels] = useState('Instagram Reels, TikTok, LinkedIn');
  const [cta, setCta] = useState('Demander une démo');
  const [hashtags, setHashtags] = useState('#AI #Business #Tendance');

  // Hydrate depuis localStorage
  useEffect(()=>{
    try{
      setBrand(localStorage.getItem(FIELD('brand'))||'');
      setSector(localStorage.getItem(FIELD('sector'))||'');
      setAudience(localStorage.getItem(FIELD('audience'))||'');
      setObjective(localStorage.getItem(FIELD('objective'))||'attirer des prospects');
      setTone(localStorage.getItem(FIELD('tone'))||'Convaincant, clair, professionnel');
      setEmotions(localStorage.getItem(FIELD('emotions'))||'Confiance, curiosité, désir');
      setPainPoints(localStorage.getItem(FIELD('pain'))||'Perte de temps, coûts, manque de leads');
      setValueProps(localStorage.getItem(FIELD('value'))||'Gains de temps, ROI mesurable, accompagnement');
      setOffer(localStorage.getItem(FIELD('offer'))||'Offre limitée, bonus de lancement');
      setChannels(localStorage.getItem(FIELD('channels'))||'Instagram Reels, TikTok, LinkedIn');
      setCta(localStorage.getItem(FIELD('cta'))||'Demander une démo');
      setHashtags(localStorage.getItem(FIELD('hashtags'))||'#AI #Business #Tendance');
    }catch{}
  },[]);

  // Persiste et partage un prompt “marketing émotionnel”
  const prompt = useMemo(()=>{
    const act = selected?.title ? `Actu: ${selected.title}\nSource: ${selected.source||''}\nURL: ${selected.url||''}` : 'Actu: (non sélectionnée)';
    return [
      `Tu es un copywriter marketing senior.`,
      `Objectif: ${objective}.`,
      `Marque / secteur: ${brand} — ${sector}.`,
      `Audience visée: ${audience}.`,
      `Ton: ${tone}. Émotions à susciter: ${emotions}.`,
      `Douleurs client à adresser: ${painPoints}.`,
      `Propositions de valeur à mettre en avant: ${valueProps}.`,
      `Offre/avantage: ${offer}. Canaux: ${channels}.`,
      `CTA: ${cta}. Hashtags: ${hashtags}.`,
      act,
      `Production attendue: 1 visuel social “prêt à poster” (image), cadrage 1:1 ou 4:5, composition claire, couleurs de marque, thème ${sector}.`,
      `Style: moderne, premium, fun; lisible sur mobile; éviter le jargon; pas de pavés de texte trop longs.`
    ].join('\n');
  },[brand, sector, audience, objective, tone, emotions, painPoints, valueProps, offer, channels, cta, hashtags, selected]);

  useEffect(()=>{
    try{
      localStorage.setItem('keiro_prompt_draft', prompt);
      localStorage.setItem(FIELD('brand'), brand);
      localStorage.setItem(FIELD('sector'), sector);
      localStorage.setItem(FIELD('audience'), audience);
      localStorage.setItem(FIELD('objective'), objective);
      localStorage.setItem(FIELD('tone'), tone);
      localStorage.setItem(FIELD('emotions'), emotions);
      localStorage.setItem(FIELD('pain'), painPoints);
      localStorage.setItem(FIELD('value'), valueProps);
      localStorage.setItem(FIELD('offer'), offer);
      localStorage.setItem(FIELD('channels'), channels);
      localStorage.setItem(FIELD('cta'), cta);
      localStorage.setItem(FIELD('hashtags'), hashtags);
    }catch{}
  },[prompt]);

  const Input = (p:{label:string; val:string; set:(v:string)=>void; ph?:string})=>(
    <div>
      <div className="text-sm text-neutral-600 mb-1">{p.label}</div>
      <input value={p.val} onChange={e=>p.set(e.target.value)}
        placeholder={p.ph}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"/>
    </div>
  );

  return (
    <div className="rounded-2xl border border-neutral-200 p-4 bg-white">
      <h3 className="font-semibold mb-3">Assistant de prompt</h3>
      {!selected && (
        <div className="mb-3 text-xs text-neutral-500">
          Aucune actualité sélectionnée — vous pouvez générer sans, mais la sortie sera plus générique.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3">
        <Input label="Marque / secteur" val={brand} set={setBrand} ph="Ex: Agence IA pour e-commerce" />
        <Input label="Audience visée" val={audience} set={setAudience} ph="Ex: Dir marketing retail, e-commerçants" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Objectif" val={objective} set={setObjective} ph="attirer des prospects" />
          <Input label="Ton" val={tone} set={setTone} ph="Convaincant, clair, pro" />
        </div>
        <Input label="Émotions à susciter" val={emotions} set={setEmotions} ph="Confiance, curiosité, désir…" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Douleurs (pain points)" val={painPoints} set={setPainPoints} ph="Perte de temps, coûts…" />
          <Input label="Propositions de valeur" val={valueProps} set={setValueProps} ph="Gains de temps, ROI…" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Offre" val={offer} set={setOffer} ph="Réduction, bonus…" />
          <Input label="Canaux" val={channels} set={setChannels} ph="LinkedIn, Instagram…" />
          <Input label="CTA" val={cta} set={setCta} ph="Demander une démo" />
        </div>
        <Input label="Hashtags" val={hashtags} set={setHashtags} ph="#AI #Keiro…" />
      </div>

      <div className="mt-4">
        <div className="text-xs text-neutral-500">Prompt généré (utilisé pour la génération) :</div>
        <textarea className="w-full h-[140px] rounded-md border border-neutral-300 px-3 py-2 text-sm"
          readOnly value={prompt}/>
        <div className="text-[11px] text-neutral-500 mt-2">
          Astuce: précise l’audience, la promesse, les preuves et l’émotion à provoquer — la génération sera beaucoup plus performante.
        </div>
      </div>
    </div>
  );
}
