'use client';

import { useState } from 'react';
import { LinkedInIcon } from './Icons';

const DEMO_POSTS = [
  { id: '1', media_url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=400&fit=crop', permalink: '#' },
  { id: '2', media_url: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=400&h=400&fit=crop', permalink: '#' },
  { id: '3', media_url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=400&h=400&fit=crop', permalink: '#' },
  { id: '4', media_url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=400&fit=crop', permalink: '#' },
  { id: '5', media_url: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400&h=400&fit=crop', permalink: '#' },
  { id: '6', media_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop', permalink: '#' },
];

interface LinkedInWidgetProps {
  isGuest?: boolean;
  onPreparePost?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  connected?: boolean;
  username?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export default function LinkedInWidget({
  isGuest = false,
  onPreparePost,
  isCollapsed = false,
  onToggleCollapse,
  connected = false,
  username,
  onConnect,
  onDisconnect
}: LinkedInWidgetProps) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <div className={`border-b border-neutral-200 bg-gradient-to-r from-blue-50 to-sky-50 ${isCollapsed ? 'p-2' : 'p-4'}`}>
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
            <LinkedInIcon className={`${isCollapsed ? 'w-8 h-8' : 'w-6 h-6'} text-[#0077B5]`} />
            {!isCollapsed && (
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Vos posts LinkedIn</h3>
                <p className="text-xs text-neutral-500">
                  {isGuest ? 'Aperçu démo' : connected ? username || 'Connecté' : 'Non connecté'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={onPreparePost}
            className={`bg-gradient-to-r from-[#0077B5] to-blue-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all ${
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
          ) : connected ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#0077B5] to-blue-600 flex items-center justify-center">
                    <LinkedInIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{username}</p>
                    <p className="text-xs text-green-600">Connecté</p>
                  </div>
                </div>
                <button
                  onClick={onDisconnect}
                  className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Déconnecter
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                Vous pouvez publier directement sur LinkedIn depuis vos brouillons.
              </p>
            </div>
          ) : (
            <div className="p-6 text-center">
              <LinkedInIcon className="w-12 h-12 text-[#0077B5]/30 mx-auto mb-3" />
              <p className="text-sm text-neutral-600 mb-3">
                Connectez votre LinkedIn pour publier directement
              </p>
              <button
                onClick={onConnect}
                className="px-6 py-2 bg-gradient-to-r from-[#0077B5] to-blue-600 text-white text-sm font-medium rounded-lg hover:from-[#005f8f] hover:to-blue-700 transition-all shadow-md"
              >
                Connecter LinkedIn
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
