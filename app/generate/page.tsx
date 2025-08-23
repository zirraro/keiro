'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

type Objective = 'promo' | 'event' | 'leads';
type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'x';
type Media = 'image' | 'video';

export default function GeneratePage() {
  const [step, setStep] = useState<1|2|3>(1);
  const [media, setMedia] = useState<Media>('image');

  const [platform, setPlatform] = useState<Platform>('instagram');
  const [objective, setObjective] = useState<Objective>('promo');
  const [sector, setSector] = useState('restaurant');
  const [context, setContext] = useState('Canicule');
  const [highlight, setHighlight] = useState('Nouveautés d’été');
  const [headline, setHeadline] = useState('À ne pas manquer');
  const [cta, setCta] = useState('Découvrir');
  const [brandColor, setBrandColor] = useState('#2b82f6');
  const [variants, setVariants] = useState<1|3>(1);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const aspect: '9:16'|'1:1'|'16:9' =
    platform === 'instagram' ? '1:1' :
    platform === 'tiktok'    ? '9:16' :
    platform === 'facebook'  ? '1:1' :
    platform === 'linkedin'  ? '16:9' : '16:9';

  async function onGenerate() {
    setLoading(true);
    setImages([]);
    setVideoUrl(null);

    // Prompt simple (tu pourras le pimenter ensuite avec plus de contexte)
    const prompt = [
      `Secteur: ${sector}`,
      `Contexte: ${context}`,
      `Mise en avant: ${highlight}`,
      `Accroche: "${headline}"`,
      `CTA: "${cta}"`,
      `Couleur: ${brandColor}`,
      `Plateforme: ${platform} (aspect ${aspect})`
    ].join(' | ');

    try {
      if (media === 'image') {
        // On réutilise ton endpoint image existant
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sector, context, offer: highlight, headline, cta,
            meta: { objective, brandColor, platform, aspect },
            variants,
          }),
        });
        const json = await res.json();
        if (json?.images) {
          setImages(json.images);
          setStep(3);
        } else {
          alert(json?.error || json?.details || 'Erreur API (image)');
        }
      } else {
        // Vidéo: nouvel endpoint
        const res = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            seconds: 3,     // MVP : court
            aspect,         // 9:16 / 1:1 / 16:9
          }),
        });
        const json = await res.json();
        if (json?.video) {
          setVideoUrl(json.video as string);
          setStep(3);
        } else {
          alert(json?.error || 'Erreur API (video)');
        }
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || 'Erreur réseau';
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative z-10 min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Créer un visuel</h1>

        {/* Stepper simple */}
        <div className="flex items-center gap-2 text-sm">
          {[1,2,3].map(n => (
            <div key={n} className={`px-3 py-1 rounded-full border ${step===n ? 'bg-white text-black' : 'border-neutral-700 text-neutral-300'}`}>
              Étape {n}
            </div>
          ))}
        </div>

        {/* Barre Media */}
        <div className="flex gap-2">
          {(['image','video'] as Media[]).map(m => (
            <Button
              key={m}
              type="button"
              variant={media===m ? 'primary' : 'outline'}
              onClick={()=>setMedia(m)}
            >
              {m === 'image' ? 'Image' : 'Vidéo (beta)'}
            </Button>
          ))}
        </div>

        {/* Étape 1 */}
        {step===1 && (
          <div className="space-y-4 border border-neutral-800 rounded-lg p-4">
            <div>
              <div className="text-sm text-neutral-300 mb-2">Plateforme</div>
              <div className="grid grid-cols-5 gap-2">
                {(['instagram','tiktok','facebook','linkedin','x'] as Platform[]).map(p => (
                  <Button
                    key={p}
                    type="button"
                    variant={platform===p ? 'primary' : 'outline'}
                    onClick={()=>setPlatform(p)}
                    className="w-full"
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-neutral-500 mt-1">Format adapté automatiquement ({aspect}).</p>
            </div>

            <div>
              <div className="text-sm text-neutral-300 mb-2">Objectif</div>
              <div className="grid grid-cols-3 gap-2">
                {(['promo','event','leads'] as Objective[]).map(o => (
                  <Button
                    key={o}
                    type="button"
                    variant={objective===o ? 'primary' : 'outline'}
                    onClick={()=>{
                      setObjective(o);
                      setHeadline(o==='promo'?'À ne pas manquer': o==='event'?'C’est maintenant':'On vous écoute');
                      setCta(o==='promo'?'Découvrir': o==='event'?'Réserver':'Contact');
                    }}
                    className="w-full"
                  >
                    {o === 'promo' ? 'Mise en avant' : o === 'event' ? 'Événement' : 'Leads'}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Button type="button" onClick={()=>setStep(2)}>
                Continuer
              </Button>
            </div>
          </div>
        )}

        {/* Étape 2 */}
        {step===2 && (
          <div className="space-y-4 border border-neutral-800 rounded-lg p-4">
            <div>
              <div className="text-sm text-neutral-300 mb-1">Secteur</div>
              <Input value={sector} onChange={(e)=>setSector(e.target.value)} placeholder="restaurant, café, e‑commerce…" />
            </div>
            <div>
              <div className="text-sm text-neutral-300 mb-1">Contexte (actualité)</div>
              <Input value={context} onChange={(e)=>setContext(e.target.value)} placeholder='Ex: "canicule", "rentrée", "Black Friday"…' />
            </div>
            <div>
              <div className="text-sm text-neutral-300 mb-1">Mise en avant</div>
              <Input value={highlight} onChange={(e)=>setHighlight(e.target.value)} placeholder='Ex: "Nouvelle terrasse"' />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-sm text-neutral-300 mb-1">Accroche</div>
                <Input value={headline} onChange={(e)=>setHeadline(e.target.value)} placeholder='Ex: "On se rafraîchit ?"' />
              </div>
              <div>
                <div className="text-sm text-neutral-300 mb-1">CTA</div>
                <Input value={cta} onChange={(e)=>setCta(e.target.value)} placeholder='Ex: "Réserver", "Découvrir"' />
              </div>
            </div>

            {/* Couleur / Variantes (variantes ignorées si vidéo) */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-sm text-neutral-300 mb-1">Couleur de marque</div>
                <div className="flex items-center gap-3">
                  <input type="color" value={brandColor} onChange={(e)=>setBrandColor(e.target.value)} className="w-12 h-10 bg-neutral-900 border border-neutral-700 rounded"/>
                  <Input value={brandColor} onChange={(e)=>setBrandColor(e.target.value)} />
                </div>
              </div>
              {media === 'image' && (
                <div>
                  <div className="text-sm text-neutral-300 mb-1">Variantes</div>
                  <div className="flex gap-2">
                    {[1,3].map(n=>(
                      <Button key={n} type="button" variant={variants===n ? 'primary':'outline'} onClick={()=>setVariants(n as 1|3)}>
                        {n}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">3 variantes = 3 crédits IA.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" onClick={()=>setStep(1)}>
                ← Retour
              </Button>
              <Button type="button" onClick={onGenerate} disabled={loading}>
                {loading ? (media==='video' ? 'Rendu vidéo…' : 'Génération…') : (media==='video' ? 'Générer la vidéo' : 'Générer')}
              </Button>
            </div>
          </div>
        )}

        {/* Étape 3 */}
        {step===3 && (
          <div className="space-y-4 border border-neutral-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold">Résultats</h2>

            {loading ? (
              <div className="text-neutral-400">{media==='video' ? 'Rendu vidéo en cours…' : 'Préparation…'}</div>
            ) : media === 'image' ? (
              images.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {images.map((src, i) => (
                    <div key={i} className="rounded overflow-hidden border border-neutral-800">
                      <img src={src} alt={"gen-"+i} className="w-full h-auto"/>
                      <div className="p-3 text-sm flex gap-4">
                        <a href={src} download={`keiro-${i+1}.png`} className="underline">Télécharger</a>
                        <Button type="button" variant="outline" onClick={()=>navigator.clipboard.writeText(src)} className="px-2 py-1 h-auto">
                          Copier l’URL
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-neutral-400">Aucune image pour le moment.</div>
              )
            ) : (
              videoUrl ? (
                <div className="rounded overflow-hidden border border-neutral-800">
                  <video src={videoUrl} controls playsInline className="w-full h-auto" />
                  <div className="p-3 text-sm flex gap-4">
                    <a href={videoUrl} download="keiro.mp4" className="underline">Télécharger</a>
                    <Button type="button" variant="outline" onClick={()=>navigator.clipboard.writeText(videoUrl)} className="px-2 py-1 h-auto">
                      Copier l’URL
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-neutral-400">Aucune vidéo pour le moment.</div>
              )
            )}

            <div>
              <Button type="button" variant="outline" onClick={()=>{ setStep(1); setImages([]); setVideoUrl(null); }}>
                Recommencer
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
