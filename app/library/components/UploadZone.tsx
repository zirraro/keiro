'use client';

import { useState, DragEvent, useRef } from 'react';

interface UploadZoneProps {
  type: 'image' | 'video';
  onUpload: (file: File) => Promise<void>;
  className?: string;
}

export default function UploadZone({ type, onUpload, className = '' }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = {
    image: {
      icon: '📸',
      title: 'Déposez vos images ici ou cliquez pour sélectionner',
      subtitle: 'JPEG, PNG, WebP, GIF - max 8MB',
      accept: 'image/jpeg,image/jpg,image/png,image/webp,image/gif',
      maxSize: 8 * 1024 * 1024
    },
    video: {
      icon: '🎬',
      title: 'Déposez vos vidéos ici ou cliquez pour sélectionner',
      subtitle: 'MP4, MOV, WebM, AVI - max 100MB',
      accept: 'video/mp4,video/quicktime,video/webm,video/x-msvideo',
      maxSize: 100 * 1024 * 1024
    }
  };

  const currentConfig = config[type];

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFile(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // Validate file size
    if (file.size > currentConfig.maxSize) {
      const maxMB = currentConfig.maxSize / (1024 * 1024);
      alert(`Fichier trop volumineux (max ${maxMB}MB)`);
      return;
    }

    // Validate file type
    const acceptedTypes = currentConfig.accept.split(',');
    const fileType = file.type;
    const isValidType = acceptedTypes.some(acceptedType =>
      fileType.includes(acceptedType.replace('*/', ''))
    );

    if (!isValidType) {
      alert(`Type de fichier non supporté. Utilisez: ${currentConfig.subtitle.split('-')[0].trim()}`);
      return;
    }

    // Upload
    setUploading(true);
    try {
      await onUpload(file);
    } catch (error: any) {
      console.error('[UploadZone] Upload error:', error);
      alert(`Erreur lors de l'upload: ${error.message}`);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
        ${isDragging
          ? 'border-blue-500 bg-blue-50'
          : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-neutral-100'
        }
        ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={currentConfig.accept}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={uploading}
      />

      <div className="flex flex-col items-center gap-2">
        <span className="text-4xl">{currentConfig.icon}</span>

        {uploading ? (
          <>
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-neutral-700">Upload en cours...</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-neutral-700">{currentConfig.title}</p>
            <p className="text-xs text-neutral-500">{currentConfig.subtitle}</p>
          </>
        )}
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-10 rounded-lg pointer-events-none"></div>
      )}
    </div>
  );
}
