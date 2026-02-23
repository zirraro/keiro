'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface ImageEditModalProps {
  imageUrl: string;
  imageId?: string;
  onClose: () => void;
  onImageEdited: (newImageUrl: string) => void;
}

export default function ImageEditModal({ imageUrl, imageId, onClose, onImageEdited }: ImageEditModalProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleEdit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setEditedImageUrl(null);

    try {
      const res = await fetch('/api/seedream/i2i', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), imageUrl: imageUrl }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Erreur lors de la modification');
        return;
      }

      setEditedImageUrl(data.imageUrl);
    } catch (err: any) {
      setError(err.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const handleUse = async () => {
    if (!editedImageUrl) return;
    setSaving(true);

    try {
      let finalUrl = editedImageUrl;

      // Si l'image modifiée est une data URL, l'uploader sur Supabase Storage
      if (editedImageUrl.startsWith('data:')) {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Non authentifié');

        const response = await fetch(editedImageUrl);
        const blob = await response.blob();
        const fileName = `${user.id}/${Date.now()}_edited_${Math.random().toString(36).substring(7)}.png`;

        const { error: uploadError } = await supabase.storage
          .from('generated-images')
          .upload(fileName, blob, { contentType: 'image/png', cacheControl: '3600', upsert: false });

        if (uploadError) throw new Error(uploadError.message);

        const { data: { publicUrl } } = supabase.storage
          .from('generated-images')
          .getPublicUrl(fileName);

        finalUrl = publicUrl;
      }

      // Si on a un imageId, mettre à jour en BDD
      if (imageId) {
        const res = await fetch('/api/library/update-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId, newImageUrl: finalUrl }),
        });
        const data = await res.json();
        if (!data.ok) {
          console.error('[ImageEditModal] Update error:', data.error);
        }
      }

      onImageEdited(finalUrl);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">Modifier l'image</h2>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded-lg transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Image preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1">Original</p>
              <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border">
                <img src={imageUrl} alt="Original" className="w-full h-full object-cover" />
              </div>
            </div>
            {editedImageUrl && (
              <div>
                <p className="text-xs font-medium text-emerald-600 mb-1">Modifié</p>
                <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden border border-emerald-300">
                  <img src={editedImageUrl} alt="Modifié" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>

          {/* Prompt input */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Décrivez les modifications souhaitées
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: Enlève le texte, ajoute plus de lumière, change le fond en bleu..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              disabled={loading}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center gap-3 py-6">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-neutral-600">Modification en cours... (~15-30s)</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex gap-2">
          {editedImageUrl ? (
            <>
              <button
                onClick={handleUse}
                disabled={saving}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {saving ? 'Sauvegarde...' : 'Utiliser cette version'}
              </button>
              <button
                onClick={() => { setEditedImageUrl(null); setError(null); }}
                className="px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-lg font-medium text-sm hover:bg-neutral-200 transition"
              >
                Réessayer
              </button>
            </>
          ) : (
            <button
              onClick={handleEdit}
              disabled={loading || !prompt.trim()}
              className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-semibold text-sm hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Modification...' : 'Modifier l\'image'}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loading || saving}
            className="px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg font-medium text-sm hover:bg-neutral-50 transition disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
