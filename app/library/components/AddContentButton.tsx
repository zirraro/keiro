'use client';

import { useState, useRef } from 'react';

interface AddContentButtonProps {
  onUploadComplete?: () => void;
}

export default function AddContentButton({ onUploadComplete }: AddContentButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadType, setUploadType] = useState<'image' | 'video' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/jpg,image/png,image/webp,image/gif';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setIsOpen(false);
        await uploadFile(file, 'image');
      }
    };
    input.click();
  };

  const handleVideoUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime,video/webm,video/x-msvideo';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setIsOpen(false);
        await uploadFile(file, 'video');
      }
    };
    input.click();
  };

  const uploadFile = async (file: File, type: 'image' | 'video') => {
    setUploading(true);
    setUploadType(type);
    setProgress(0);

    try {
      // Validation côté client AVANT l'upload
      const maxSize = type === 'image' ? 8 * 1024 * 1024 : 50 * 1024 * 1024; // 8MB images, 50MB videos
      if (file.size > maxSize) {
        const maxSizeMB = type === 'image' ? '8MB' : '50MB';
        throw new Error(`Fichier trop volumineux. Taille max: ${maxSizeMB}`);
      }

      // Pour les vidéos, utiliser l'upload direct vers Supabase (bypass Vercel)
      if (type === 'video') {
        await uploadVideoDirectly(file);
      } else {
        // Pour les images, upload via l'API classique (< 8MB OK)
        await uploadImageViaAPI(file);
      }

      // Success
      setProgress(100);
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setUploadType(null);
        onUploadComplete?.();
      }, 500);

    } catch (error: any) {
      console.error('[AddContentButton] Upload error:', error);
      alert(`Erreur lors de l'upload: ${error.message}`);
      setUploading(false);
      setProgress(0);
      setUploadType(null);
    }
  };

  const uploadImageViaAPI = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name);
    formData.append('saveToLibrary', 'true');

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        setProgress(Math.round(percentComplete));
      }
    });

    const response = await new Promise<Response>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        resolve(new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText
        }));
      });

      xhr.addEventListener('error', () => reject(new Error('Erreur réseau lors de l\'upload')));
      xhr.addEventListener('abort', () => reject(new Error('Upload annulé')));

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Erreur serveur (${response.status})`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Upload failed');
    }
  };

  const uploadVideoDirectly = async (file: File) => {
    // Étape 1: Obtenir une signed URL depuis l'API
    setProgress(5);
    const signedUrlResponse = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        fileType: file.type,
        fileSize: file.size
      })
    });

    if (!signedUrlResponse.ok) {
      const errorData = await signedUrlResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Impossible d\'obtenir l\'URL d\'upload');
    }

    const { signedUrl, token, path } = await signedUrlResponse.json();
    console.log('[AddContentButton] Got signed URL for:', path);

    // Étape 2: Upload direct vers Supabase Storage avec progress tracking
    setProgress(10);
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        // Progress de 10% à 90% pour l'upload
        const percentComplete = 10 + (e.loaded / e.total) * 80;
        setProgress(Math.round(percentComplete));
      }
    });

    await new Promise<void>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Erreur réseau lors de l\'upload')));
      xhr.addEventListener('abort', () => reject(new Error('Upload annulé')));

      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('x-upsert', 'false');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(file);
    });

    console.log('[AddContentButton] Video uploaded to Supabase Storage');

    // Étape 3: Sauvegarder les métadonnées en DB
    setProgress(95);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const metadataResponse = await fetch('/api/save-video-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storagePath: path,
        title: file.name.replace(`.${ext}`, ''),
        fileSize: file.size,
        format: ext,
        folderId: null
      })
    });

    if (!metadataResponse.ok) {
      const errorData = await metadataResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Erreur lors de la sauvegarde des métadonnées');
    }

    const metadataData = await metadataResponse.json();
    if (!metadataData.ok) {
      throw new Error(metadataData.error || 'Failed to save metadata');
    }

    console.log('[AddContentButton] Video metadata saved:', metadataData.video.id);
  };

  // Close dropdown when clicking outside
  useState(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={uploading}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {uploading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Upload en cours...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Ajouter du contenu</span>
          </>
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && !uploading && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 overflow-hidden">
          <button
            onClick={handleImageUpload}
            className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors flex items-center gap-3"
          >
            <span className="text-2xl">📸</span>
            <div>
              <div className="text-sm font-semibold text-neutral-900">Ajouter une image</div>
              <div className="text-xs text-neutral-500">JPEG, PNG, WebP, GIF (max 8MB)</div>
            </div>
          </button>

          <div className="border-t border-neutral-200"></div>

          <button
            onClick={handleVideoUpload}
            className="w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors flex items-center gap-3"
          >
            <span className="text-2xl">🎬</span>
            <div>
              <div className="text-sm font-semibold text-neutral-900">Ajouter une vidéo</div>
              <div className="text-xs text-neutral-500">MP4, MOV, WebM (max 50MB)</div>
            </div>
          </button>
        </div>
      )}

      {/* Progress bar */}
      {uploading && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 p-4 z-50">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">{uploadType === 'image' ? '📸' : '🎬'}</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-neutral-900">
                Upload {uploadType === 'image' ? "de l'image" : 'de la vidéo'}
              </div>
              <div className="text-xs text-neutral-500">{progress}%</div>
            </div>
          </div>
          <div className="w-full bg-neutral-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}
