'use client';

import { useState, useCallback } from 'react';

// TikTok UX Guidelines compliance — Required before publishing to TikTok
function TikTokPublishFlow({ post, onPublish, onCancel }: { post: any; onPublish: (settings: any) => void; onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [comments, setComments] = useState(true);
  const [duet, setDuet] = useState(true);
  const [stitch, setStitch] = useState(true);

  return (
    <div className="space-y-4">
      {/* Step 1: Disclosure */}
      {step === 1 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white">Publier sur TikTok</h3>
          <p className="text-[11px] text-white/60">Ce contenu sera publié sur votre compte TikTok. En continuant, vous acceptez que KeiroAI publie ce contenu en votre nom via l'API TikTok.</p>
          {post.visual_url && <img src={post.visual_url} alt="" className="w-full max-h-[150px] object-contain rounded-lg" />}
          <p className="text-[10px] text-white/40">{(post.caption || '').substring(0, 100)}</p>
          <button onClick={() => setStep(2)} className="w-full py-2.5 bg-black text-white text-xs font-bold rounded-xl min-h-[44px]">Continuer vers les paramètres</button>
        </div>
      )}

      {/* Step 2: Privacy */}
      {step === 2 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white">Qui peut voir cette vidéo ?</h3>
          {(['public', 'friends', 'private'] as const).map(opt => (
            <button key={opt} onClick={() => setPrivacy(opt)} className={`w-full text-left px-4 py-3 rounded-xl border text-xs transition ${privacy === opt ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
              {opt === 'public' ? 'Tout le monde' : opt === 'friends' ? 'Amis uniquement' : 'Privé (moi seul)'}
            </button>
          ))}
          <button onClick={() => setStep(3)} className="w-full py-2.5 bg-black text-white text-xs font-bold rounded-xl min-h-[44px]">Suivant</button>
        </div>
      )}

      {/* Step 3: Interactions */}
      {step === 3 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white">Paramètres d'interaction</h3>
          {[
            { key: 'comments', label: 'Autoriser les commentaires', value: comments, set: setComments },
            { key: 'duet', label: 'Autoriser les Duos', value: duet, set: setDuet },
            { key: 'stitch', label: 'Autoriser le Stitch', value: stitch, set: setStitch },
          ].map(s => (
            <div key={s.key} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
              <span className="text-xs text-white/70">{s.label}</span>
              <button onClick={() => s.set(!s.value)} className={`w-10 h-5 rounded-full relative transition-colors ${s.value ? 'bg-emerald-500' : 'bg-white/15'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${s.value ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
          <button onClick={() => setStep(4)} className="w-full py-2.5 bg-black text-white text-xs font-bold rounded-xl min-h-[44px]">Aperçu final</button>
        </div>
      )}

      {/* Step 4: Preview + Confirm */}
      {step === 4 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white">Confirmer la publication</h3>
          {post.visual_url && <img src={post.visual_url} alt="" className="w-full max-h-[150px] object-contain rounded-lg" />}
          <p className="text-[10px] text-white/50">{post.caption}</p>
          <div className="space-y-1 text-[10px] text-white/40">
            <div>Visibilité : <span className="text-white/70 font-medium">{privacy === 'public' ? 'Tout le monde' : privacy === 'friends' ? 'Amis' : 'Privé'}</span></div>
            <div>Commentaires : <span className="text-white/70">{comments ? 'Oui' : 'Non'}</span> | Duo : <span className="text-white/70">{duet ? 'Oui' : 'Non'}</span> | Stitch : <span className="text-white/70">{stitch ? 'Oui' : 'Non'}</span></div>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-2.5 bg-white/10 text-white/50 text-xs rounded-xl min-h-[44px]">Annuler</button>
            <button onClick={() => onPublish({ privacy, comments, duet, stitch })} className="flex-1 py-2.5 bg-black text-white text-xs font-bold rounded-xl min-h-[44px]">Publier sur TikTok</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PostPreviewModal — Fullscreen Instagram/TikTok/LinkedIn-like post preview.
 * Editable caption/hashtags for draft/approved posts.
 */

interface PostPreviewModalProps {
  post: {
    id: string;
    platform?: string;
    format?: string;
    status?: string;
    hook?: string;
    caption?: string;
    hashtags?: string[] | string;
    visual_url?: string;
    video_url?: string;
    scheduled_date?: string;
    scheduled_time?: string;
    engagement_data?: { likes?: number; comments?: number; shares?: number; saves?: number };
  };
  onClose: () => void;
  onApprove?: () => void;
  onPublish?: () => void;
  onSkip?: () => void;
}

export default function PostPreviewModal({ post, onClose, onApprove, onPublish, onSkip }: PostPreviewModalProps) {
  const isIG = !post.platform || post.platform === 'instagram';
  const isTT = post.platform === 'tiktok';
  const [showTikTokFlow, setShowTikTokFlow] = useState(false);
  const isReel = post.format === 'reel' || post.format === 'video';
  const isStory = post.format === 'story';
  const isCarousel = post.format === 'carrousel' || post.format === 'carousel';
  const isEditable = post.status === 'draft' || post.status === 'approved';
  const hashtagStr = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : (post.hashtags || '');

  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption || post.hook || '');
  const [hashtags, setHashtags] = useState(hashtagStr);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/agents/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'modify', postId: post.id, caption, hashtags: hashtags.split(/\s+/).filter(Boolean) }),
      });
      setEditing(false);
    } catch {} finally { setSaving(false); }
  }, [post.id, caption, hashtags]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
            isIG ? 'bg-gradient-to-br from-purple-600 to-pink-500' : isTT ? 'bg-black' : 'bg-[#0A66C2]'
          }`}>
            {isIG ? 'IG' : isTT ? 'TT' : 'LI'}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">Mon business</div>
            <div className="text-[10px] text-white/40">
              {isReel && 'Reel'}{isStory && 'Story'}{isCarousel && 'Carrousel'}{!isReel && !isStory && !isCarousel && 'Post'}
              {post.scheduled_date && ` \u2022 ${post.scheduled_date}`}
              {post.status && ` \u2022 ${post.status === 'draft' ? 'Brouillon' : post.status === 'approved' ? 'Programme' : post.status === 'published' ? 'Publie' : post.status}`}
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Visual */}
        <div className={`relative bg-white/5 ${isTT || isStory ? 'aspect-[9/16] max-h-[50vh]' : 'max-h-[50vh]'}`}>
          {post.visual_url ? (
            <img src={post.visual_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-pink-900/30">
              {post.hook ? (
                <div className="bg-black/60 backdrop-blur-sm text-white px-6 py-4 rounded-2xl text-base font-bold leading-snug max-w-[80%] text-center">{post.hook}</div>
              ) : <span className="text-4xl">{isReel ? '\u{1F3AC}' : '\u{1F4F8}'}</span>}
            </div>
          )}
          {isCarousel && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {[1, 2, 3].map(i => <div key={i} className={`w-2 h-2 rounded-full ${i === 1 ? 'bg-white' : 'bg-white/40'}`} />)}
            </div>
          )}
        </div>

        {/* Caption + hashtags — editable */}
        <div className="px-4 py-3">
          {post.engagement_data && (
            <div className="text-xs font-semibold text-white mb-1">{(post.engagement_data.likes || 0).toLocaleString()} J&apos;aime</div>
          )}

          {editing ? (
            <div className="space-y-2">
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-purple-500/50 min-h-[100px] resize-y"
                placeholder="Legende..."
              />
              <input
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-blue-400 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                placeholder="#hashtag1 #hashtag2"
              />
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-500 transition min-h-[44px]">
                  {saving ? 'Sauvegarde...' : '\u2705 Sauvegarder'}
                </button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 bg-white/10 text-white/50 text-xs rounded-lg min-h-[44px]">Annuler</button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{caption || 'Legende en cours de generation...'}</p>
              {hashtags && <p className="text-sm text-blue-500 mt-2">{hashtags}</p>}
              {isEditable && (
                <button onClick={() => setEditing(true)} className="mt-2 text-[10px] text-purple-400 hover:text-purple-300 transition">
                  {'\u270F\uFE0F'} Modifier la legende
                </button>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        {isEditable && !editing && (
          <div className="px-4 pb-4 space-y-2">
            {(onApprove || onPublish || onSkip) && (
              <div className="flex gap-2">
                {onApprove && <button onClick={() => { onApprove(); onClose(); }} className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-500 transition min-h-[44px]">{'\u2705'} Valider</button>}
                {onPublish && isTT && <button onClick={() => setShowTikTokFlow(true)} className="flex-1 py-2.5 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-900 transition min-h-[44px]">{'\uD83C\uDFB5'} Publier sur TikTok</button>}
                {onPublish && !isTT && <button onClick={() => { onPublish(); onClose(); }} className="flex-1 py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-500 transition min-h-[44px]">{'\u{1F680}'} Publier</button>}
                {onSkip && <button onClick={() => { onSkip(); onClose(); }} className="py-2.5 px-4 bg-white/10 text-white/40 text-xs rounded-xl hover:bg-white/15 transition min-h-[44px]">Ignorer</button>}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={async () => {
                try {
                  await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({ action: 'regenerate_single', postId: post.id }) });
                  onClose();
                } catch {}
              }} className="flex-1 py-2 bg-amber-600/20 text-amber-400 text-[10px] font-medium rounded-xl hover:bg-amber-600/30 transition min-h-[44px]">
                {'\uD83D\uDD04'} Régénérer
              </button>
              <button onClick={async () => {
                if (!confirm('Supprimer ce post ?')) return;
                try {
                  await fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({ action: 'skip_single', postId: post.id }) });
                  onClose();
                } catch {}
              }} className="py-2 px-4 bg-red-600/20 text-red-400 text-[10px] font-medium rounded-xl hover:bg-red-600/30 transition min-h-[44px]">
                {'\u{1F5D1}'} Supprimer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TikTok Publishing Flow — UX Guidelines compliance */}
      {showTikTokFlow && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4" onClick={() => setShowTikTokFlow(false)}>
          <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <TikTokPublishFlow
              post={post}
              onPublish={(settings) => {
                setShowTikTokFlow(false);
                if (onPublish) { onPublish(); onClose(); }
              }}
              onCancel={() => setShowTikTokFlow(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
