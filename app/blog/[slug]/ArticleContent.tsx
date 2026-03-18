'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface ArticleContentProps {
  html: string;
  headings: Array<{ id: string; text: string; level: number }>;
}

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = document.getElementById('article-body');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.scrollHeight - window.innerHeight;
      const scrolled = -rect.top;
      setProgress(Math.min(100, Math.max(0, (scrolled / total) * 100)));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-purple-500 to-[#0c1a3a] transition-all duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export function TableOfContents({ headings }: { headings: ArticleContentProps['headings'] }) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -80% 0px' }
    );

    headings.forEach(h => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav className="hidden xl:block fixed right-[max(1rem,calc((100vw-768px)/2-280px))] top-32 w-56 max-h-[calc(100vh-160px)] overflow-y-auto">
      <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-3">Sommaire</p>
      <ul className="space-y-1.5">
        {headings.map(h => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`block text-[12px] leading-snug transition-all duration-200 border-l-2 ${
                h.level === 3 ? 'pl-5' : 'pl-3'
              } ${
                activeId === h.id
                  ? 'border-purple-500 text-purple-700 font-medium'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-300'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileTableOfContents({ headings }: { headings: ArticleContentProps['headings'] }) {
  const [open, setOpen] = useState(false);

  if (headings.length < 3) return null;

  return (
    <div className="xl:hidden mb-8">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-3 transition-colors"
      >
        <span className="text-sm font-semibold text-neutral-700">Sommaire</span>
        <svg
          className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <nav className="mt-2 bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <ul className="space-y-2">
            {headings.map(h => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`block text-sm text-neutral-600 hover:text-purple-600 transition-colors ${
                    h.level === 3 ? 'pl-4' : ''
                  }`}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

export function ArticleBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    // Handle broken images with elegant fallback
    const images = ref.current.querySelectorAll('img');
    images.forEach((img) => {
      // Style all images as figures with captions
      const alt = img.getAttribute('alt') || '';

      // Remove inline styles from AI-generated images, let CSS handle it
      img.removeAttribute('style');
      img.classList.add(
        'w-full', 'rounded-xl', 'shadow-lg', 'my-0',
        'transition-all', 'duration-500', 'ease-out'
      );
      img.setAttribute('loading', 'lazy');

      // Wrap in figure with caption if not already wrapped
      if (img.parentElement?.tagName !== 'FIGURE') {
        const figure = document.createElement('figure');
        figure.className = 'my-10 sm:my-14 not-prose -mx-4 sm:-mx-8 md:-mx-12';

        const wrapper = document.createElement('div');
        wrapper.className = 'relative overflow-hidden rounded-2xl shadow-xl bg-neutral-100 ring-1 ring-neutral-200/50';

        img.parentElement?.insertBefore(figure, img);
        wrapper.appendChild(img);
        figure.appendChild(wrapper);

        if (alt && alt.length > 10) {
          const caption = document.createElement('figcaption');
          caption.className = 'text-center text-xs text-neutral-400 mt-3 italic px-4';
          caption.textContent = alt;
          figure.appendChild(caption);
        }
      }

      // Broken image handler — elegant gradient placeholder
      img.onerror = () => {
        const parent = img.closest('figure') || img.parentElement;
        if (parent) {
          parent.innerHTML = `
            <div class="w-full rounded-2xl bg-gradient-to-br from-purple-100 via-[#0c1a3a]/5 to-indigo-100 border border-purple-200/50 flex items-center justify-center py-20 px-8 shadow-inner">
              <div class="text-center max-w-md">
                <div class="w-16 h-16 rounded-2xl bg-white/80 shadow-sm flex items-center justify-center mx-auto mb-4">
                  <svg class="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p class="text-sm text-purple-500 font-semibold mb-1">${alt || 'Illustration'}</p>
                <p class="text-xs text-purple-400/70">Image en cours de regeneration...</p>
              </div>
            </div>
          `;
        }
      };

      // Add subtle load animation
      img.onload = () => {
        img.classList.add('opacity-100');
        img.classList.remove('opacity-0');
      };
      img.classList.add('opacity-0');
      // If already loaded (cached), show immediately
      if (img.complete && img.naturalWidth > 0) {
        img.classList.remove('opacity-0');
        img.classList.add('opacity-100');
      }
    });

    // Style tables for better readability
    const tables = ref.current.querySelectorAll('table');
    tables.forEach((table) => {
      if (!table.parentElement?.classList.contains('table-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper my-8 overflow-x-auto rounded-xl border border-neutral-200 shadow-sm not-prose';
        table.parentElement?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
        table.className = 'w-full text-sm';
        table.querySelectorAll('th').forEach(th => {
          th.className = 'bg-neutral-50 text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider border-b';
        });
        table.querySelectorAll('td').forEach(td => {
          td.className = 'px-4 py-3 text-neutral-700 border-b border-neutral-100';
        });
      }
    });

    // Add anchor links to headings
    const headingEls = ref.current.querySelectorAll('h2, h3');
    headingEls.forEach((h) => {
      if (h.id) {
        h.classList.add('scroll-mt-24', 'group', 'relative');
        // Don't add anchor link if already exists
        if (!h.querySelector('.heading-anchor')) {
          const anchor = document.createElement('a');
          anchor.href = `#${h.id}`;
          anchor.className = 'heading-anchor absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-purple-400 hover:text-purple-600';
          anchor.innerHTML = '#';
          anchor.setAttribute('aria-hidden', 'true');
          h.insertBefore(anchor, h.firstChild);
        }
      }
    });
  }, [html]);

  return (
    <div
      ref={ref}
      id="article-body"
      className="prose prose-lg prose-neutral max-w-none
        prose-headings:text-neutral-900 prose-headings:font-bold prose-headings:tracking-tight
        prose-h2:text-[1.75rem] prose-h2:mt-16 prose-h2:mb-6 prose-h2:pb-4 prose-h2:border-b prose-h2:border-neutral-100
        prose-h3:text-xl prose-h3:mt-12 prose-h3:mb-4
        prose-p:text-neutral-600 prose-p:leading-[1.9] prose-p:mb-6 prose-p:text-[1.05rem]
        prose-a:text-purple-600 prose-a:font-medium prose-a:no-underline prose-a:border-b prose-a:border-purple-200 hover:prose-a:border-purple-500 prose-a:transition-colors
        prose-ul:my-6 prose-ul:space-y-2 prose-li:text-neutral-600 prose-li:leading-relaxed
        prose-ol:my-6 prose-ol:space-y-2
        prose-strong:text-neutral-800 prose-strong:font-semibold
        prose-blockquote:border-l-4 prose-blockquote:border-purple-400 prose-blockquote:bg-gradient-to-r prose-blockquote:from-purple-50 prose-blockquote:to-transparent prose-blockquote:py-5 prose-blockquote:px-6 prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:text-neutral-700 prose-blockquote:my-10
        prose-code:text-purple-700 prose-code:bg-purple-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function ShareButtons({ title, slug }: { title: string; slug: string }) {
  const url = `https://www.keiroai.com/blog/${slug}`;

  const share = (platform: string) => {
    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    };
    window.open(urls[platform], '_blank', 'width=600,height=400');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById('copy-link-btn');
      if (btn) {
        btn.textContent = 'Copie !';
        setTimeout(() => { btn.textContent = 'Copier le lien'; }, 2000);
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-medium text-neutral-400">Partager :</span>
      <button onClick={() => share('linkedin')} className="text-neutral-400 hover:text-[#1e3a5f] transition-colors" title="LinkedIn">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      </button>
      <button onClick={() => share('twitter')} className="text-neutral-400 hover:text-neutral-800 transition-colors" title="X/Twitter">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </button>
      <button onClick={() => share('facebook')} className="text-neutral-400 hover:text-[#0c1a3a] transition-colors" title="Facebook">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </button>
      <button id="copy-link-btn" onClick={copyLink} className="text-xs text-neutral-400 hover:text-purple-600 transition-colors border border-neutral-200 rounded-full px-3 py-1 hover:border-purple-300">
        Copier le lien
      </button>
    </div>
  );
}
