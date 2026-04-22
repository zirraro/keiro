'use client';

import { useState } from 'react';

/**
 * "Artifact-style" live mockup of a social post, modeled on Instagram's
 * feed card. When an agent (Léna, Jade) sends a draft in the chat, we
 * render this side-by-side with the text so the user sees what the
 * actual publication will look like before approving.
 *
 * This is KeiroAI's answer to Claude Artifacts — interactive, in-place
 * preview that turns a tool output into something tangible. Not HTML
 * from Claude Design; a purpose-built component matched to each social
 * format.
 */
export interface PostArtifact {
  platform: 'instagram' | 'tiktok' | 'linkedin';
  format: 'post' | 'carousel' | 'carrousel' | 'story' | 'reel' | 'text' | 'video';
  hook?: string;
  caption?: string;
  hashtags?: string[];
  visual_url?: string | null;
  /** Carousel slides — each can be a URL or a caption+url pair */
  slides?: Array<string | { url?: string; text?: string }>;
  /** Optional brand colour override in hex (#xxxxxx) — else violet KeiroAI */
  accent?: string;
}

const PLATFORM_ICON: Record<string, string> = {
  instagram: '\u{1F4F8}',
  tiktok: '\u{1F3B5}',
  linkedin: '\u{1F4BC}',
};

export default function PostArtifactPreview({ post, onPublish, onRegenerate }: {
  post: PostArtifact;
  onPublish?: () => void;
  onRegenerate?: () => void;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const accent = post.accent || '#7c3aed';

  const slides = post.slides && post.slides.length > 0
    ? post.slides.map(s => typeof s === 'string' ? { url: s, text: '' } : s)
    : null;

  const isStory = post.format === 'story';
  const isReel = post.format === 'reel' || post.format === 'video';
  const isCarousel = post.format === 'carousel' || post.format === 'carrousel';

  /** Visual height per format — stories/reels are 9:16, posts 1:1, linkedin 16:9 */
  const aspectClass = isStory || isReel
    ? 'aspect-[9/16] max-w-[220px]'
    : post.platform === 'linkedin' && post.format === 'text'
      ? 'aspect-[16/9] max-w-full'
      : 'aspect-square max-w-full';

  const currentUrl = slides
    ? slides[slideIndex]?.url
    : post.visual_url;

  const hashtagsLine = (post.hashtags || []).slice(0, 8).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');

  return (
    <div className="mt-2 rounded-xl border border-white/15 bg-gradient-to-b from-white/[0.04] to-white/[0.02] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-base">{PLATFORM_ICON[post.platform] || '\u2728'}</span>
          <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wide">
            {post.platform} · {post.format}
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full border text-white/80 border-white/20 bg-white/5">
          Preview
        </span>
      </div>

      {/* Visual */}
      <div className="p-3">
        <div
          className={`${aspectClass} mx-auto rounded-lg overflow-hidden relative`}
          style={{
            background: currentUrl
              ? undefined
              : `linear-gradient(135deg, ${accent}33, ${accent}88)`,
          }}
        >
          {currentUrl ? (
            <img src={currentUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-white/80">
              <p className="text-xs leading-snug">
                {post.hook || (slides && slides[slideIndex]?.text) || 'Visuel en cours de génération…'}
              </p>
            </div>
          )}

          {/* Story/reel overlay gradient for readability */}
          {(isStory || isReel) && (
            <>
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
              {/* Story progress bar */}
              {isStory && slides && slides.length > 1 && (
                <div className="absolute top-1.5 inset-x-2 flex gap-1">
                  {slides.map((_, i) => (
                    <div key={i} className="flex-1 h-0.5 bg-white/30 rounded overflow-hidden">
                      <div className="h-full bg-white" style={{ width: i <= slideIndex ? '100%' : '0%' }} />
                    </div>
                  ))}
                </div>
              )}
              {/* Play icon for reel */}
              {isReel && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                    <svg className="w-5 h-5 text-black ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Hook overlay on story/reel */}
          {(isStory || isReel) && post.hook && (
            <div className="absolute bottom-6 inset-x-2 text-center">
              <p className="inline-block bg-black/70 backdrop-blur px-2 py-1 rounded-md text-[10px] font-bold text-white">
                {post.hook}
              </p>
            </div>
          )}
        </div>

        {/* Carousel dots */}
        {isCarousel && slides && slides.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIndex(i)}
                className={`rounded-full transition-all ${
                  i === slideIndex ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Carousel nav arrows */}
        {isCarousel && slides && slides.length > 1 && (
          <div className="flex items-center justify-between mt-1">
            <button
              onClick={() => setSlideIndex(Math.max(0, slideIndex - 1))}
              disabled={slideIndex === 0}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center"
            >
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-[10px] text-white/50">{slideIndex + 1}/{slides.length}</span>
            <button
              onClick={() => setSlideIndex(Math.min(slides.length - 1, slideIndex + 1))}
              disabled={slideIndex >= slides.length - 1}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center"
            >
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}

        {/* Caption + hashtags */}
        {(post.caption || hashtagsLine) && !isStory && (
          <div className="mt-3 text-[11px] text-white/80 leading-relaxed">
            {post.caption && (
              <p className="whitespace-pre-wrap">{post.caption}</p>
            )}
            {hashtagsLine && (
              <p className="mt-1.5 text-[10px] text-blue-300">{hashtagsLine}</p>
            )}
          </div>
        )}

        {/* Fake like/comment bar to sell the mockup */}
        {post.platform === 'instagram' && !isStory && (
          <div className="mt-3 flex items-center gap-4 text-white/50">
            <span className="flex items-center gap-1 text-[10px]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" /></svg>
              —
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              —
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </span>
          </div>
        )}
      </div>

      {/* Action bar */}
      {(onPublish || onRegenerate) && (
        <div className="flex items-center gap-2 p-2 border-t border-white/10 bg-white/[0.02]">
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="flex-1 py-2 text-[11px] font-medium rounded-lg bg-white/5 hover:bg-white/10 text-white/80 transition"
            >
              \u21BB Régénérer
            </button>
          )}
          {onPublish && (
            <button
              onClick={onPublish}
              className="flex-1 py-2 text-[11px] font-semibold rounded-lg text-white transition hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)` }}
            >
              Publier maintenant
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Parse `[POST_PREVIEW:{...json...}]` tags out of an agent response so
 * AgentChatPanel can render them as artifacts. Supports multi-line JSON
 * and multiple tags in one message. Returns the cleaned text + list of
 * parsed artifacts in order.
 */
export function extractPostArtifacts(content: string): {
  cleanText: string;
  artifacts: PostArtifact[];
} {
  const artifacts: PostArtifact[] = [];
  const cleaned = content.replace(
    /\[POST_PREVIEW:\s*(\{[\s\S]*?\})\s*\]/g,
    (_, json: string) => {
      try {
        const parsed = JSON.parse(json);
        artifacts.push(parsed as PostArtifact);
      } catch (err) {
        // If the agent produces malformed JSON, keep the raw tag visible
        // so the user sees something went wrong.
        return `[POST_PREVIEW parsing failed]`;
      }
      return '';
    },
  );
  return { cleanText: cleaned.trim(), artifacts };
}
