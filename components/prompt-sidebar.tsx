"use client";
import * as React from "react";
import type { NewsItem } from "@/components/news-card";

export type PromptSidebarProps = {
  /** Actu cliquée via "Utiliser cette actu" pour pré-remplir les champs */
  seed?: NewsItem | null;
};

export default function PromptSidebar({ seed }: PromptSidebarProps) {
  const [brand, setBrand] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [tone, setTone] = React.useState("Percutant");
  const [colors, setColors] = React.useState("");
  const [cta, setCta] = React.useState("");
  const [hashtags, setHashtags] = React.useState("#AI #Marketing #Keiro");
  const [platform, setPlatform] = React.useState("Instagram");
  const [format, setFormat] = React.useState("Portrait (1080×1350)");
  const [lang, setLang] = React.useState("Français (FR)");
  const [logoName, setLogoName] = React.useState<string | null>(null);

  // Pré-remplissage quand on clique "Utiliser cette actu"
  React.useEffect(() => {
    if (!seed) return;
    const base = seed.title || "";
    setObjective((prev) => (prev ? prev : `Communiquer sur: ${base}`));
    // Ajoute quelques hashtags contextuels
    const moreTags = [
      seed.source?.replace(/\s+/g, ""),
      seed.hot ? "Trending" : "",
    ]
      .filter(Boolean)
      .map((t) => `#${t}`)
      .join(" ");
    setHashtags((h) => (h ? `${h} ${moreTags}`.trim() : moreTags));
  }, [seed]);

  const finalPrompt = React.useMemo(() => {
    const lines: string[] = [];
    if (brand) lines.push(`Marque / Produit: ${brand}`);
    if (objective) lines.push(`Objectif: ${objective}`);
    lines.push(`Plateforme: ${platform}`);
    lines.push(`Format: ${format}`);
    lines.push(`Langue: ${lang}`);
    if (tone) lines.push(`Tonalité / Style: ${tone}`);
    if (colors) lines.push(`Couleurs / Contraintes: ${colors}`);
    if (cta) lines.push(`Call to Action: ${cta}`);
    if (hashtags) lines.push(`Hashtags: ${hashtags}`);
    if (seed?.title) lines.push(`Actu choisie: ${seed.title}`);
    if (seed?.url) lines.push(`Source: ${seed.url}`);
    return lines.join("\n");
  }, [brand, objective, tone, colors, cta, hashtags, platform, format, lang, seed]);

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setLogoName(f ? f.name : null);
  }

  function handleGenerate(kind: "image" | "video") {
    // Ici on pourrait appeler une API: /api/generate-image ou /api/generate-video
    console.log(`Générer ${kind}`, { finalPrompt, logoName });
    alert(`(${kind.toUpperCase()})\n\n${finalPrompt}`);
  }

  return (
    <aside className="w-full max-w-[360px] shrink-0">
      {/* Bloc logo */}
      <div className="mb-4 rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-2 font-medium">Sélectionner un logo</div>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
            Choisir un fichier
            <input type="file" className="hidden" onChange={onLogoChange} />
          </label>
          <div className="text-sm text-gray-500">
            {logoName ? logoName : "Aucun fichier choisi"}
          </div>
        </div>
      </div>

      {/* Assistant de prompt */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 font-semibold">Assistant de prompt</div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-gray-700">Marque / Produit</label>
          <input
            className="h-9 w-full rounded-md border px-2 text-sm"
            placeholder="ex: Keiro / Keiro AI Studio"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-gray-700">Objectif</label>
          <textarea
            className="w-full rounded-md border px-2 py-2 text-sm"
            placeholder="ex: Annoncer une nouvelle fonctionnalité, attirer des leads…"
            rows={3}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-gray-700">Tonalité / Style</label>
          <select
            className="h-9 w-full rounded-md border px-2 text-sm"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            <option>Percutant</option>
            <option>Amical</option>
            <option>Premium</option>
            <option>Institutionnel</option>
          </select>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-gray-700">Couleurs / Contraintes</label>
          <input
            className="h-9 w-full rounded-md border px-2 text-sm"
            placeholder="ex: Noir, or, #111, pas de fond blanc…"
            value={colors}
            onChange={(e) => setColors(e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-gray-700">Call to Action</label>
          <input
            className="h-9 w-full rounded-md border px-2 text-sm"
            placeholder="ex: Découvrir, S’inscrire, Essayer maintenant…"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-gray-700">Hashtags</label>
          <input
            className="h-9 w-full rounded-md border px-2 text-sm"
            placeholder="#AI #Marketing #Keiro"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
          />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm text-gray-700">Plateforme</label>
            <select
              className="h-9 w-full rounded-md border px-2 text-sm"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option>Instagram</option>
              <option>LinkedIn</option>
              <option>Facebook</option>
              <option>X</option>
              <option>TikTok</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-700">Format</label>
            <select
              className="h-9 w-full rounded-md border px-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option>Portrait (1080×1350)</option>
              <option>Carré (1080×1080)</option>
              <option>Vertical (1080×1920)</option>
              <option>Paysage (1920×1080)</option>
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-gray-700">Langages</label>
          <select
            className="h-9 w-full rounded-md border px-2 text-sm"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option>Français (FR)</option>
            <option>English (EN)</option>
          </select>
        </div>

        <div className="mb-3">
          <div className="mb-1 text-sm text-gray-700">Prompt final</div>
          <textarea
            readOnly
            className="h-36 w-full cursor-text rounded-md border px-2 py-2 text-sm"
            value={finalPrompt}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-2 text-xs text-gray-500">
            Style/tonalité: premium — Sortie attendue: visuel social percutant, prêt à poster.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGenerate("image")}
            className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/90"
          >
            Générer une image
          </button>
          <button
            onClick={() => handleGenerate("video")}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            Générer une vidéo
          </button>
        </div>
      </div>
    </aside>
  );
}
