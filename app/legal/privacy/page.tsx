export const metadata = {
  title: 'Privacy Policy | Keiro',
  description: 'Privacy Policy for Keiro application',
  alternates: {
    canonical: 'https://keiroai.com/legal/privacy'
  }
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-neutral-900 mb-8">Privacy Policy</h1>

        <div className="prose prose-neutral max-w-none">
          <p className="text-sm text-neutral-600 mb-8">
            Last updated: June 26, 2026
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">1. Introduction</h2>
            <p className="text-neutral-700 mb-4">
              Keiro ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how
              we collect, use, disclose, and safeguard your information when you use our Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-semibold text-neutral-900 mt-6 mb-3">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li><strong>Account Information:</strong> Email address, name, password</li>
              <li><strong>Business Information:</strong> Business name, type, description</li>
              <li><strong>Content:</strong> Images, text, and other content you create or upload</li>
              <li><strong>Social Media Credentials:</strong> Access tokens for connected platforms (Instagram, TikTok)</li>
            </ul>

            <h3 className="text-xl font-semibold text-neutral-900 mt-6 mb-3">2.2 Automatically Collected Information</h3>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li><strong>Usage Data:</strong> Features used, pages visited, time spent</li>
              <li><strong>Device Information:</strong> Browser type, operating system, IP address</li>
              <li><strong>Log Data:</strong> Error logs, performance metrics</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-neutral-700 mb-4">
              We use the collected information to:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li>Provide and maintain the Service</li>
              <li>Generate AI-powered content suggestions</li>
              <li>Publish content to your connected social media accounts</li>
              <li>Improve and personalize your experience</li>
              <li>Communicate with you about the Service</li>
              <li>Detect and prevent fraud or abuse</li>
              <li>Comply with legal obligations</li>
            </ul>

            <h3 className="text-xl font-semibold text-neutral-900 mt-6 mb-3">3.1 Aggregated &amp; Anonymized Insights</h3>
            <p className="text-neutral-700 mb-4">
              We may use <strong>aggregated and anonymized</strong> performance data (for example, which content
              formats, timings or angles perform well within a business sector) to build benchmarks and improve
              our AI models and recommendations for all users. This data is stripped of any information that could
              identify you or your business, and we apply <strong>k-anonymity</strong>: no insight is ever produced
              or served from a sector segment containing fewer than ten (10) distinct businesses. Aggregated
              insights are never sold with identifying information. You can <strong>opt out</strong> of contributing
              to aggregated insights at any time from your account settings or by contacting{' '}
              <a href="mailto:contact@keiroai.com" className="text-purple-700 underline">contact@keiroai.com</a> —
              opting out does not affect your use of the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">4. Third-Party Services</h2>
            <p className="text-neutral-700 mb-4">
              We integrate with third-party services to provide our functionality:
            </p>

            <h3 className="text-xl font-semibold text-neutral-900 mt-6 mb-3">4.1 Authentication</h3>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li><strong>Supabase:</strong> User authentication and database services</li>
            </ul>

            <h3 className="text-xl font-semibold text-neutral-900 mt-6 mb-3">4.2 AI Services</h3>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li><strong>Anthropic Claude:</strong> AI content generation</li>
            </ul>

            <h3 className="text-xl font-semibold text-neutral-900 mt-6 mb-3">4.3 Social Media Platforms</h3>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li><strong>Instagram (Meta):</strong> Content publishing and analytics</li>
              <li><strong>TikTok:</strong> Content publishing and analytics</li>
            </ul>

            <h3 className="text-xl font-semibold text-neutral-900 mt-6 mb-3">4.4 Google Services &mdash; Gmail &amp; Business Profile (Limited Use)</h3>
            <p className="text-neutral-700 mb-4">
              Keiro lets you optionally connect your Google account so our assistant can operate two
              features on your behalf. These integrations access Google user data only after you
              explicitly grant consent on Google&rsquo;s OAuth screen, and only the minimum scopes
              required:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li>
                <strong>Gmail</strong> &mdash; so you can send prospecting and follow-up emails from your
                own Gmail address, and so our assistant can read incoming replies in order to
                auto-respond on your behalf.
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><code>gmail.send</code> &mdash; send and reply to emails from your address.</li>
                  <li><code>gmail.readonly</code> &mdash; read incoming replies to route them to the auto-reply assistant.</li>
                  <li><code>userinfo.email</code> &mdash; identify the connected mailbox.</li>
                </ul>
              </li>
              <li>
                <strong>Google Business Profile</strong> (<code>business.manage</code>) &mdash; so our assistant
                can read the reviews on your business listing and post replies that you have approved
                or configured.
              </li>
            </ul>
            <p className="text-neutral-700 mb-4">
              <strong>Limited Use.</strong> Keiro&rsquo;s use and transfer to any other app of information
              received from Google APIs will adhere to the{' '}
              <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
                Google API Services User Data Policy
              </a>, including the Limited Use requirements. Specifically:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li>We use Google user data <strong>only</strong> to provide and improve the user-facing features described above.</li>
              <li>We do <strong>not</strong> sell Google user data, and we do <strong>not</strong> use it for advertising.</li>
              <li>We do <strong>not</strong> use Google user data to train, develop, or improve generalized
                  artificial-intelligence or machine-learning models. Any AI generation is performed per-request
                  to serve your feature and is not used to train models.</li>
              <li>We do <strong>not</strong> allow humans to read Google user data except: (a) with your explicit
                  consent, (b) for security purposes (e.g. investigating abuse), (c) to comply with applicable law,
                  or (d) where the data has been aggregated and anonymized for internal operations.</li>
              <li>We do not transfer Google user data to third parties except as necessary to provide or improve
                  these features, to comply with applicable law, or as part of a merger or acquisition with prior
                  notice to you.</li>
              <li>You can revoke Keiro&rsquo;s access at any time from your account settings or from{' '}
                  <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">your Google Account permissions</a>.
                  Tokens are stored encrypted and deleted on disconnection.</li>
            </ul>

            <p className="text-neutral-700 mb-4 mt-4">
              These services have their own privacy policies. We encourage you to review them.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">5. Data Storage and Security</h2>
            <p className="text-neutral-700 mb-4">
              We implement industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li>Encrypted data transmission (HTTPS/TLS)</li>
              <li>Secure database access controls</li>
              <li>Regular security audits and updates</li>
              <li>Access restricted to authorized personnel only</li>
            </ul>
            <p className="text-neutral-700 mb-4">
              However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">6. Social Media Data</h2>
            <p className="text-neutral-700 mb-4">
              When you connect your social media accounts:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li>We access only the data necessary to provide the Service</li>
              <li>We cache images and content to improve performance</li>
              <li>We store access tokens securely and encrypt them</li>
              <li>You can revoke access at any time through your account settings or the social platform</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">7. Data Retention</h2>
            <p className="text-neutral-700 mb-4">
              We retain your data:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li>As long as your account is active</li>
              <li>As necessary to provide the Service</li>
              <li>To comply with legal obligations</li>
              <li>For up to 30 days after account deletion for backup purposes</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">8. Your Rights (GDPR)</h2>
            <p className="text-neutral-700 mb-4">
              If you are in the European Economic Area, you have the right to:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li><strong>Access:</strong> Request copies of your personal data</li>
              <li><strong>Rectification:</strong> Correct inaccurate data</li>
              <li><strong>Erasure:</strong> Request deletion of your data</li>
              <li><strong>Restriction:</strong> Limit how we use your data</li>
              <li><strong>Portability:</strong> Receive your data in a structured format</li>
              <li><strong>Object:</strong> Object to certain data processing</li>
              <li><strong>Withdraw Consent:</strong> Withdraw previously given consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">9. Cookies and Tracking</h2>
            <p className="text-neutral-700 mb-4">
              We use cookies and similar technologies to:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li>Maintain your session</li>
              <li>Remember your preferences</li>
              <li>Analyze Service usage</li>
              <li>Improve performance</li>
            </ul>
            <p className="text-neutral-700 mb-4">
              You can control cookies through your browser settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">10. Children's Privacy</h2>
            <p className="text-neutral-700 mb-4">
              Our Service is not intended for users under 18 years of age. We do not knowingly collect
              information from children. If we discover we have collected data from a child, we will delete it immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">11. International Data Transfers</h2>
            <p className="text-neutral-700 mb-4">
              Your data may be transferred to and processed in countries other than your own. We ensure
              adequate safeguards are in place to protect your data in accordance with this Privacy Policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">12. Changes to This Privacy Policy</h2>
            <p className="text-neutral-700 mb-4">
              We may update this Privacy Policy from time to time. We will notify you of significant changes by:
            </p>
            <ul className="list-disc pl-6 text-neutral-700 mb-4 space-y-2">
              <li>Posting the new Privacy Policy on this page</li>
              <li>Updating the "Last updated" date</li>
              <li>Sending an email notification (for material changes)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">13. Contact Us</h2>
            <p className="text-neutral-700 mb-4">
              If you have questions about this Privacy Policy or wish to exercise your rights, contact us at:
            </p>
            <div className="bg-neutral-100 p-4 rounded-lg">
              <p className="text-neutral-700 mb-2">
                <strong>Email:</strong> privacy@keiroai.com
              </p>
              <p className="text-neutral-700 mb-2">
                <strong>Data Protection Officer:</strong> dpo@keiroai.com
              </p>
              <p className="text-neutral-700">
                <strong>Address:</strong> Keiro, France
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">14. Complaints</h2>
            <p className="text-neutral-700 mb-4">
              If you believe your data protection rights have been violated, you have the right to lodge
              a complaint with your local data protection authority.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
