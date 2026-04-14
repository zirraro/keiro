/**
 * Public demo page for Meta oEmbed Read review.
 *
 * URL to submit to Meta App Review for the `oembed_read` feature:
 *   https://keiroai.com/oembed-demo
 *
 * The reviewer should see: a statically rendered Instagram post embedded
 * via the official instagram.com/embed.js script — the exact use case
 * oEmbed Read enables ("embedding Facebook or Instagram content in
 * websites and apps"). No auth required, no errors.
 */

export const metadata = {
  title: 'KeiroAI — oEmbed Demo',
  description: 'KeiroAI embeds public Instagram posts via the Meta oEmbed Read API for content showcases and social proof widgets.',
};

export const dynamic = 'force-static';

// A public Instagram account / post we can always embed for the demo.
// Using a large public brand (Instagram itself) so the content is
// guaranteed to exist for as long as Instagram exists.
const DEMO_POST_URL = 'https://www.instagram.com/p/C5IfMz1Mqwu/';
const DEMO_PROFILE_URL = 'https://www.instagram.com/instagram/';

export default function OembedDemoPage() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', lineHeight: 1.6, color: '#222', margin: 0, padding: 0, background: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px' }}>
          <header style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, margin: '0 0 8px 0', color: '#0c1a3a' }}>
              KeiroAI — oEmbed Demo
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
              Public demonstration page for Meta App Review of the{' '}
              <strong>oembed_read</strong> feature.
            </p>
          </header>

          <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 12px 0', color: '#111827' }}>
              How KeiroAI uses oembed_read
            </h2>
            <p style={{ margin: '0 0 12px 0', color: '#374151' }}>
              KeiroAI is a marketing-intelligence SaaS for small local businesses.
              When a client publishes a post on Instagram (or TikTok, LinkedIn),
              KeiroAI embeds that post back into the client&apos;s workspace gallery
              as social proof, and optionally on their public landing page via a
              widget.
            </p>
            <p style={{ margin: '0 0 12px 0', color: '#374151' }}>
              We use the <strong>Meta oEmbed Read</strong> endpoint
              (<code>graph.facebook.com/v25.0/instagram_oembed</code>) to fetch
              the canonical embed HTML for a given public post URL, then render
              it inside our React components using the official
              <code> instagram.com/embed.js</code> script.
            </p>
            <p style={{ margin: 0, color: '#374151' }}>
              Server route that proxies oEmbed:{' '}
              <a href="/api/oembed" style={{ color: '#0066cc' }}>/api/oembed</a>
              {' '}(see the query param <code>?url=...</code>).
            </p>
          </section>

          <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 12px 0', color: '#111827' }}>
              Live embed example
            </h2>
            <p style={{ margin: '0 0 16px 0', color: '#374151', fontSize: 14 }}>
              Below is a public Instagram post rendered through the official
              embed script. This is exactly what a KeiroAI client sees in the
              workspace gallery when we pull a post via the Meta oEmbed Read
              API.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <blockquote
                className="instagram-media"
                data-instgrm-permalink={DEMO_POST_URL}
                data-instgrm-version="14"
                style={{
                  background: '#FFF',
                  border: 0,
                  borderRadius: 3,
                  boxShadow: '0 0 1px rgba(0,0,0,0.5), 0 1px 10px rgba(0,0,0,0.15)',
                  margin: 0,
                  maxWidth: 540,
                  minWidth: 326,
                  padding: 0,
                  width: '100%',
                }}
              >
                <a href={DEMO_POST_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>
                  View this post on Instagram
                </a>
              </blockquote>
            </div>
            <script async src="https://www.instagram.com/embed.js"></script>
          </section>

          <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 12px 0', color: '#111827' }}>
              Try it yourself
            </h2>
            <p style={{ margin: '0 0 12px 0', color: '#374151' }}>
              Paste any public Instagram post URL to the server route and it
              returns the oEmbed payload we consume:
            </p>
            <pre style={{ background: '#f3f4f6', padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 13 }}>
{`GET /api/oembed?url=${DEMO_POST_URL}`}
            </pre>
            <p style={{ margin: '12px 0 0 0', color: '#374151' }}>
              Source profile used in this demo:{' '}
              <a href={DEMO_PROFILE_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>
                @instagram
              </a>
            </p>
          </section>

          <footer style={{ marginTop: 32, color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>
            KeiroAI — <a href="https://keiroai.com" style={{ color: '#9ca3af' }}>keiroai.com</a>
          </footer>
      </div>
    </div>
  );
}
