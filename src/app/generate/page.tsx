'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/* ---------------- Types ---------------- */
type Card = {
  id: string;
  title: string;
  description: string;
  url: string;
  image?: string;
  source?: string;
  date?: string;
  category?: string;
};

const CATEGORIES = [
  'À la une','Politique','Économie','Business','Sport','People','Santé',
  'Restauration','Tech','Culture','Monde','Auto','Climat','Immo','Lifestyle','Gaming'
];

/* --------- Utilitaire de “polissage” du texte --------- */
function polish(raw: string) {
  if (!raw) return '';
  let t = raw
    .replace(/\s+/g, ' ')
    .replace(/"([^"]*)"/g, '« $1 »')
    .replace(/'/g, '’')
    .replace(/\s*([?!;:»])/g, ' $1')
    .replace(/«\s*/g, '« ')
    .replace(/\s*»/g, ' »')
    .trim();

  t = t.replace(/(^|[.!?]\s+)([a-zàâçéèêëîïôûùüÿœ])/g, (m, p1, p2) => p1 + p2.toUpperCase());
  if (!/[.!?…]$/.test(t)) t += '.';
  return t;
}

/* --------- Petit composant Multi-select en déroulé --------- */
function DropdownMulti({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  }
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full rounded-xl border px-3 py-2 text-left bg-white hover:bg-neutral-50"
        aria-expanded={open}
      >
        <div className="text-sm text-neutral-600">{label}</div>
        <div className="text-sm mt-1 line-clamp-1">
          {value.length ? value.join(' · ') : 'Choisir… (multi)'}
        </div>
      </button>
      {open && (
        <div className="mt-2 rounded-xl border p-3 bg-white max-h-56 overflow-auto">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onChange([])}
              className="px-2 py-1 rounded-lg border text-sm"
            >
              Effacer
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1 rounded-lg border text-sm"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Page principale ---------------- */
export default function GeneratePage(){
  /* --- Actus --- */
  const [category, setCategory] = useState<string>('Tech');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(9);
  const canLoadMore = useMemo(()=> items.length > visible, [items, visible]);
  const visibleItems = useMemo(()=> items.slice(0, visible), [items, visible]);
  const [selected, setSelected] = useState<Card | null>(null);

  /* --- Upload optionnel (bloc pointillé séparé) --- */
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* --- Assistant --- */
  const [platform, setPlatform] = useState('LinkedIn');
  const [goal, setGoal] = useState('Annoncer une actualité');
  const [tone, setTone] = useState('Premium et clair');
  const [pov, setPov] = useState('Plan large cinématographique');
  const [audience, setAudience] = useState('');
  const [cta, setCta] = useState('');
  const [brand, setBrand] = useState('');

  const [palette, setPalette] = useState('Couleurs sobres (bleu, anthracite, blanc)');
  const [lighting, setLighting] = useState('Lumière douce et naturelle');
  const [styleKind, setStyleKind] = useState('Photographique réaliste');

  const [storyHook, setStoryHook] = useState('Mettre en avant le bénéfice concret pour le client');

  // ⚠️ NOUVEAU — Business à promouvoir (obligatoire)
  const [businessType, setBusinessType] = useState('');

  // Multi (en déroulé)
  const [inspirations, setInspirations] = useState<string[]>([
    'Ambiance éditoriale sobre',
    'Reflets dorés très discrets',
  ]);
  const [donots, setDonots] = useState<string[]>([
    'Pas de logo de réseau social',
    'Pas de watermark',
    'Pas de texte illisible',
  ]);

  const [freeText, setFreeText] = useState('');
  const [typoUse, setTypoUse] = useState('Sans texte (visuel seul)');
  const [layoutGuide, setLayoutGuide] = useState('Composition claire, sujet principal bien détaché du fond');

  /* --- Génération --- */
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genUrl, setGenUrl] = useState<string | null>(null);

  /* --- Fetch actus via API interne (cache 24h côté route) --- */
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(()=>{
    setVisible(9);
    fetchNews(category, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  async function fetchNews(cat: string, query: string){
    try{
      setLoading(true);
      setError(null);
      setSelected(null);
      const url = `/api/news?cat=${encodeURIComponent(cat)}&q=${encodeURIComponent(query || '')}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || 'NEWS_ERROR');
      setItems(j.items || []);
    }catch(e:any){
      console.error('fetchNews error', e);
      setError('Impossible de récupérer les actualités pour le moment.');
      setItems([]);
    }finally{
      setLoading(false);
    }
  }

  function onSearchChange(v: string){
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(()=> fetchNews(category, v), 350);
  }

  /* --- Upload helpers --- */
  async function dataUrlFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }
  async function handleFiles(files: FileList | null){
    if (!files || !files[0]) return;
    try{
      setUploading(true);
      const dataUrl = await dataUrlFromFile(files[0]);
      const r = await fetch('/api/tmp/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl })
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'UPLOAD_FAIL');
      setLogoUrl(j.url);
    }catch(e){
      alert('Échec de l’upload du logo/photo.');
      console.error(e);
    }finally{
      setUploading(false);
    }
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>){
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }
  function onBrowse(){
    fileInputRef.current?.click();
  }

  /* --- Brief lisible --- */
  const humanBrief = useMemo(()=>{
    const parts: string[] = [];
    if (selected){
      parts.push(
        `Contexte de l’actualité: ${polish(`${selected.title} (${selected.source || 'source inconnue'}, ${selected.date?.slice(0,10) || 'date inconnue'})`)}`,
        selected.description ? `Résumé: ${polish(selected.description)}` : ''
      );
    }
    parts.push(
      `Type d’activité à promouvoir: ${polish(businessType || 'non spécifié')}`,
      `Objectif: ${polish(goal)}`,
      `Plateforme: ${platform}`,
      `Tonalité: ${tone}`,
      `Point de vue: ${pov}`,
      `Palette: ${palette}`,
      `Lumière: ${lighting}`,
      `Style: ${styleKind}`,
      layoutGuide ? `Mise en page: ${layoutGuide}` : ''
    );
    if (audience) parts.push(`Audience: ${polish(audience)}`);
    if (brand) parts.push(`Marque: ${polish(brand)}`);
    if (cta) parts.push(`CTA: ${polish(cta)}`);
    if (typoUse) parts.push(`Texte: ${typoUse}`);
    if (inspirations.length) parts.push(`Inspirations: ${inspirations.map(polish).join(' · ')}`);
    if (logoUrl) parts.push(`Élément à intégrer avec discrétion: logo/photo (${logoUrl})`);
    if (donots.length) parts.push(`À éviter: ${donots.join(' · ')}`);
    if (freeText) parts.push(`Détails complémentaires: ${polish(freeText)}`);

    parts.push(`Clarté: phrases courtes, pas de jargon inutile.`);
    return parts.filter(Boolean).join('\n');
  }, [
    selected, businessType, goal, platform, tone, pov, palette, lighting, styleKind,
    layoutGuide, audience, brand, cta, typoUse, inspirations, logoUrl, donots, freeText
  ]);

  /* --- Prompt Seedream (impose le lien actu ↔ business) --- */
  const finalPrompt = useMemo(()=>{
    const mustAvoid = [
      'logo LinkedIn', 'logo Instagram', 'logo Facebook', 'logo X',
      'watermark', 'texte minuscule illisible', 'mèmes', 'copyright'
    ];
    const linkBlock = selected
      ? `Relier explicitement le visuel à l’actualité sélectionnée (« ${polish(selected.title)} ») ET au type d’activité indiqué (« ${polish(businessType || 'non spécifié')} »). Illustrer ce lien de manière claire et compréhensible pour le public visé.`
      : `Même sans actualité sélectionnée, adapter le visuel au type d’activité indiqué (« ${polish(businessType || 'non spécifié')} ») et à l’objectif.`;

    const base = [
      'Génère un visuel propre, crédible et professionnel pour réseaux sociaux.',
      linkBlock,
      'Soin des détails: éclairage cohérent, couleurs harmonisées, pas d’artefacts IA.',
      'Hiérarchie claire, sujet principal mis en valeur.',
      `Évite absolument: ${[...new Set([...donots, ...mustAvoid])].join(', ')}.`,
    ];
    if (logoUrl) base.push('Si possible, intégrer le logo/photo fourni de manière subtile (coin inférieur droit), sans dégrader la lisibilité.');
    if (typoUse === 'Titre court lisible') {
      base.push('Autoriser un titre court, gros et lisible, en surimpression seulement si ça sert l’idée.');
    } else {
      base.push('Privilégier une image sans texte intégré.');
    }
    return [
      humanBrief,
      '',
      base.map(polish).join('\n')
    ].join('\n\n');
  }, [humanBrief, donots, logoUrl, typoUse, selected, businessType]);

  async function onGenerate(){
    try{
      if (!businessType.trim()) {
        alert('Indique d’abord le type d’activité / business à promouvoir.');
        return;
      }
      if (!selected) {
        alert('Sélectionne une actualité à gauche pour contextualiser le visuel.');
        return;
      }
      setGenLoading(true);
      setGenError(null);
      setGenUrl(null);

      const r = await fetch('/api/ark-generate', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          platform
        })
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || 'GEN_FAIL');
      }
      setGenUrl(j.url || null);
    }catch(e:any){
      console.error('generate error', e);
      setGenError('La génération a échoué. Réessaie en ajustant le brief.');
    }finally{
      setGenLoading(false);
    }
  }

  /* ------------------------ UI ------------------------ */
  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-6">
        {/* --------- COLONNE GAUCHE: Catégorie + Recherche + Cartes --------- */}
        <section>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-600">Catégorie</label>
              <select
                value={category}
                onChange={e=>setCategory(e.target.value)}
                className="rounded-xl border px-3 py-2"
              >
                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="min-w-[260px] max-w-[540px] flex-1">
              <input
                value={q}
                onChange={e=>onSearchChange(e.target.value)}
                placeholder="Rechercher une actu précise…"
                className="w-full rounded-xl border px-4 py-2"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border p-4 text-red-600 bg-red-50 mb-4">
              {error}
            </div>
          )}

          {loading && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({length:9}).map((_,i)=>(
                <div key={i} className="rounded-2xl border bg-white h-64 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && !error && (
            <>
              {visibleItems.length === 0 ? (
                <div className="rounded-xl border p-8 text-neutral-500">
                  Aucune actualité trouvée pour “{category}”.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {visibleItems.map(card=>(
                    <article
                      key={card.id}
                      className={`rounded-2xl border bg-white overflow-hidden shadow-sm flex flex-col ${selected?.id===card.id ? 'ring-2 ring-black' : ''}`}
                    >
                      {card.image ? (
                        <img src={card.image} alt="" className="w-full h-40 object-cover" />
                      ) : (
                        <div className="h-40 bg-neutral-100" />
                      )}
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="text-xs text-neutral-500">{card.source} · {card.date?.slice(0,10)}</div>
                        <h3 className="mt-1 font-medium line-clamp-2">{card.title}</h3>
                        <p className="text-sm text-neutral-600 line-clamp-3 mt-1">{card.description}</p>
                        <div className="mt-auto flex items-center justify-between pt-3">
                          <a href={card.url} target="_blank" className="text-sm text-neutral-500 hover:underline">Voir la source</a>
                          <button
                            className="px-3 py-2 rounded-lg bg-black text-white"
                            onClick={()=> setSelected(card)}
                          >
                            Sélectionner
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {canLoadMore && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={()=>setVisible(v => v + 3)}
                    className="px-4 py-2 rounded-xl border bg-white hover:bg-neutral-50"
                  >
                    + 3 actus
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* --------- COLONNE DROITE: Upload détaché + Assistant --------- */}
        <aside className="space-y-4">
          {/* Zone pointillée d’upload — séparée, au-dessus de l’assistant */}
          <div
            onDragOver={e=>e.preventDefault()}
            onDrop={onDrop}
            className="rounded-2xl border-2 border-dashed p-4 text-center bg-white"
          >
            <div className="font-medium">Ajouter un logo / une photo (optionnel)</div>
            <div className="text-sm text-neutral-500 mt-1">Glisser-déposer un fichier, ou</div>
            <div className="mt-2">
              <button
                onClick={onBrowse}
                disabled={uploading}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-neutral-50 disabled:opacity-50"
              >
                Parcourir…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e=>handleFiles(e.target.files)}
              />
            </div>
            {uploading && <div className="text-sm text-neutral-500 mt-2">Upload…</div>}
            {logoUrl && (
              <div className="mt-3 flex items-center justify-center">
                <img src={logoUrl} alt="upload" className="max-h-28 rounded-lg border" />
              </div>
            )}
          </div>

          {/* Assistant marketing + copywriting */}
          <div className="rounded-2xl border bg-white p-4">
            <h2 className="text-lg font-semibold">Assistant de prompt</h2>

            {/* Contexte sélection */}
            <div className="mt-3 rounded-xl border p-3 bg-neutral-50">
              <div className="text-sm text-neutral-600">Actualité sélectionnée</div>
              {selected ? (
                <>
                  <div className="mt-1 font-medium line-clamp-2">{selected.title}</div>
                  <div className="text-xs text-neutral-500">{selected.source} · {selected.date?.slice(0,10)}</div>
                </>
              ) : (
                <div className="text-sm text-neutral-500">Sélectionne une carte à gauche pour l’inclure automatiquement.</div>
              )}
            </div>

            {/* Business — obligatoire */}
            <div className="mt-3">
              <label className="text-sm text-neutral-600">Type d’activité / business à promouvoir (obligatoire)</label>
              <input
                className="w-full rounded-xl border px-3 py-2 mt-1"
                value={businessType}
                onChange={e=>setBusinessType(e.target.value)}
                placeholder="Ex: restaurant italien premium, cabinet de conseil B2B, boutique e-commerce mode…"
              />
            </div>

            {/* Sélecteurs simples */}
            <div className="grid grid-cols-1 gap-3 mt-3">
              <div>
                <label className="text-sm text-neutral-600">Plateforme</label>
                <select className="w-full rounded-xl border px-3 py-2" value={platform} onChange={e=>setPlatform(e.target.value)}>
                  <option>LinkedIn</option>
                  <option>Instagram</option>
                  <option>Facebook</option>
                  <option>X</option>
                  <option>Story</option>
                  <option>TikTok</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Objectif</label>
                <select className="w-full rounded-xl border px-3 py-2" value={goal} onChange={e=>setGoal(e.target.value)}>
                  <option>Annoncer une actualité</option>
                  <option>Créer une image publicitaire</option>
                  <option>Illustrer un fait / un chiffre</option>
                  <option>Teaser un produit / une offre</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Tonalité</label>
                <select className="w-full rounded-xl border px-3 py-2" value={tone} onChange={e=>setTone(e.target.value)}>
                  <option>Premium et clair</option>
                  <option>Énergique et moderne</option>
                  <option>Éditorial et sérieux</option>
                  <option>Minimaliste</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Point de vue</label>
                <select className="w-full rounded-xl border px-3 py-2" value={pov} onChange={e=>setPov(e.target.value)}>
                  <option>Plan large cinématographique</option>
                  <option>Contre-plongée héroïque</option>
                  <option>Plongée</option>
                  <option>Macro détaillée</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Palette de couleurs</label>
                <select className="w-full rounded-xl border px-3 py-2" value={palette} onChange={e=>setPalette(e.target.value)}>
                  <option>Couleurs sobres (bleu, anthracite, blanc)</option>
                  <option>Contrastes forts (noir & blanc marqué)</option>
                  <option>Tons chauds (or, ambre, crème)</option>
                  <option>Palette pop (vives et saturées)</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Lumière / ambiance</label>
                <select className="w-full rounded-xl border px-3 py-2" value={lighting} onChange={e=>setLighting(e.target.value)}>
                  <option>Lumière douce et naturelle</option>
                  <option>Éclairage studio net</option>
                  <option>Golden hour (chaleureuse)</option>
                  <option>Ambiance nocturne néons</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Style</label>
                <select className="w-full rounded-xl border px-3 py-2" value={styleKind} onChange={e=>setStyleKind(e.target.value)}>
                  <option>Photographique réaliste</option>
                  <option>Illustration vectorielle</option>
                  <option>Collage graphique</option>
                  <option>3D / rendu propre</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Angle (story)</label>
                <select className="w-full rounded-xl border px-3 py-2" value={storyHook} onChange={e=>setStoryHook(e.target.value)}>
                  <option>Mettre en avant le bénéfice concret pour le client</option>
                  <option>Insister sur l’impact (avant/après)</option>
                  <option>Valoriser l’innovation / expertise</option>
                  <option>Créer de la curiosité (teaser)</option>
                </select>
              </div>

              {/* Multi en déroulé */}
              <DropdownMulti
                label="Inspirations (multi)"
                options={[
                  'Ambiance éditoriale sobre',
                  'Reflets dorés très discrets',
                  'Texture papier / grain fin',
                  'Transitions douces (bokeh)',
                  'Traitements monochromes élégants',
                  'Lignes géométriques nettes',
                  'Touches organiques (plantes, matières)'
                ]}
                value={inspirations}
                onChange={setInspirations}
              />

              <DropdownMulti
                label="À éviter (multi)"
                options={[
                  'Pas de logo de réseau social',
                  'Pas de watermark',
                  'Pas de texte illisible',
                  'Éviter les montages trop kitsch',
                  'Pas de clichés stéréotypés',
                  'Éviter les images trop sombres',
                ]}
                value={donots}
                onChange={setDonots}
              />

              <div>
                <label className="text-sm text-neutral-600">Texte dans l’image</label>
                <select className="w-full rounded-xl border px-3 py-2" value={typoUse} onChange={e=>setTypoUse(e.target.value)}>
                  <option>Sans texte (visuel seul)</option>
                  <option>Titre court lisible</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Mise en page</label>
                <select className="w-full rounded-xl border px-3 py-2" value={layoutGuide} onChange={e=>setLayoutGuide(e.target.value)}>
                  <option>Composition claire, sujet principal bien détaché du fond</option>
                  <option>Zone de respiration autour du sujet</option>
                  <option>Grille soignée, alignements précis</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-neutral-600">Détails complémentaires (optionnel)</label>
                <textarea className="w-full h-24 rounded-xl border p-3" value={freeText} onChange={e=>setFreeText(e.target.value)} placeholder="Contraintes précises, éléments à inclure / exclure…" />
              </div>

              {/* Brief & prompt */}
              <div>
                <label className="text-sm text-neutral-600">Brief (lisible)</label>
                <textarea className="w-full h-28 rounded-xl border p-3" value={humanBrief} readOnly />
              </div>
              <div>
                <label className="text-sm text-neutral-600">Prompt final (optimisé Seedream)</label>
                <textarea className="w-full h-36 rounded-xl border p-3" value={finalPrompt} readOnly />
              </div>

              <button
                onClick={onGenerate}
                disabled={genLoading || !selected || !businessType.trim()}
                className="w-full rounded-xl bg-black text-white px-4 py-3 disabled:opacity-50"
              >
                {genLoading ? 'Génération…' : 'Créer un visuel'}
              </button>

              {genError && <div className="text-red-600 text-sm">{genError}</div>}
              {genUrl && (
                <div className="space-y-2">
                  <div className="text-sm text-neutral-600">Résultat</div>
                  <img src={genUrl} alt="Résultat" className="w-full rounded-xl border" />
                  <a
                    href={`/editor?src=${encodeURIComponent(genUrl)}`}
                    className="inline-block px-4 py-2 rounded-xl border bg-white hover:bg-neutral-50"
                  >
                    Éditer ce visuel
                  </a>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
