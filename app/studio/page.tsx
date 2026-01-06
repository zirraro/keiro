"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEditLimit } from "@/hooks/useEditLimit";
import SubscriptionModal from "@/components/SubscriptionModal";
import EmailGateModal from "@/components/EmailGateModal";
import SignupGateModal from "@/components/SignupGateModal";

function StudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = supabaseBrowser();
  const editLimit = useEditLimit();

  const [imageUrl, setImageUrl] = useState(searchParams.get("image") || "");
  const [originalImage, setOriginalImage] = useState(searchParams.get("image") || "");
  const [loadedImage, setLoadedImage] = useState(searchParams.get("image") || "");
  const [editPrompt, setEditPrompt] = useState("");
  const [editingImage, setEditingImage] = useState(false);
  const [editedImages, setEditedImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [showSignupGate, setShowSignupGate] = useState(false);

  // Vérifier si l'utilisateur est connecté au chargement
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        editLimit.setHasAccount(true);
      }
    }
    checkAuth();
  }, []);

  const handleLoadImage = () => {
    if (!imageUrl.trim()) {
      alert("Veuillez entrer une URL d'image");
      return;
    }
    setOriginalImage(imageUrl);
    setLoadedImage(imageUrl);
    setEditedImages([]);
  };

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert("Veuillez sélectionner une image");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setOriginalImage(result);
      setLoadedImage(result);
      setEditedImages([]);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleEdit = async () => {
    // Vérifier les limites freemium
    if (editLimit.requiredAction === 'email') {
      setShowEmailGate(true);
      return;
    }
    if (editLimit.requiredAction === 'signup') {
      setShowSignupGate(true);
      return;
    }
    if (editLimit.requiredAction === 'premium') {
      setShowSubscriptionModal(true);
      return;
    }

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
        setEditedImages([...editedImages, data.imageUrl]);
        setLoadedImage(data.imageUrl);
        setEditPrompt("");

        // Incrémenter le compteur après succès
        editLimit.incrementCount();
      } else {
        throw new Error("Pas d'image retournée");
      }
    } catch (e: any) {
      alert("Erreur: " + e.message);
    } finally {
      setEditingImage(false);
    }
  };

  // Construire le tableau de toutes les versions (Original + éditées)
  const allVersions = originalImage ? [originalImage, ...editedImages] : [];

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
                {/* Zone de drag & drop */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
                    isDragging
                      ? "border-blue-500 bg-blue-50"
                      : "border-neutral-300 bg-neutral-50"
                  }`}
                >
                  <svg
                    className="mx-auto h-12 w-12 text-neutral-400 mb-3"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="text-sm text-neutral-600 mb-2">
                    <span className="font-semibold">Glissez une image ici</span> ou
                  </p>
                  <label className="cursor-pointer inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="hidden"
                    />
                    Parcourir
                  </label>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-neutral-500">ou</span>
                  </div>
                </div>

                {/* URL Input */}
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
                    setOriginalImage("");
                    setEditedImages([]);
                  }}
                  className="w-full py-2 border rounded hover:bg-neutral-50 transition"
                >
                  Changer d'image
                </button>
              </div>
            )}

            {/* Versions (Original + Éditées) */}
            {allVersions.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-3">
                  Versions ({allVersions.length})
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {allVersions.map((img, idx) => (
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
                        alt={idx === 0 ? "Original" : `Version ${idx}`}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="p-1 bg-neutral-50 text-center">
                        <div className="text-xs font-medium">
                          {idx === 0 ? "Original" : `V${idx}`}
                        </div>
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
                    onClick={() => setShowSubscriptionModal(true)}
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

      {/* Modales */}
      <EmailGateModal
        isOpen={showEmailGate}
        onClose={() => setShowEmailGate(false)}
        onSubmit={(email) => {
          editLimit.setEmail(email);
          setShowEmailGate(false);
        }}
        type="edit"
      />

      <SignupGateModal
        isOpen={showSignupGate}
        onClose={() => setShowSignupGate(false)}
        onSuccess={() => {
          editLimit.setHasAccount(true);
          setShowSignupGate(false);
        }}
      />

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-50 py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement...</p>
        </div>
      </div>
    }>
      <StudioContent />
    </Suspense>
  );
}
