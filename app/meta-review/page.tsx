/**
 * Public reviewer landing page for the Meta App Review process.
 *
 * Reviewers paste this URL into a browser and get:
 *  - Exact credentials they need
 *  - One-click "Login as reviewer" link with locale=en pre-set
 *  - Step-by-step paths to exercise each permission end-to-end
 *  - The text we ask Meta to read in the "Instructions for Reviewer" form
 *
 * This page is intentionally OUTSIDE any auth-protected route so a reviewer
 * who lands here from a Meta dashboard URL can see everything without first
 * being asked to sign up — that was the rejection reason on the May 9 review.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KeiroAI — Meta App Review reviewer guide',
  robots: { index: false, follow: false },
  description:
    'Public guide for Meta App Review reviewers. Contains test credentials, login link, and step-by-step instructions to exercise every permission requested.',
};

const REVIEWER_EMAIL = 'metareview@keiroai.com';
const REVIEWER_PASSWORD = 'METAREVIEW2026';
const SITE = 'https://keiroai.com';

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
      {n}
    </span>
    <div className="flex-1">
      <div className="font-semibold text-neutral-900">{title}</div>
      <div className="text-sm text-neutral-600 mt-1">{children}</div>
    </div>
  </li>
);

export default function MetaReviewPage() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-widest text-blue-700 font-semibold mb-2">
            For Meta App Review reviewers
          </p>
          <h1 className="text-3xl font-bold text-neutral-900">KeiroAI — reviewer guide</h1>
          <p className="text-neutral-600 mt-3 max-w-2xl">
            Welcome. This page is public and dedicated to the Meta App Review team.
            It contains the test credentials, the English-language entry link, and the
            exact path to exercise each permission KeiroAI is requesting. No signup
            is required to read this page.
          </p>
        </header>

        <section className="bg-white border border-neutral-200 rounded-2xl p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900 mb-4">1. Test credentials</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Email</div>
              <div className="font-mono text-sm bg-neutral-100 px-3 py-2 rounded select-all">{REVIEWER_EMAIL}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Password</div>
              <div className="font-mono text-sm bg-neutral-100 px-3 py-2 rounded select-all">{REVIEWER_PASSWORD}</div>
            </div>
          </div>
          <a
            href={`${SITE}/login?lang=en&redirect=%2Fassistant`}
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm"
          >
            Open the login page (English)
          </a>
          <p className="text-xs text-neutral-500 mt-3">
            The link above opens the login form in English (<code>?lang=en</code>) and
            redirects you to the workspace dashboard after sign-in. The reviewer
            account is already pre-provisioned with an Instagram Business account
            (<strong>@keiro_ai</strong>) and a connected Facebook Page (<strong>KeiroAI</strong>),
            so you do not have to perform the Meta login flow manually unless you
            wish to verify it.
          </p>
        </section>

        <section className="bg-white border border-neutral-200 rounded-2xl p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900 mb-1">2. What KeiroAI is</h2>
          <p className="text-sm text-neutral-700 leading-relaxed">
            KeiroAI is a workspace that small local business owners — restaurants,
            hair salons, florists, retail shops — use to manage their Instagram
            customer service, content publishing, and analytics. The product is a
            human-in-the-loop assistant: our AI drafts message replies, content
            captions and comment responses; the business owner reviews each draft
            and clicks <em>Send</em> / <em>Publish</em>. There is no automatic send
            outside of an explicit human click, and we maintain an audit log
            showing the user_id of the human who triggered each Graph API call.
          </p>
        </section>

        <section className="bg-white border border-neutral-200 rounded-2xl p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900 mb-4">3. End-to-end paths per permission</h2>

          <h3 className="text-base font-semibold text-neutral-900 mt-4 mb-3">
            instagram_business_basic — connect an IG Business account
          </h3>
          <ol className="space-y-3 mb-6">
            <Step n={1} title="Sign in with the credentials in section 1.">
              You land on <code>/assistant</code>, the workspace dashboard.
            </Step>
            <Step n={2} title="Open the Instagram badge in the top-right.">
              The reviewer account is already connected to <strong>@keiro_ai</strong>.
              The badge displays the IG Business account ID (17841476766717246) and
              the FB page ID (772774919255471).
            </Step>
            <Step n={3} title="Disconnect &amp; reconnect to see the full Meta login flow.">
              Click <em>Disconnect Instagram</em> in <em>Settings → Connections</em>,
              then click <em>Connect Instagram Business</em>. This opens the
              standard Facebook OAuth dialog where you select the Page and IG
              Business account to grant access.
            </Step>
          </ol>

          <h3 className="text-base font-semibold text-neutral-900 mt-6 mb-3">
            instagram_business_manage_messages — send a DM end-to-end
          </h3>
          <ol className="space-y-3 mb-6">
            <Step n={1} title="Open the workspace inbox.">
              In the workspace, open the <em>Jade — DMs</em> panel from the agent
              list. Recent inbound DMs appear there, fetched via the Graph API.
            </Step>
            <Step n={2} title="Compose a draft.">
              Click <em>Generate reply</em>. Jade composes a draft based on the
              business context. The draft is shown to you for review.
            </Step>
            <Step n={3} title="Click Send — this is the only time we call the Graph API.">
              The button is the manual human action. We POST to
              <code> /me/messages</code> with the reviewed text. We log the
              triggering user_id alongside the message_id.
            </Step>
            <Step n={4} title="Verify on Instagram.">
              Open Instagram on a second device or the web app, log in as the
              recipient account, and confirm the message has arrived.
            </Step>
          </ol>

          <h3 className="text-base font-semibold text-neutral-900 mt-6 mb-3">
            instagram_business_content_publish — publish a post end-to-end
          </h3>
          <ol className="space-y-3 mb-6">
            <Step n={1} title="Open the content library.">
              Go to <em>Library → Instagram</em>. Pre-generated post drafts (image
              + caption) are displayed.
            </Step>
            <Step n={2} title="Pick a draft and click Publish now.">
              The button triggers a server call to
              <code> /api/library/instagram/publish</code> which (a) creates a
              container via <code>/{`<ig-id>`}/media</code>, (b) publishes via
              <code> /{`<ig-id>`}/media_publish</code>. The image bytes were
              produced by KeiroAI&apos;s content generator earlier; the caption
              was approved by the human reviewer.
            </Step>
            <Step n={3} title="Verify on Instagram.">
              Open <code>https://instagram.com/keiro_ai</code> in another tab.
              The new post appears at the top of the feed within ~10 seconds.
              KeiroAI also surfaces the published post URL inside the workspace
              with a green &quot;Published&quot; badge.
            </Step>
          </ol>

          <h3 className="text-base font-semibold text-neutral-900 mt-6 mb-3">
            instagram_business_manage_insights — read post / account analytics
          </h3>
          <ol className="space-y-3 mb-6">
            <Step n={1} title="Open the Léna analytics dashboard.">
              Click the <em>Léna — Analytics</em> agent in the workspace. The
              dashboard fetches metrics from
              <code> /{`<ig-id>`}/insights?metric=...&period=...</code> for the
              connected IG Business account.
            </Step>
            <Step n={2} title="Inspect a single post.">
              Click any post tile. KeiroAI calls
              <code> /{`<media-id>`}/insights?metric=impressions,reach,engagement</code>
              and renders a per-post breakdown.
            </Step>
            <Step n={3} title="Verify the same numbers in Instagram.">
              In the native Instagram app, open the same post → <em>View Insights</em>.
              The figures match what KeiroAI shows.
            </Step>
          </ol>

          <h3 className="text-base font-semibold text-neutral-900 mt-6 mb-3">
            instagram_business_manage_comments — moderate &amp; reply to comments
          </h3>
          <ol className="space-y-3 mb-6">
            <Step n={1} title="Open the Axel — Comments panel.">
              KeiroAI fetches recent comments via
              <code> /{`<media-id>`}/comments</code> for the latest published posts.
              They are listed inside the workspace with the original commenter
              handle, text, and timestamp.
            </Step>
            <Step n={2} title="Click Generate reply on any comment.">
              Axel composes a personalised reply draft. You review it.
            </Step>
            <Step n={3} title="Click Send reply — the human-triggered API call.">
              We POST to <code>/{`<comment-id>`}/replies</code>. The reply
              appears under the original comment.
            </Step>
            <Step n={4} title="Verify on Instagram.">
              Refresh the post on Instagram natively — the reply is visible there
              with @keiro_ai as the author.
            </Step>
          </ol>

          <h3 className="text-base font-semibold text-neutral-900 mt-6 mb-3">
            human_agent — replying to a customer &gt; 24h after their last message
          </h3>
          <ol className="space-y-3 mb-6">
            <Step n={1} title="Open a thread that is older than 24 hours.">
              In the Jade DMs panel, locate a conversation where the last
              customer message was received more than 24h ago. KeiroAI shows a
              banner: &quot;Outside the standard 24h window — the human owner
              must explicitly approve.&quot;
            </Step>
            <Step n={2} title="The human reviews and edits the suggested draft.">
              The owner edits the AI draft if needed. Nothing is sent yet.
            </Step>
            <Step n={3} title="Click Send as Human Agent — manual click only.">
              KeiroAI calls the Graph API with the
              <code> messaging_type=MESSAGE_TAG</code> +
              <code> tag=HUMAN_AGENT</code> parameters because the human owner
              is replying to a legitimate customer-service inquiry. The audit
              log captures user_id, timestamp, and conversation_id.
            </Step>
            <Step n={4} title="Verify the message lands in Instagram.">
              Confirm on the native Instagram app that the message was delivered.
            </Step>
          </ol>

          <h3 className="text-base font-semibold text-neutral-900 mt-6 mb-3">
            Meta oEmbed Read
          </h3>
          <p className="text-sm text-neutral-700 mb-3">
            Open <a className="text-blue-700 underline" href="/oembed-demo">/oembed-demo</a> —
            paste any public Instagram or Facebook post URL, click <em>Preview</em>.
            We call <code>/api/oembed</code> which proxies
            <code> graph.facebook.com/instagram_oembed</code> and renders the embed
            HTML. We use this same call inside the workspace to preview
            inspiration posts and confirmation thumbnails of just-published content.
          </p>
        </section>

        <section className="bg-white border border-neutral-200 rounded-2xl p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900 mb-3">4. Human-in-the-loop guarantees</h2>
          <ul className="text-sm text-neutral-700 space-y-2 list-disc pl-5">
            <li>
              No Graph API call that creates outbound content (DM, comment reply,
              publish) runs without a manual human click. There is no cron-based
              auto-send.
            </li>
            <li>
              Each Graph call is logged with the triggering user_id so we can
              audit compliance if Meta requests it.
            </li>
            <li>
              Read-only calls (insights, list comments, list messages) run
              periodically to keep the workspace fresh, and never produce content
              visible to end-users on Instagram.
            </li>
            <li>
              The reviewer account does NOT have admin override (<code>is_admin = false</code>),
              so you experience exactly what a regular small-business customer
              experiences.
            </li>
          </ul>
        </section>

        <section className="bg-white border border-neutral-200 rounded-2xl p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900 mb-3">5. Data deletion &amp; deauthorization</h2>
          <p className="text-sm text-neutral-700">
            User data deletion endpoint: <code>{SITE}/api/auth/data-deletion</code>.
            Deauthorization callback: <code>{SITE}/api/auth/deauthorize</code>.
            Both are configured in the Meta app dashboard. Test users can also
            disconnect their account from <em>Settings → Connections → Disconnect</em>,
            which removes the IG Business token from our database immediately.
          </p>
        </section>

        <section className="bg-white border border-neutral-200 rounded-2xl p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900 mb-3">6. Contact</h2>
          <p className="text-sm text-neutral-700">
            For any access issue while reviewing, please email{' '}
            <a className="text-blue-700 underline" href="mailto:contact@keiroai.com">
              contact@keiroai.com
            </a>{' '}
            and we will respond within 24 hours.
          </p>
        </section>

        <footer className="text-xs text-neutral-400 text-center mt-12">
          KeiroAI · Public reviewer guide · Not indexed
        </footer>
      </div>
    </main>
  );
}
