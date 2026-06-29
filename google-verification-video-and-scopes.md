# Google OAuth Verification — Demo Video Script + Scope Justifications

> Préparé pour la soumission Trust & Safety. Scopes soumis : `gmail.send` (sensitive),
> `gmail.readonly` (restricted → CASA), `business.manage` (sensitive), `userinfo.email` (non-sensitive).
> ⚠️ AVANT DE FILMER : régler le compte Google + la langue du navigateur sur **ENGLISH**
> (Google exige l'écran de consentement en anglais). Chrome → Settings → Languages → English (move to top) → "Display Google Chrome in this language" → relaunch.
> Filmer en 1280×720 minimum, écran propre (fermer onglets perso), curseur visible.

---

## PART 1 — DEMO VIDEO SCRIPT (English, ~2 min 30)

Record on YouTube **Unlisted**. Use on-screen captions (Loom text or subtitles) so the reviewer
can map each scope → feature without audio. Narration optional but recommended.

### SCENE 0 — Intro (0:00–0:10)
**Caption:** "KeiroAI — AI marketing agents for local businesses. App: keiroai.com"
- Show the KeiroAI dashboard homepage (logged in), so the reviewer sees the real product.

### SCENE 1 — Why we connect Google (0:10–0:25)
**Caption:** "Hugo, our email agent, sends and auto-replies to emails. Théo manages Google reviews. We connect the user's Google account."
- Open the **Hugo** agent panel (email). Point to "Automatic sending" + inbox.
- Click the **"Connect Google"** button.

### SCENE 2 — OAuth consent screen (0:25–1:00) ⭐ THE CRITICAL SCENE
**Caption:** "Full OAuth consent screen — exact scopes requested."
- Show the Google account picker (must read **in English**: "Choose an account").
- Select the account. The unverified-app notice ("Google hasn't verified this app") is EXPECTED — show it, click "Continue" / "Advanced → Go to keiroai.com".
- **STOP and ZOOM on the consent/permissions screen.** The reviewer MUST be able to read each scope:
  - ✅ "Send email on your behalf" (gmail.send)
  - ✅ "Read, compose, send... " → actually **"View your email messages and settings"** (gmail.readonly)
  - ✅ "Manage your Google Business Profile" (business.manage)
  - ✅ "See your primary Google Account email address" (userinfo.email)
- Keep this screen on display 4–5 seconds, legible. Click **Allow**.
- **Caption:** "All scopes granted match exactly the scopes submitted for review."

### SCENE 3 — gmail.send in action (1:00–1:25)
**Caption:** "gmail.send → Hugo sends emails from the user's address, with their approval."
- Back in KeiroAI, show Hugo composing/sending an email (a campaign or a reply).
- Show a confirmation that the email was sent.

### SCENE 4 — gmail.readonly in action (1:25–1:55)
**Caption:** "gmail.readonly → Hugo reads the inbox to detect incoming client emails and draft a relevant reply."
- Open the **"Inbox" / Boîte de réception** view inside Hugo.
- Show an incoming email being read, then Hugo generating a contextual reply (the blue-bubble agent view).
- **Caption:** "We only READ to understand the client's message. We never modify or delete the mailbox — that is why we use the read-only scope, not modify."

### SCENE 5 — business.manage in action (1:55–2:20)
**Caption:** "business.manage → Théo replies to Google reviews and updates the Business Profile."
- Open the **Théo** agent (Google reviews).
- Show a Google review being read + an AI reply being posted (or proposed).
- Optionally show the Business Profile description being optimized.

### SCENE 6 — Limited Use / privacy (2:20–2:30)
**Caption:** "Data is used only to power these user-facing features. No ads, no selling, no AI training. See keiroai.com/legal/privacy (Limited Use)."
- Briefly show the privacy page with the "Limited Use" section.

> **Checklist avant upload :** écran de consentement EN ANGLAIS ✅ · scopes lisibles 4–5 s ✅ ·
> chaque scope démontré (send/read/business) ✅ · app name = keiroai.com ✅ · URL accounts.google.com visible ✅.

---

## PART 2 — SCOPE JUSTIFICATIONS (paste into the verification form)

> Format Google : pour chaque scope, expliquer le **feature user-facing** + **pourquoi un scope plus étroit ne suffit pas**. ≤ quelques phrases, en anglais.

### 1. `https://www.googleapis.com/auth/gmail.send` — Sensitive
**Why we need it:** KeiroAI's email agent ("Hugo") sends marketing emails and replies to
incoming client emails directly from the user's own Gmail address, on the user's behalf and
with their configured approval. Sending from the user's address (rather than a relay) is core
to the product: clients reply to the business, not to KeiroAI.
**Why a narrower scope is not sufficient:** `gmail.send` is already the most limited Gmail
scope that allows sending. It does not grant read access. There is no narrower send-only scope.

### 2. `https://www.googleapis.com/auth/gmail.readonly` — Restricted
**Why we need it:** Hugo reads the user's inbox to detect incoming emails from their clients,
understand the content of each message, and draft a relevant, contextual auto-reply that the
user can send (via gmail.send). Reading the full message body is required because a marketing
auto-reply must reference what the client actually wrote (a question, a booking request, a
complaint). This is a foreground, user-facing feature controlled by the user.
**Why a narrower scope is not sufficient:** `gmail.metadata` only exposes headers (sender,
subject, labels) — not the message body — so the agent could not understand the request or
write a relevant reply. We deliberately do NOT request `gmail.modify`, because we never alter,
label, or delete the mailbox; we only read content and send replies. `gmail.readonly` is the
minimal scope that provides read access to message bodies without write/modify permissions.
**Limited Use:** raw email data is used only to provide the in-app auto-reply feature. We do not
sell or transfer it, do not use it for advertising, and do not use it to train AI models. Any
learnings stored to improve the product are aggregated/anonymized, never raw user content.

### 3. `https://www.googleapis.com/auth/business.manage` — Sensitive
**Why we need it:** KeiroAI's reviews agent ("Théo") reads the Google reviews left on the
user's Google Business Profile and posts replies on the user's behalf, and updates the Business
Profile (description, posts) to improve the business's local visibility. Managing reviews and
the profile is the entire purpose of this feature.
**Why a narrower scope is not sufficient:** The Business Profile APIs (reviews, local posts,
location info) require `business.manage`; there is no read-only or narrower Business Profile
OAuth scope that allows replying to reviews or updating the profile.

### 4. `https://www.googleapis.com/auth/userinfo.email` — Non-sensitive
**Why we need it:** To identify which Google account the user connected and match it to their
KeiroAI account. Standard sign-in scope; no justification normally required.

---

## NOTES
- Scope `analytics.readonly` **removed** (least-privilege; Google forbids requesting scopes for
  "future improvements"). Will be re-submitted later, with its own demo, when the "SEO traffic
  impact" feature ships.
- Domain ownership = **Google Search Console** (already verified under MrZirrarO@gmail.com), not
  WHOIS. WHOIS now shows real registrant (Oussama Zirrar / Keiro ai) via OVH RDAP — who.is cache
  is stale.
- `gmail.readonly` is **restricted** → a **CASA security assessment** (annual, AL1/AL2, OWASP
  ASVS, Letter of Validation) will be required for production >100 users. In testing mode all
  scopes already work for <100 users.

---

## PART 3 — CONSOLE SCOPE CLEANUP (do this FIRST, before filming/submitting)

The console currently lists too many Gmail scopes (least-privilege violation → auto-reject).
In Google Cloud Console → OAuth consent screen → **Data Access**:

**DELETE (trash icon) — unused:**
- ❌ `gmail.modify`        (too broad + restricted — we never modify the mailbox)
- ❌ `gmail.compose`       (drafts — unused)
- ❌ `gmail.drafts.create` (drafts — unused)
- ❌ `gmail.drafts.readonly` (drafts — unused)
- (optional) `userinfo.profile` (non-sensitive, unused — remove to be clean)

**KEEP — only these 4:**
- ✅ `userinfo.email`   (non-sensitive)
- ✅ `business.manage`  (Théo — reviews + Business Profile)
- ✅ `gmail.send`       (sensitive — Hugo sends)
- ✅ `gmail.readonly`   (restricted — Hugo reads inbox to auto-reply)

**"What features will you use?" (Gmail use-case selector):** select **"Email productivity"**
(FR: « Productivité de la messagerie »). NOT backup, NOT email client, NOT monitoring/reporting.

Result: a single restricted scope (`gmail.readonly`), minimal surface, lighter CASA.

---

## PART 4 — TRUST & SAFETY REPLY (paste in the resubmission notes / reply to the rejection email)

Subject: Re: OAuth verification for keiroai.com — remediation and resubmission

Hello,

Thank you for the review. We have addressed the points raised and are resubmitting. Summary of
the changes:

1. Minimum scopes (least privilege): we removed all unused scopes. The app now requests ONLY:
   - userinfo.email — to identify the connected account
   - gmail.send (sensitive) — our email agent sends emails from the user's address, on their behalf
   - gmail.readonly (restricted) — our email agent reads the inbox to detect incoming client
     emails and draft relevant replies (sent via gmail.send); the full body is required, so
     gmail.metadata is insufficient; we deliberately do NOT use gmail.modify
   - business.manage (sensitive) — our reviews agent replies to Google reviews and updates the
     user's Business Profile
   We removed gmail.modify, gmail.compose, gmail.drafts.create, gmail.drafts.readonly and
   analytics.readonly, which the app does not use.

2. Homepage & domain: https://keiroai.com accurately describes the product (AI marketing agents
   for local businesses) and links to our privacy policy. The domain is verified in Google
   Search Console under the project owner account. Public WHOIS lists the real registrant.

3. Privacy policy & Limited Use: https://keiroai.com/legal/privacy discloses how we access, use,
   store and share Google user data, and includes an explicit Limited Use section. We do not sell
   or transfer data, do not use it for advertising, and do not use Gmail data to train AI models.
   Any product-improvement learnings are aggregated and anonymized, never raw user content.

4. Data deletion: a functional data-deletion endpoint is in place and the request URL is
   published on our site.

5. Demo video (English consent screen) showing the full OAuth flow and how each scope is used:
   [YOUTUBE UNLISTED LINK]

We are happy to provide any additional information. Thank you.

Best regards,
Oussama Zirrar — KeiroAI (keiroai.com)

---

## WHERE TO FIND THE TRUST & SAFETY MESSAGE
- The rejection email (24 June) was sent to the project's **support/owner email**
  (MrZirrarO@gmail.com and/or contact@keiroai.com). Search the inbox + **Spam/Promotions** for
  sender containing "google.com" and subject mentioning "OAuth", "verification" or "action
  required". Reply in that same thread.
- Also visible in **Google Cloud Console → APIs & Services → OAuth consent screen →
  Verification status / Verification Center**: the reviewer's note + the **"Submit for
  verification"** (resubmit) button with a notes field. Pasting the Part 4 text there works too.
