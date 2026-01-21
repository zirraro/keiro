"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEditLimit } from "@/hooks/useEditLimit";
import SubscriptionModal from "@/components/SubscriptionModal";
import EmailGateModal from "@/components/EmailGateModal";
import SignupGateModal from "@/components/SignupGateModal";
import TextOverlayEditor from "@/components/TextOverlayEditor";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

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
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [savingToGallery, setSavingToGallery] = useState(false);

  // Vérifier si l'utilisateur est connecté au chargement et écouter les changements d'auth
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        editLimit.setHasAccount(true);
        setShowSignupGate(false);
      }
    }
    checkAuth();

    // Écouter les changements d'état d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        editLimit.setHasAccount(true);
        setShowSignupGate(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        editLimit.reset();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
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

  const handleSaveToGallery = async () => {
    if (!user) {
      alert('Vous devez être connecté pour sauvegarder dans votre galerie');
      return;
    }

    if (!loadedImage) {
      alert('Aucune image à sauvegarder');
      return;
    }

    setSavingToGallery(true);
    try {
      const response = await fetch('/api/library/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important pour envoyer les cookies d'auth
        body: JSON.stringify({
          imageUrl: loadedImage,
          title: 'Image éditée depuis Studio',
          tags: ['studio', 'édition']
        })
      });

      // Vérifier si la réponse est bien du JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Si ce n'est pas du JSON, lire comme texte
        const errorText = await response.text();
        console.error('[Studio] Non-JSON response:', errorText);

        if (response.status === 413) {
          throw new Error('Image trop volumineuse. Veuillez utiliser une image plus petite.');
        } else if (response.status === 401) {
          throw new Error('Non authentifié. Veuillez vous reconnecter.');
        } else {
          throw new Error('Erreur serveur: ' + (errorText.substring(0, 100) || 'Réponse invalide'));
        }
      }

      const data = await response.json();

      if (data.ok) {
        alert('✅ Image sauvegardée dans votre galerie !');
      } else {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      console.error('[Studio] Error saving:', error);
      alert('❌ ' + (error.message || 'Erreur lors de la sauvegarde'));
    } finally {
      setSavingToGallery(false);
    }
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

  // Fonction pour compresser les images data URL avant envoi API
  const compressImageDataUrl = async (dataUrl: string, maxWidth = 1024, maxHeight = 1024, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Redimensionner si nécessaire
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convertir en JPEG avec compression
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
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
      // Compresser l'image si c'est une data URL
      let imageToSend = loadedImage;
      if (loadedImage.startsWith('data:image/')) {
        console.log('[Studio] Compressing image before sending...');
        try {
          imageToSend = await compressImageDataUrl(loadedImage);
          console.log('[Studio] Image compressed successfully');
        } catch (err) {
          console.warn('[Studio] Compression failed, sending original:', err);
        }
      }

      const res = await fetch("/api/seedream/i2i", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageToSend,
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
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-blue-50/30 to-purple-50/20 py-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header premium */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full mb-4">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
            <span className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Studio d'Édition IA
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-3">
            Transformez vos visuels<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
              avec l'intelligence artificielle
            </span>
          </h1>
          <p className="text-neutral-600 max-w-2xl mx-auto text-lg">
            Éditez, retouchez et personnalisez vos images en quelques clics grâce à notre IA avancée
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Colonne gauche - Image */}
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/50 p-8 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-900">Image à éditer</h2>
            </div>

            {!loadedImage ? (
              <div className="space-y-6">
                {/* Zone de drag & drop premium */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
                    isDragging
                      ? "border-blue-500 bg-gradient-to-br from-blue-50 to-purple-50 scale-[1.02] shadow-lg"
                      : "border-neutral-300 bg-gradient-to-br from-neutral-50 to-neutral-100 hover:border-blue-400 hover:shadow-md"
                  }`}
                >
                  <div className={`transition-transform duration-300 ${isDragging ? 'scale-110' : ''}`}>
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                      <svg
                        className="h-8 w-8 text-white"
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
                    </div>
                  </div>
                  <p className="text-base text-neutral-700 mb-3 font-medium">
                    <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                      Glissez une image ici
                    </span>
                  </p>
                  <p className="text-sm text-neutral-500 mb-4">ou</p>
                  <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-xl transition-all hover:scale-105 font-semibold">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="hidden"
                    />
                    Parcourir vos fichiers
                  </label>
                  <p className="text-xs text-neutral-400 mt-4">PNG, JPG, WEBP jusqu'à 10MB</p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-neutral-500 font-medium">ou coller une URL</span>
                  </div>
                </div>

                {/* URL Input premium */}
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    URL de l'image
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://exemple.com/image.jpg"
                      className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
                    />
                  </div>
                </div>
                <button
                  onClick={handleLoadImage}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-xl transition-all hover:scale-[1.02] font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Charger l'image
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative aspect-square bg-gradient-to-br from-neutral-100 to-neutral-200 rounded-xl overflow-hidden shadow-lg group">
                  <img
                    src={loadedImage}
                    alt="Image à éditer"
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <button
                  onClick={() => {
                    setLoadedImage("");
                    setOriginalImage("");
                    setEditedImages([]);
                  }}
                  className="w-full py-3 border-2 border-neutral-300 rounded-xl hover:bg-neutral-50 hover:border-neutral-400 transition-all font-medium text-neutral-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Changer d'image
                </button>
              </div>
            )}

            {/* Versions (Original + Éditées) premium */}
            {allVersions.length > 0 && (
              <div className="mt-8 pt-6 border-t-2 border-neutral-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Historique des versions
                  </h3>
                  <span className="px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full text-xs font-bold">
                    {allVersions.length} version{allVersions.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {allVersions.map((img, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border-2 overflow-hidden cursor-pointer transition-all duration-200 ${
                        loadedImage === img
                          ? "border-blue-500 ring-4 ring-blue-100 shadow-lg scale-105"
                          : "border-neutral-200 hover:border-blue-300 hover:shadow-md hover:scale-102"
                      }`}
                      onClick={() => setLoadedImage(img)}
                    >
                      <div className="relative">
                        <img
                          src={img}
                          alt={idx === 0 ? "Original" : `Version ${idx}`}
                          className="w-full aspect-square object-cover"
                        />
                        {loadedImage === img && (
                          <div className="absolute top-1 right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className={`p-2 text-center ${loadedImage === img ? 'bg-blue-50' : 'bg-neutral-50'}`}>
                        <div className={`text-xs font-bold ${loadedImage === img ? 'text-blue-700' : 'text-neutral-700'}`}>
                          {idx === 0 ? "📄 Original" : `✨ V${idx}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite - Édition premium */}
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-200/50 p-8 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-900">Édition IA</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Décrivez vos modifications
                </label>
                <div className="relative">
                  <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Ex: Rendre le ciel plus bleu, ajouter un logo en haut à droite, changer les couleurs en tons pastels..."
                    rows={6}
                    disabled={!loadedImage || editingImage}
                    className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all disabled:bg-neutral-100 disabled:cursor-not-allowed resize-none"
                  />
                  {editPrompt.length > 0 && (
                    <div className="absolute bottom-3 right-3 text-xs text-neutral-400 bg-white px-2 py-1 rounded-md shadow-sm">
                      {editPrompt.length} caractères
                    </div>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-2 flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Soyez précis pour de meilleurs résultats. L'IA va interpréter votre demande et modifier l'image.</span>
                </p>
              </div>

              <button
                onClick={handleEdit}
                disabled={!loadedImage || editingImage || !editPrompt.trim()}
                className="w-full py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-red-500 text-white rounded-xl hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg flex items-center justify-center gap-3 hover:scale-[1.02] disabled:hover:scale-100 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative flex items-center gap-3">
                  {editingImage ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Édition en cours...
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Transformer avec l'IA
                    </>
                  )}
                </span>
              </button>

              {loadedImage && (
                <>
                  {/* Divider */}
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t-2 border-neutral-100"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-4 bg-white text-neutral-500 font-semibold">AUTRES ACTIONS</span>
                    </div>
                  </div>

                  {/* Bouton ajouter texte overlay premium */}
                  <button
                    onClick={() => setShowTextEditor(true)}
                    className="w-full py-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-xl hover:shadow-xl transition-all font-bold flex items-center justify-center gap-3 hover:scale-[1.02] relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="relative flex items-center gap-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Ajouter / Personnaliser du texte
                    </span>
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <a
                      href={loadedImage}
                      download
                      className="py-3 bg-neutral-900 text-white text-center rounded-xl hover:bg-neutral-800 transition-all text-sm font-semibold flex items-center justify-center gap-2 hover:shadow-lg hover:scale-[1.02]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Télécharger
                    </a>
                    <button
                      onClick={user ? handleSaveToGallery : () => setShowSubscriptionModal(true)}
                      disabled={savingToGallery}
                      className={`py-3 text-white text-center rounded-xl transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                        savingToGallery
                          ? 'bg-neutral-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:shadow-lg hover:scale-[1.02]'
                      }`}
                    >
                      {savingToGallery ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Sauvegarde...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                          {user ? 'Galerie' : 'Pro'}
                        </>
                      )}
                    </button>
                  </div>
                </>
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

      {/* Éditeur de texte overlay avancé */}
      {showTextEditor && loadedImage && (
        <TextOverlayEditor
          baseImageUrl={loadedImage}
          initialConfig={{
            text: '',
            position: 'center',
          }}
          onApply={(newImageUrl, config) => {
            setLoadedImage(newImageUrl);
            setShowTextEditor(false);
          }}
          onCancel={() => setShowTextEditor(false)}
        />
      )}
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-blue-50/30 to-purple-50/20 py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-neutral-200 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
            </div>
          </div>
          <p className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 animate-pulse">
            Chargement du studio...
          </p>
          <p className="text-sm text-neutral-500 mt-2">Préparation de l'environnement d'édition</p>
        </div>
      </div>
    }>
      <StudioContent />
    </Suspense>
  );
}
