'use client';

import { useState } from 'react';
import { TwitterXIcon } from './Icons';

interface TwitterWidgetProps {
  isGuest?: boolean;
  onPreparePost?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

const DEMO_POSTS = [
  { id: '1', media_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=400&fit=crop', permalink: '#' },
  { id: '2', media_url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=400&h=400&fit=crop', permalink: '#' },
  { id: '3', media_url: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=400&fit=crop', permalink: '#' },
  { id: '4', media_url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=400&h=400&fit=crop', permalink: '#' },
  { id: '5', media_url: 'https://images.unsplash.com/photo-1432888622747-4eb9a8f2c293?w=400&h=400&fit=crop', permalink: '#' },
  { id: '6', media_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop', permalink: '#' },
];

export default function TwitterWidget({
  isGuest = false,
  onPreparePost,
  isCollapsed = false,
  onToggleCollapse
}: TwitterWidgetProps) {
  const connected = false;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <div className={`border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-neutral-100 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <div className={`flex ${isCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'}`}>
          <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col' : ''}`}>
            <button
              onClick={() => onToggleCollapse?.(!isCollapsed)}
              className="p-1 hover:bg-white/50 rounded transition-colors"
              title={isCollapsed ? "Développer" : "Réduire"}
            >
              <svg
                className={`w-4 h-4 text-neutral-600 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <TwitterXIcon className={`${isCollapsed ? 'w-8 h-8' : 'w-6 h-6'} text-neutral-900`} />
            {!isCollapsed && (
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Vos posts X</h3>
                <p className="text-xs text-neutral-500">{isGuest ? 'Aperçu démo' : 'Non connecté'}</p>
              </div>
            )}
          </div>
          <button
            onClick={onPreparePost}
            className={`bg-gradient-to-r from-neutral-800 to-black text-white font-semibold rounded-lg hover:shadow-lg transition-all ${
              isCollapsed
                ? 'w-full px-2 py-1.5 text-[10px]'
                : 'px-3 py-1.5 text-xs'
            }`}
            title={isCollapsed ? "Préparer un post" : ""}
          >
            {isCollapsed ? '+ Post' : 'Préparer un post'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {isGuest ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 p-3">
              {DEMO_POSTS.slice(0, 6).map((post) => (
                <div
                  key={post.id}
                  className="relative aspect-square rounded-lg overflow-hidden bg-neutral-100"
                >
                  <img
                    src={post.media_url}
                    alt="Demo post"
                    className="w-full h-full object-cover opacity-70"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-2">
                    <span className="text-white text-xs font-medium">Exemple</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center">
              <TwitterXIcon className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-600 mb-3">
                Connectez votre compte X pour publier
              </p>
              <button
                disabled
                className="px-6 py-2 bg-gradient-to-r from-neutral-800 to-black text-white text-sm font-medium rounded-lg opacity-50 cursor-not-allowed"
              >
                Bientôt disponible
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
