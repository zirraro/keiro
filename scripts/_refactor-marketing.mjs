// Replace the IG-only insights block with a 3-network grid.
import { readFileSync, writeFileSync } from 'fs';

const path = 'app/assistant/agent/[id]/components/panels/MarketingPanel.tsx';
let s = readFileSync(path, 'utf8');

// Find the comment line that introduces the Instagram block.
const startMarker = '{/* Instagram engagement — three states:';
const endMarker = '          </div>\n        )}';

const startIdx = s.indexOf(startMarker);
if (startIdx < 0) { console.error('start not found'); process.exit(1); }
// Find the matching end — the block ends with the close of the engagement
// branch. Walk forward to the LAST occurrence of `(gs as any).instagram?.engagement`
// then find the closing `)}`.
const engagementMark = '(gs as any).instagram?.engagement';
const engIdx = s.indexOf(engagementMark, startIdx);
if (engIdx < 0) { console.error('engagement marker not found'); process.exit(1); }
// From there find next `)}\n` followed by blank line
const tailFrom = engIdx;
const tailMatch = s.slice(tailFrom).match(/\)\}\s*\n\s*\}?\s*\)/);
if (!tailMatch) { console.error('tail close not found'); process.exit(1); }
// The block ends with `</div>\n        )}` — find that.
const closingPattern = /<\/div>\s*\n\s*\)\}/g;
closingPattern.lastIndex = startIdx;
const m = closingPattern.exec(s);
if (!m) { console.error('closing pattern not found'); process.exit(1); }
const endIdx = m.index + m[0].length;

const NEW = `{/* Multi-network insights — Instagram, TikTok, LinkedIn parallel.
            Each section follows the same 3-state pattern (not connected /
            connected no-activity / connected with metrics). This is the
            "Insights" experience demonstrated for Meta App Review's
            instagram_business_manage_insights permission. */}
        <SectionTitle>Performance par r\\u00e9seau</SectionTitle>
        <div className="space-y-3">
          <NetworkInsightSection
            network="instagram"
            label="Instagram"
            stats={(gs as any).instagram}
            connectUrl="/api/auth/instagram-oauth"
            icon="\\u{1F4F8}"
            labelLikes={p.marketingLabelLikes}
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers={p.marketingLabelFollowers}
            labelPosts={p.marketingLabelPosts}
            labelReach={p.marketingLabelReach}
          />
          <NetworkInsightSection
            network="tiktok"
            label="TikTok"
            stats={(gs as any).tiktok}
            connectUrl="/api/auth/tiktok-oauth"
            icon="\\u{1F3B5}"
            labelLikes="Likes totaux"
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers="Abonn\\u00e9s"
            labelPosts="Vid\\u00e9os"
          />
          <NetworkInsightSection
            network="linkedin"
            label="LinkedIn"
            stats={(gs as any).linkedin}
            connectUrl="/api/auth/linkedin-oauth"
            icon="\\u{1F4BC}"
            labelLikes="R\\u00e9actions"
            labelEngagement={p.marketingLabelEngagement}
            labelFollowers="Connexions"
            labelPosts="Posts publi\\u00e9s"
          />
        </div>

        {/* Audit log link — meets the Meta App Review need to show a
            traceable history of every Graph API call. */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-blue-300">Audit Graph API</div>
              <div className="text-[10px] text-white/50 mt-0.5">
                Toutes les lectures Insights sont trac\\u00e9es avec le tag <code className="text-[9px] text-blue-200">instagram_business_manage_insights</code> dans /meta-audit
              </div>
            </div>
            <a
              href="/meta-audit?lang=en"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-[10px] font-semibold transition flex-shrink-0"
            >
              Voir l&apos;audit \\u2197
            </a>
          </div>
        </div>`;

s = s.slice(0, startIdx) + NEW + s.slice(endIdx);
writeFileSync(path, s);
console.log('Marketing panel rewritten — 3-network grid + audit link');
