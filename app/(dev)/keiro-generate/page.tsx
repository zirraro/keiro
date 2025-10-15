"use client";
import React, { useEffect, useRef, useState } from "react";

/**
 * Keiro Generate & Edit (page)
 * - Utilise les routes publiques existantes:
 *   POST /api/generate/image   (JSON)
 *   POST /api/edit/image       (JSON ou multipart)
 *   GET  /api/capabilities     (optionnel; active l'UI d'édition)
 * - Mono-port 3006; URLs d'images proxifiées via /api/proxy
 */

export default function KeiroGenerateEditor() {
  const [brand, setBrand] = useState("Keiro");
  const [goal, setGoal] = useState("notoriété");
  const [tone, setTone] = useState("moderne");
  const [constraints, setConstraints] = useState("brand colors");
  const [newsTitle, setNewsTitle] = useState("");
  const [cta, setCta] = useState("Découvrir");
  const [references, setReferences] = useState<string>("");

  const [loadingGen, setLoadingGen] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  const [canEdit, setCanEdit] = useState<boolean>(true); // confirmé par /api/capabilities

  // EDIT
  const [instruction, setInstruction] = useState("");
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const maskInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Découverte des capacités (optionnel)
    fetch("/api/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.editing === "boolean") setCanEdit(j.editing);
      })
      .catch(() => {});
  }, []);

  async function onGenerate() {
    setError(null);
    setLoadingGen(true);
    setImageUrl(null);
    setEditToken(null);

    try {
      const refs = references
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        brand,
        goal,
        tone,
        constraints,
        newsTitle,
        cta,
        references: refs,
      };

      const r = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Generation failed");

      // { kind:"image", url:"/api/proxy?u=...", token? }
      setImageUrl(j.url || null);
      setEditToken(j.token || null);

      if (j.prompt) setLastPrompt(j.prompt); // si renvoyé par l'interne
    } catch (e: any) {
      setError(e?.message || "Erreur inconnue");
    } finally {
      setLoadingGen(false);
    }
  }

  function onPickMask() {
    maskInputRef.current?.click();
  }

  function onMaskFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setMaskFile(f);
  }

  async function onEdit() {
    setError(null);
    if (!canEdit) {
      setError("L’édition n’est pas disponible avec le provider actuel.");
      return;
    }
    if (!editToken) {
      setError("Aucun token d’édition (génère d’abord une image).");
      return;
    }
    if (!instruction && !maskFile) {
      setError("Indique une instruction et/ou fournis un masque.");
      return;
    }

    setLoadingEdit(true);
    try {
      let r: Response;
      if (maskFile) {
        const fd = new FormData();
        fd.append("token", editToken);
        fd.append("instruction", instruction || "Refine details");
        fd.append("mask", maskFile);
        r = await fetch("/api/edit/image", { method: "POST", body: fd });
      } else {
        r = await fetch("/api/edit/image", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: editToken, instruction }),
        });
      }

      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "Edition failed");

      setImageUrl(j.url || null);
    } catch (e: any) {
      setError(e?.message || "Erreur édition");
    } finally {
      setLoadingEdit(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Keiro • Génération & Édition</h1>
        <div className="text-sm opacity-70">Mono-port · URLs proxifiées</div>
      </header>

      {/* GENERATE */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-1 text-sm">
              <span className="block mb-1">Marque</span>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="Keiro"
              />
            </label>
            <label className="col-span-1 text-sm">
              <span className="block mb-1">Objectif</span>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="notoriété"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-1 text-sm">
              <span className="block mb-1">Ton</span>
              <input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="moderne | luxe | futuriste"
              />
            </label>
            <label className="col-span-1 text-sm">
              <span className="block mb-1">Contraintes</span>
              <input
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="brand colors, no text in image"
              />
            </label>
          </div>

          <label className="text-sm">
            <span className="block mb-1">Actualité / Titre (optionnel)</span>
            <input
              value={newsTitle}
              onChange={(e) => setNewsTitle(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Nvidia domine l’IA"
            />
          </label>

          <label className="text-sm">
            <span className="block mb-1">CTA (optionnel)</span>
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Découvrir"
            />
          </label>

          <label className="text-sm">
            <span className="block mb-1">
              Références (URLs, séparées par virgule / retour ligne)
            </span>
            <textarea
              value={references}
              onChange={(e) => setReferences(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 h-24"
              placeholder="https://…\nhttps://…"
            />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onGenerate}
              disabled={loadingGen}
              className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
            >
              {loadingGen ? "Génération…" : "Générer l’image"}
            </button>
            {lastPrompt && (
              <details className="text-sm opacity-80 cursor-pointer">
                <summary className="select-none">Voir le prompt</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded-xl border max-h-40 overflow-auto">
                  {lastPrompt}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* PREVIEW */}
        <div className="border rounded-2xl p-3 min-h-[320px] flex items-center justify-center bg-white">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="preview"
              className="max-h-[520px] object-contain rounded-xl"
            />
          ) : (
            <div className="text-gray-500 text-sm">Aucun aperçu pour le moment</div>
          )}
        </div>
      </section>

      {/* EDIT */}
      <section className="space-y-3 border rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Édition</h2>
          <div className={`text-xs ${canEdit ? "text-emerald-600" : "text-amber-600"}`}>
            {canEdit ? "Provider: édition disponible" : "Provider: édition non disponible"}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="block mb-1">Instruction</span>
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Replace background with modern urban skyline at dusk"
            />
          </label>
          <div className="text-sm">
            <span className="block mb-1">Masque (PNG, blanc = zone à modifier)</span>
            <div className="flex items-center gap-3">
              <button onClick={onPickMask} className="px-3 py-2 rounded-xl border">
                Choisir un fichier
              </button>
              <span className="opacity-70 text-xs truncate max-w-[260px]">
                {maskFile ? maskFile.name : "Aucun fichier"}
              </span>
            </div>
            <input
              ref={maskInputRef}
              type="file"
              accept="image/png"
              onChange={onMaskFile}
              className="hidden"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onEdit}
            disabled={!canEdit || loadingEdit}
            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
          >
            {loadingEdit ? "Application…" : "Appliquer l’édition"}
          </button>
          {editToken ? (
            <span className="text-xs opacity-70">Token: {short(editToken)}</span>
          ) : (
            <span className="text-xs opacity-70">
              (Génère une image pour obtenir un token d’édition)
            </span>
          )}
        </div>
      </section>

      {error && (
        <div className="p-3 rounded-xl border bg-amber-50 text-amber-900 text-sm">
          {error}
        </div>
      )}

      <footer className="text-xs opacity-60">
        <p>
          Astuce: en dev, <code>ADMIN_DEBUG=1</code> peut exposer des en-têtes{" "}
          <code>x-*</code> (backend, coût estimé, etc.).
        </p>
      </footer>
    </div>
  );
}

function short(s: string) {
  if (!s) return "";
  return s.length > 16 ? s.slice(0, 6) + "…" + s.slice(-6) : s;
}
