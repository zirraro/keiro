# Meta App Review v4 — Resubmission package (2026-05-28)

## Why v3 was rejected and what changed

| Permission | v3 rejection reason | v4 fix |
|---|---|---|
| **Human Agent** | "Identifiants non valides ou insuffisants — app requires sign-up" → reviewer couldn't access | Embed test credentials directly in "Instructions for Reviewer" field + link to /meta-review |
| **instagram_business_content_publish** | "Video doesn't match use case end-to-end" | Re-record with full Meta OAuth login flow + permission grant + agent usage shown |
| **instagram_business_manage_insights** | Same | Same |
| **instagram_business_manage_comments** | Same | Same |
| ~~oEmbed Read~~ | Renewed ✓ | — |
| ~~instagram_business_basic~~ | Renewed ✓ | — |
| ~~instagram_business_manage_messages~~ | Renewed ✓ | — |

The 3 renewed permissions had video flows Meta accepted — we replicate that same structure for the 3 rejected IG perms.

---

## Test account ready

| | |
|---|---|
| Email | `mrzirraro+metareview@gmail.com` |
| Password | `METAREVIEW2026` |
| Plan | Business (all agents unlocked) |
| Reviewer guide | <https://keiroai.com/meta-review> |

The account is provisioned with full access. No restrictions, no setup required from the reviewer.

---

## Text to paste in EACH "Instructions for Reviewer" field

Paste this same block in the four resubmissions. The credentials at the top are the most important detail — that's what was missing.

```
🔑 TEST CREDENTIALS (no signup required — these are valid right now)
   Email: mrzirraro+metareview@gmail.com
   Password: METAREVIEW2026
   Plan: Business (all agents enabled)

📍 Reviewer landing page (English, public, no auth):
   https://keiroai.com/meta-review

   This page contains the test credentials again, plus step-by-step
   navigation for every permission below.

▶️ HOW TO REPRODUCE THE PERMISSION USAGE

1. Open https://keiroai.com in any browser.
2. Click "Sign in" (top-right) — language defaults to French; switch to
   English via the EN toggle in the top bar if needed.
3. Enter the credentials above.
4. After login you land on /assistant — this is the home dashboard
   where each agent has a tile.
5. Click "Connect Instagram" on the dashboard. This launches Facebook
   Login OAuth with the requested scopes.
6. Grant the permission(s). The redirect lands back on /assistant
   with the IG handle now bound.
7. Trigger the agent that exercises the permission:
   - content_publish    → /assistant/agent/content
                          → "Generate post" → "Publish to Instagram"
   - manage_insights    → /assistant/agent/marketing
                          → Instagram tab → metrics + insights table
   - manage_comments    → /assistant/agent/dm_instagram
                          → "Comments" tab → list of received comments
                          → "Reply" on any row
   - manage_messages    → /assistant/agent/dm_instagram
                          → "DMs" tab → conversation thread

▶️ HUMAN AGENT cas d'usage (this is the rejected v3 perm — see
   instructions in the section below before testing)

If you have any trouble accessing the app please reply to this review;
we will respond within 2h during business hours (Paris time, CET/CEST).
```

---

## Specific override for "Human Agent" permission

Meta marked Human Agent as "credentials invalid or insufficient". v4 explicitly tells them:

```
HUMAN AGENT — How to test

1. Sign in using mrzirraro+metareview@gmail.com / METAREVIEW2026
2. Go to /assistant/agent/dm_instagram (Jade)
3. Open the "Inbox" tab. You will see a list of incoming Instagram
   messages auto-replied by Jade.
4. Each conversation has a "Handover to human" button. Click it on
   any thread.
5. The thread is now marked needs_human; Jade stops auto-replying;
   the business owner (test account) receives a push + email
   notification to take over manually.
6. The "Reply as me" composer at the bottom is now open — type a
   manual reply and click Send. This is the human-in-the-loop step
   the Human Agent permission is for.

Code path: /api/agents/dm-instagram/handover (POST), backed by
crm_prospects.dm_status='needs_human' + client_notifications insert.

This is server-to-server: the IG message itself goes out via the
business's already-granted instagram_business_manage_messages token.
Human Agent gives the business the right to mark a thread for
human-only follow-up and prevent automated replies from going out
on threads explicitly flagged.
```

---

## Video script — `instagram_business_content_publish` (4-5 min)

**English UI** — `?lang=en` at every URL. Add subtitles or on-screen
text bubbles for every step.

| t | Action | On-screen / narration |
|---|---|---|
| 0:00 | Open https://keiroai.com — homepage | "This is KeiroAI, an AI marketing platform for local businesses." |
| 0:15 | Click "Sign in" | "I sign in with the reviewer test credentials." |
| 0:30 | Land on /assistant?lang=en | "Dashboard with every agent. I now connect Instagram." |
| 0:40 | Click "Connect Instagram" → Facebook OAuth opens | **CRITICAL** — show the full Facebook permission grant screen including the `instagram_business_content_publish` line item. |
| 1:10 | Grant permissions → redirected back | "Permission granted. Instagram is now connected." |
| 1:25 | Navigate to /assistant/agent/content (Léna) | "Léna is the publishing agent." |
| 1:40 | Click "Generate post" — Seedream visual + caption appear | "AI generates an editorial visual + caption for the connected business." |
| 2:30 | Click "Publish to Instagram" | "I press Publish — this is the exact moment we use the permission." |
| 2:40 | Show the network call: POST to graph.facebook.com/v21.0/{ig-id}/media | "Server-to-server call: we upload the image as a container, then publish it." |
| 3:00 | Success screen — permalink to the new IG post | "Post is live on the connected Instagram business account." |
| 3:15 | Open the IG post in a separate tab to prove it exists | "Here is the live post on Instagram, published by KeiroAI on behalf of the business." |
| 3:45 | Wrap-up: "End-to-end demo complete — login, OAuth grant, publish." |

**Mention explicitly in the description**: "KeiroAI is a hybrid app. The OAuth flow is frontend; the publish call to Graph API is server-to-server using the token granted in step 1:10."

---

## Video script — `instagram_business_manage_insights` (3-4 min)

| t | Action | Narration |
|---|---|---|
| 0:00 | Open keiroai.com → Sign in | Same credentials. |
| 0:30 | Connect Instagram → Facebook OAuth | **Show `instagram_business_manage_insights` line item** on the grant screen. |
| 1:10 | Permission granted → /assistant | |
| 1:25 | Open /assistant/agent/marketing (Ami) | "Ami is the marketing strategist." |
| 1:40 | Instagram tab → Insights panel loads | |
| 2:00 | Show: followers count, reach, likes, comments, engagement rate | "All of these come from /me/insights and /{media-id}/insights — the permission we're requesting." |
| 2:30 | Open /meta-audit (admin link) → show the audit log row tagged `instagram_business_manage_insights` | "Every Insights call is logged with the permission tag for compliance." |
| 3:00 | Show /api/me/insights JSON in DevTools network tab | "Server-to-server call hitting Graph API insights endpoint." |
| 3:30 | Wrap-up |

---

## Video script — `instagram_business_manage_comments` (3-4 min)

| t | Action | Narration |
|---|---|---|
| 0:00 | Open keiroai.com → Sign in | |
| 0:30 | Connect Instagram → Facebook OAuth | **Show `instagram_business_manage_comments` line item.** |
| 1:10 | Granted → /assistant |
| 1:25 | /assistant/agent/dm_instagram → Comments tab | "Jade handles comments." |
| 1:50 | List of received comments loads (from /{ig-user-id}/media + /{media-id}/comments) | "Comments fetched via the permission." |
| 2:15 | Click "Reply" on any row — text composer opens | |
| 2:30 | Type a short reply, click Send | "Reply posted via POST /{comment-id}/replies — same permission grants this scope." |
| 2:45 | Show the reply now visible on Instagram in a separate tab | "Reply live on Instagram." |
| 3:15 | Show /meta-audit row tagged `instagram_business_manage_comments` | |
| 3:45 | Wrap-up |

---

## Video script — Human Agent (3-4 min)

| t | Action | Narration |
|---|---|---|
| 0:00 | Sign in with test credentials | "KeiroAI lets the business owner take over conversations Jade can't handle." |
| 0:30 | Connect Instagram (if not already) | **Show Human Agent line item on grant screen.** |
| 1:00 | /assistant/agent/dm_instagram → Inbox tab | "Here Jade auto-replied to a customer. Now I want to take over." |
| 1:30 | Click "Handover to human" on a thread | "I mark this thread as 'needs human'. Jade stops auto-replying." |
| 2:00 | Show client_notifications row + push notification | "The business owner gets pinged in real time." |
| 2:30 | Type and send a manual reply in the composer | "I reply as the human business owner — this is the human-in-the-loop step." |
| 3:00 | Show DB: dm_status = 'needs_human' on the prospect | |
| 3:30 | Wrap-up: "The Human Agent permission gives the business the right to mark threads for human-only follow-up and pause automated replies." |

---

## Recording checklist (all videos)

- [ ] Browser language set to English (system + browser preference)
- [ ] Window 1280×720 minimum, no personal tabs visible
- [ ] Use the reviewer credentials, not a personal account
- [ ] On-screen text bubble or caption explaining each click
- [ ] Show the FULL Facebook OAuth screen with the permission line item visible
- [ ] Wait 2 seconds on each important screen so reviewers have time to read
- [ ] Export in 1080p, no music, voice-over OR text captions (Meta accepts both)
- [ ] Save with a descriptive filename: `keiroai-v4-content_publish-2026-05-28.mp4`

---

## Submission checklist before clicking "Submit for review"

- [ ] Test credentials pasted in EACH of the 4 "Instructions for Reviewer" fields
- [ ] /meta-review link mentioned in instructions
- [ ] New video uploaded for each of the 4 permissions
- [ ] Use case description updated if it's been changed since v3 (probably no)
- [ ] App is in "Live mode", not "Development mode"
- [ ] Privacy Policy + Terms URLs still resolve
- [ ] Verify the test account can log in by opening an incognito window
