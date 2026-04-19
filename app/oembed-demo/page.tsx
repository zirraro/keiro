/**
 * Public demo page for the Meta oEmbed Read permission review.
 * Reviewers paste an Instagram post URL, the app calls /api/oembed
 * (which proxies https://graph.facebook.com/.../instagram_oembed) and
 * renders the returned embed HTML below — demonstrating that KeiroAI
 * actually uses the oEmbed permission for post previews.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

const DEFAULT_URL = 'https://www.instagram.com/p/DXUcafUkRU2/';

export default function OembedDemoPage() {
  // Meta App Review hint: a reviewer can pass ?url=<ig_or_fb_url> and the
  // page auto-loads the embed without any clicks — important because the
  // v1 submission got rejected for "URL leads to an error page" when the
  // reviewer didn't realise they had to paste the URL manually first.
  const initialUrl = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('url') || DEFAULT_URL)
    : DEFAULT_URL;
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [raw, setRaw] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEmbed = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    setHtml(null);
    setTitle(null);
    setAuthor(null);
    setThumbnail(null);
    setRaw(null);
    try {
      const res = await fetch(`/api/oembed?url=${encodeURIComponent(target)}`);
      const data = await res.json();
      setRaw(data);
      setHtml(data.html || null);
      setTitle(data.title || null);
      setAuthor(data.author_name || null);
      setThumbnail(data.thumbnail_url || null);
      if (!res.ok) setError(`HTTP ${res.status}`);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmbed(initialUrl); }, [fetchEmbed, initialUrl]);

  // Inject Instagram's embed.js once the oEmbed HTML lands so the
  // blockquote is upgraded to a real post preview.
  useEffect(() => {
    if (!html) return;
    if ((window as any).instgrm?.Embeds?.process) {
      (window as any).instgrm.Embeds.process();
      return;
    }
    const id = 'instagram-embed-script';
    if (document.getElementById(id)) return;
    const s = document.createElement('script');
    s.id = id;
    s.async = true;
    s.src = 'https://www.instagram.com/embed.js';
    document.body.appendChild(s);
  }, [html]);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">KeiroAI &mdash; Instagram oEmbed demo</h1>
        <p className="text-sm text-white/60 mb-6">
          This public page demonstrates how KeiroAI uses Meta&apos;s{' '}
          <code className="text-white/80">oEmbed Read</code> permission. We take a public Instagram
          URL, call our <code className="text-white/80">/api/oembed</code> endpoint which proxies{' '}
          <code className="text-white/80">graph.facebook.com/instagram_oembed</code>, and render
          the official post preview inside our client workspace (used in KeiroAI&apos;s content
          inspiration and published-post confirmation views).
        </p>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-6">
          <label className="text-xs uppercase tracking-wider text-white/40 block mb-2">
            Instagram post URL
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="flex-1 bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm"
              placeholder="https://www.instagram.com/p/..."
            />
            <button
              onClick={() => fetchEmbed(url)}
              disabled={loading || !url}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-semibold"
            >
              {loading ? 'Loading...' : 'Preview'}
            </button>
          </div>
          <p className="text-[11px] text-white/40 mt-2">
            Default example: {DEFAULT_URL}
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm p-3 mb-6">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50 mb-3">
            Rendered preview (oEmbed HTML)
          </h2>
          {html ? (
            <div
              className="oembed-wrapper"
              // The oEmbed HTML is returned directly by Meta and is what a
              // client sees inside KeiroAI when browsing inspiration posts.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="text-white/40 text-sm italic">No preview yet.</div>
          )}
        </section>

        {(title || author || thumbnail) && (
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50 mb-3">
              Parsed oEmbed metadata
            </h2>
            <dl className="text-sm space-y-1 text-white/70">
              {title && (<div><dt className="inline font-semibold">Title: </dt><dd className="inline">{title}</dd></div>)}
              {author && (<div><dt className="inline font-semibold">Author: </dt><dd className="inline">{author}</dd></div>)}
              {thumbnail && (
                <div className="mt-3"><dt className="font-semibold mb-1">Thumbnail:</dt>
                  <dd><img src={thumbnail} alt="thumbnail" className="rounded-lg max-w-xs" /></dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {raw && (
          <details className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <summary className="text-sm text-white/50 cursor-pointer">Raw oEmbed JSON response</summary>
            <pre className="text-[11px] text-white/60 mt-3 overflow-x-auto">
              {JSON.stringify(raw, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
