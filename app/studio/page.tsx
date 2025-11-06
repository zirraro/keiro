"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function StudioPage() {
  const searchParams = useSearchParams();
  const [imageUrl, setImageUrl] = useState(searchParams.get("image") || "");
  const [loadedImage, setLoadedImage] = useState(searchParams.get("image") || "");
  const [editPrompt, setEditPrompt] = useState("");
  const [editingImage, setEditingImage] = useState(false);
  const [editedImages, setEditedImages] = useState<string[]>([]);

  const handleLoadImage = () => {
    if (!imageUrl.trim()) {
      alert("Veuillez entrer une URL d'image");
      return;
    }
    setLoadedImage(imageUrl);
  };

  const handleEdit = async () => {
    if (!editPrompt.trim()) {
      alert("Veuillez décrire vos modifications");
      return;
    }
    if (!loadedImage) {
      alert("Veuillez charger une image d'abord");
      return;
    }

    setEditingImage(true);
    try {
      const res = await fetch("/api/seedream/i2i", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: loadedImage,
          prompt: editPrompt,
          strength: 0.5,
        }),
      });

      if (!res.ok) {
        throw new Error(`Erreur ${res.status}`);
      }

      const data = await res.json();
      if (data.imageUrl) {
        setEditedImages([data.imageUrl, ...editedImages]);
        setLoadedImage(data.imageUrl);
        setEditPrompt("");
      } else {
        throw new Error("Pas d'image retournée");
      }
    } catch (e: any) {
      alert("Erreur: " + e.message);
    } finally {
      setEditingImage(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Studio Édition
          </h1>
          <p className="text-sm text-neutral-600">
            Éditez vos images avec l'IA - Collez une URL ou générez d'abord une image sur la page Générer
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Colonne gauche - Image */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Image à éditer</h2>

            {!loadedImage ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    URL de l'image
                  </label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleLoadImage}
                  className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                  Charger l'image
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-square bg-neutral-100 rounded overflow-hidden">
                  <img
                    src={loadedImage}
                    alt="Image à éditer"
                    className="w-full h-full object-contain"
                  />
                </div>
                <button
                  onClick={() => {
                    setLoadedImage("");
                    setEditedImages([]);
                  }}
                  className="w-full py-2 border rounded hover:bg-neutral-50 transition"
                >
                  Changer d'image
                </button>
              </div>
            )}

            {/* Versions éditées */}
            {editedImages.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-3">
                  Versions ({editedImages.length})
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {editedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className={`rounded border-2 overflow-hidden cursor-pointer transition ${
                        loadedImage === img
                          ? "border-blue-500 ring-2 ring-blue-200"
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                      onClick={() => setLoadedImage(img)}
                    >
                      <img
                        src={img}
                        alt={`Version ${idx + 1}`}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="p-1 bg-neutral-50 text-center">
                        <div className="text-xs">V{idx + 1}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite - Édition */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Modifications</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Décrivez vos modifications
                </label>
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="Ex: Rendre le ciel plus bleu, ajouter un logo en haut à droite, changer les couleurs..."
                  rows={6}
                  disabled={!loadedImage || editingImage}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-neutral-100"
                />
              </div>

              <button
                onClick={handleEdit}
                disabled={!loadedImage || editingImage || !editPrompt.trim()}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingImage ? "Édition en cours..." : "Appliquer les modifications"}
              </button>

              {loadedImage && (
                <div className="flex gap-2">
                  <a
                    href={loadedImage}
                    download
                    className="flex-1 py-2 bg-neutral-900 text-white text-center rounded hover:bg-neutral-800 transition text-sm"
                  >
                    Télécharger
                  </a>
                  <button
                    onClick={async () => {
                      try {
                        const response = await fetch("/api/storage/upload", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            url: loadedImage,
                            type: "image",
                            prompt: "Image éditée",
                          }),
                        });
                        const data = await response.json();
                        if (data.ok) {
                          alert("Image sauvegardée dans votre librairie!");
                        } else {
                          alert("Erreur: " + (data.error || "Impossible de sauvegarder"));
                        }
                      } catch (e: any) {
                        alert("Erreur: " + e.message);
                      }
                    }}
                    className="flex-1 py-2 bg-cyan-600 text-white text-center rounded hover:bg-cyan-700 transition text-sm"
                  >
                    Enregistrer dans ma librairie (pro)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
