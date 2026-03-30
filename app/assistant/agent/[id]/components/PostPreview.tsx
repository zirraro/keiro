'use client';

/**
 * PostPreview — Instagram/TikTok/LinkedIn-like preview of a post.
 * Shows the post exactly as it will appear on the platform.
 */

interface PostPreviewProps {
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
    slides?: Array<{ text: string }>;
    scheduled_date?: string;
    scheduled_time?: string;
    engagement_data?: { likes?: number; comments?: number; shares?: number; saves?: number };
  };
  onApprove?: () => void;
  onPublish?: () => void;
  onSkip?: () => void;
  compact?: boolean;
}

export default function PostPreview({ post, onApprove, onPublish, onSkip, compact }: PostPreviewProps) {
  const isIG = !post.platform || post.platform === 'instagram';
  const isTT = post.platform === 'tiktok';
  const isLI = post.platform === 'linkedin';
  const isCarousel = post.format === 'carrousel' || post.format === 'carousel';
  const isStory = post.format === 'story';
  const isReel = post.format === 'reel' || post.format === 'video';
  const isDraft = post.status === 'draft';
  const isPublished = post.status === 'published';

  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : (post.hashtags || '');

  return (
    <div className={`rounded-lg overflow-hidden border ${isDraft ? 'border-amber-500/30' : isPublished ? 'border-emerald-500/20' : 'border-white/10'} bg-white dark:bg-white/5 ${compact ? 'text-[10px]' : 'max-w-sm'}`}>
      {/* Platform badge */}
      <div className={`flex items-center gap-1.5 ${compact ? 'px-2 py-1' : 'px-3 py-2'} border-b border-neutral-100 dark:border-white/5`}>
        <div className={`${compact ? 'w-5 h-5 text-[8px]' : 'w-7 h-7 text-[10px]'} rounded-full flex items-center justify-center text-white font-bold ${
          isIG ? 'bg-gradient-to-br from-purple-600 to-pink-500' :
          isTT ? 'bg-black' :
          'bg-[#0A66C2]'
        }`}>
          {isIG ? 'IG' : isTT ? 'TT' : 'LI'}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`${compact ? 'text-[9px]' : 'text-xs'} font-semibold text-neutral-800 dark:text-white`}>Mon business</span>
          {isStory && <span className="ml-1.5 text-[9px] bg-gradient-to-r from-amber-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full">Story</span>}
          {isReel && <span className="ml-1.5 text-[9px] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full">Reel</span>}
          {isCarousel && <span className="ml-1.5 text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">Carrousel</span>}
        </div>
        {isDraft && <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">Brouillon</span>}
        {isPublished && <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">Publie</span>}
        {post.status === 'approved' && <span className="text-[9px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">Programme</span>}
      </div>

      {/* Visual */}
      <div className={`relative bg-neutral-100 dark:bg-white/10 ${compact ? 'aspect-[4/3]' : isStory ? 'aspect-[9/16]' : 'aspect-square'}`}>
        {post.visual_url ? (
          <img src={post.visual_url} alt="" className="w-full h-full object-cover" />
        ) : post.video_url ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-pink-900/50">
            <div className="text-center">
              <span className="text-4xl">{'\u{1F3AC}'}</span>
              <p className="text-white/50 text-xs mt-2">{isReel ? 'Reel video' : 'Video'}</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center px-6">
              {post.hook && (
                <div className="bg-black/60 backdrop-blur-sm text-white px-4 py-3 rounded-xl text-sm font-bold leading-snug">
                  {post.hook}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Carousel indicator */}
        {isCarousel && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            {[1, 2, 3].map(i => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === 1 ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        )}

        {/* Schedule badge */}
        {post.scheduled_date && !isPublished && (
          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[9px] px-2 py-1 rounded-lg">
            {'\u{1F4C5}'} {post.scheduled_date} {post.scheduled_time || ''}
          </div>
        )}
      </div>

      {/* Caption */}
      <div className={compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}>
        {/* Engagement (published posts) */}
        {isPublished && post.engagement_data && (
          <div className="flex gap-3 mb-2 text-[10px]">
            {post.engagement_data.likes != null && <span className="text-neutral-500 dark:text-white/40">{'\u2764\uFE0F'} {post.engagement_data.likes}</span>}
            {post.engagement_data.comments != null && <span className="text-neutral-500 dark:text-white/40">{'\u{1F4AC}'} {post.engagement_data.comments}</span>}
            {post.engagement_data.saves != null && <span className="text-neutral-500 dark:text-white/40">{'\u{1F516}'} {post.engagement_data.saves}</span>}
          </div>
        )}

        <p className={`${compact ? 'text-[9px] line-clamp-2' : 'text-xs line-clamp-3'} text-neutral-700 dark:text-white/70 leading-relaxed`}>
          {post.caption || post.hook || 'Legende en cours de generation...'}
        </p>
        {hashtags && <p className="text-[10px] text-blue-500 mt-1">{hashtags}</p>}
      </div>

      {/* Actions (draft posts) */}
      {isDraft && (onApprove || onPublish || onSkip) && (
        <div className="px-3 pb-3 flex gap-2">
          {onApprove && <button onClick={onApprove} className="flex-1 py-2 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-500 transition">{'\u2705'} Valider</button>}
          {onPublish && <button onClick={onPublish} className="flex-1 py-2 bg-purple-600 text-white text-[10px] font-bold rounded-lg hover:bg-purple-500 transition">{'\u{1F680}'} Publier</button>}
          {onSkip && <button onClick={onSkip} className="py-2 px-3 bg-white/10 text-white/40 text-[10px] rounded-lg hover:bg-white/15 transition">Ignorer</button>}
        </div>
      )}
    </div>
  );
}
