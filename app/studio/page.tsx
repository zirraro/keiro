'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function StudioPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [editVersions, setEditVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editMode, setEditMode] = useState<'precise' | 'creative'>('precise');
  const [editing, setEditing] = useState(false);

  async function handleFileUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Upload échoué');
      setUploadedImage(data.url);
      setEditVersions([data.url]);
      setSelectedVersion(data.url);
    } catch (e: any) {
      alert(\`Erreur upload: \${e.message}\`);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }

  async function handleEdit() {
    if (!editPrompt.trim() || !selectedVersion) {
      alert('Veuillez décrire vos modifications');
      return;
    }

    setEditing(true);
    try {
      const res = await fetch('/api/seedream/i2i', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editPrompt,
          image: selectedVersion,
          size: 'adaptive',
          guidance_scale: editMode === 'precise' ? 5.5 : 7.5,
        }),
      });

      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Édition échouée');

      const newVersion = data.imageUrl;
      setEditVersions([...editVersions, newVersion]);
      setSelectedVersion(newVersion);
      setEditPrompt('');
      alert('Image éditée avec succès!');
    } catch (e: any) {
      console.error('Edit error:', e);
      alert('Erreur: ' + e.message);
    } finally {
      setEditing(false);
    }
  }

  async function handleSave() {
    if (!user) {
      alert('Veuillez vous connecter pour sauvegarder dans votre librairie');
      return;
    }

    if (!selectedVersion) return;

    try {
      const res = await fetch('/api/library/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'upload',
          title: \`Image éditée - \${new Date().toLocaleDateString()}\`,
          image_url: selectedVersion,
          metadata: {
            original: uploadedImage,
            versions: editVersions.length,
            editMode,
          },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        alert('✅ Sauvegardé dans votre librairie!');
      } else {
        alert('Erreur: ' + data.error);
      }
    } catch (e: any) {
      alert('Erreur de sauvegarde: ' + e.message);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Studio Édition</h1>
          <p className="text-neutral-600">
            Uploadez une image et transformez-la avec l IA. Essayez gratuitement!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {!uploadedImage && (
            <div className="lg:col-span-12">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={\`border-2 border-dashed rounded-xl p-12 text-center transition \${
                  dragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-neutral-300 hover:border-neutral-400 bg-white'
                }\`}
              >
                <div className="text-6xl mb-4">🖼️</div>
                <h3 className="text-xl font-semibold mb-2">Uploadez votre image</h3>
                <p className="text-neutral-600 mb-4">
                  Glissez-déposez une image ou cliquez pour sélectionner
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {uploading ? 'Upload en cours...' : 'Choisir une image'}
                </button>
                <p className="text-xs text-neutral-500 mt-4">
                  JPG, PNG, WEBP, GIF (max 8MB)
                </p>
              </div>
            </div>
          )}

          {uploadedImage && (
            <>
              <div className="lg:col-span-3 space-y-2">
                <div className="bg-white rounded-xl border p-4">
                  <h3 className="text-sm font-semibold mb-3">Versions ({editVersions.length})</h3>
                  <div className="space-y-2">
                    {editVersions.map((version, idx) => (
                      <div
                        key={idx}
                        className={\`rounded border-2 overflow-hidden transition cursor-pointer \${
                          selectedVersion === version
                            ? 'border-purple-500 ring-2 ring-purple-200'
                            : 'border-neutral-200 hover:border-purple-300'
                        }\`}
                        onClick={() => setSelectedVersion(version)}
                      >
                        <img
                          src={version}
                          alt={\`Version \${idx + 1}\`}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="p-2 bg-neutral-50 text-center">
                          <span className="text-xs font-medium">V{idx + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setUploadedImage(null);
                      setEditVersions([]);
                      setSelectedVersion(null);
                      setEditPrompt('');
                    }}
                    className="w-full mt-4 py-2 text-sm border rounded-lg hover:bg-neutral-50"
                  >
                    📤 Nouvelle image
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white rounded-xl border p-4">
                <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden flex items-center justify-center">
                  {selectedVersion ? (
                    <img
                      src={selectedVersion}
                      alt="Image sélectionnée"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <p className="text-neutral-400">Aucune image sélectionnée</p>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <a
                    href={selectedVersion || '#'}
                    download
                    className="flex-1 py-2 text-sm bg-neutral-900 text-white text-center rounded-lg hover:bg-neutral-800"
                  >
                    💾 Télécharger
                  </a>
                  {user && (
                    <button
                      onClick={handleSave}
                      className="flex-1 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      📚 Sauvegarder
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4">
                <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 sticky top-24">
                  <h3 className="text-lg font-semibold mb-3">Assistant d Édition</h3>
                  <div className="mb-3">
                    <p className="text-sm font-medium mb-1.5">Mode :</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditMode('precise')}
                        className={\`flex-1 text-xs px-2 py-1.5 rounded transition \${
                          editMode === 'precise'
                            ? 'bg-purple-600 text-white font-medium'
                            : 'bg-white text-purple-800 border border-purple-300'
                        }\`}
                      >
                        🎯 Précise
                      </button>
                      <button
                        onClick={() => setEditMode('creative')}
                        className={\`flex-1 text-xs px-2 py-1.5 rounded transition \${
                          editMode === 'creative'
                            ? 'bg-purple-600 text-white font-medium'
                            : 'bg-white text-purple-800 border border-purple-300'
                        }\`}
                      >
                        ✨ Créative
                      </button>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="block text-sm font-medium mb-1.5">
                      Décrivez vos modifications :
                    </label>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder={
                        editMode === 'precise'
                          ? 'Ex: Rendre le ciel plus bleu, ajouter un logo...'
                          : 'Ex: Transformer en style cyberpunk, ajouter néons...'
                      }
                      rows={5}
                      className="w-full text-sm rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <button
                    onClick={handleEdit}
                    disabled={editing || !editPrompt.trim() || !selectedVersion}
                    className="w-full py-2.5 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {editing ? 'Édition en cours...' : '✏️ Éditer l image'}
                  </button>
                  <div className="mt-4 p-3 bg-white rounded-lg border">
                    <p className="text-xs font-medium mb-2">💡 Exemples :</p>
                    <div className="space-y-1">
                      {[
                        'Ajouter un filtre chaleureux',
                        'Rendre arrière-plan flou',
                        'Améliorer contraste et saturation',
                        'Ajouter logo en bas à droite',
                      ].map((ex) => (
                        <button
                          key={ex}
                          onClick={() => setEditPrompt(ex)}
                          className="w-full text-left text-[11px] px-2 py-1 bg-neutral-50 rounded hover:bg-purple-50 border"
                        >
                          • {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {!user && uploadedImage && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
            <p className="text-sm text-blue-900">
              💡 <strong>Connectez-vous</strong> pour sauvegarder vos créations dans votre librairie personnalisée!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
