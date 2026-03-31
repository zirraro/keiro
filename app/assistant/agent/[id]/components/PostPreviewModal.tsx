'use client';

/**
 * PostPreviewModal — Fullscreen Instagram/TikTok/LinkedIn-like post preview.
 * Opens when user clicks a small PostPreview card.
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
  const isLI = post.platform === 'linkedin';
  const isReel = post.format === 'reel' || post.format === 'video';
  const isStory = post.format === 'story';
  const isCarousel = post.format === 'carrousel' || post.format === 'carousel';
  const isDraft = post.status === 'draft';
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : (post.hashtags || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* Header — platform style */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-white/10">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${
            isIG ? 'bg-gradient-to-br from-purple-600 to-pink-500' :
            isTT ? 'bg-black' : 'bg-[#0A66C2]'
          }`}>
            {isIG ? 'IG' : isTT ? 'TT' : 'LI'}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Mon business</div>
            <div className="text-[10px] text-neutral-500 dark:text-white/40">
              {isReel && 'Reel'}{isStory && 'Story'}{isCarousel && 'Carrousel'}{!isReel && !isStory && !isCarousel && 'Post'}
              {post.scheduled_date && ` \u2022 ${post.scheduled_date} ${post.scheduled_time || ''}`}
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 dark:text-white/30 hover:text-neutral-600 dark:hover:text-white/60 transition p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Visual — full width */}
        <div className={`relative bg-neutral-100 dark:bg-white/5 ${isTT || isStory ? 'aspect-[9/16] max-h-[50vh]' : 'aspect-square'}`}>
          {post.visual_url ? (
            <img src={post.visual_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-pink-900/30">
              {post.hook && (
                <div className="bg-black/60 backdrop-blur-sm text-white px-6 py-4 rounded-2xl text-base font-bold leading-snug max-w-[80%] text-center">
                  {post.hook}
                </div>
              )}
              {!post.hook && <span className="text-4xl">{isReel ? '\u{1F3AC}' : '\u{1F4F8}'}</span>}
            </div>
          )}
          {isCarousel && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {[1, 2, 3].map(i => (
                <div key={i} className={`w-2 h-2 rounded-full ${i === 1 ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </div>
          )}
        </div>

        {/* Engagement bar */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-neutral-100 dark:border-white/5">
          <button className="text-neutral-600 dark:text-white/60 hover:text-red-500 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          </button>
          <button className="text-neutral-600 dark:text-white/60">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          </button>
          <button className="text-neutral-600 dark:text-white/60">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
          </button>
          <div className="flex-1" />
          <button className="text-neutral-600 dark:text-white/60">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
          </button>
        </div>

        {/* Caption + hashtags */}
        <div className="px-4 py-3">
          {post.engagement_data && (
            <div className="text-xs font-semibold text-neutral-900 dark:text-white mb-1">
              {(post.engagement_data.likes || 0).toLocaleString()} J&apos;aime
            </div>
          )}
          <p className="text-sm text-neutral-800 dark:text-white/80 leading-relaxed whitespace-pre-wrap">
            {post.caption || post.hook || 'Legende en cours de generation...'}
          </p>
          {hashtags && <p className="text-sm text-blue-500 mt-2">{hashtags}</p>}
        </div>

        {/* Actions (draft) */}
        {isDraft && (onApprove || onPublish || onSkip) && (
          <div className="px-4 pb-4 flex gap-2">
            {onApprove && <button onClick={() => { onApprove(); onClose(); }} className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-500 transition min-h-[40px]">{'\u2705'} Valider</button>}
            {onPublish && <button onClick={() => { onPublish(); onClose(); }} className="flex-1 py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-500 transition min-h-[40px]">{'\u{1F680}'} Publier</button>}
            {onSkip && <button onClick={() => { onSkip(); onClose(); }} className="py-2.5 px-4 bg-white/10 text-white/40 text-xs rounded-xl hover:bg-white/15 transition min-h-[40px]">Ignorer</button>}
          </div>
        )}
      </div>
    </div>
  );
}
