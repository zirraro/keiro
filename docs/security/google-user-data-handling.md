# Google User Data Handling — KeiroAI

Version 1.0 · Effective 2026-07-20 · Owner: Founder/CTO. Companion to the CASA pack.

## 1. Scopes and purpose

| Scope | Status | Purpose | Data touched |
|---|---|---|---|
| `gmail.send` | **Approved (Option A, live)** | Send prospecting/follow-up emails from the user's Gmail, on their behalf, after review | Outbound email content the user composed/approved |
| `userinfo.email` / `userinfo.profile` | Approved | Identify + display the connected mailbox (name, email) in-app | Name, email, profile picture |
| `gmail.readonly` | **Option B (planned, CASA-gated)** | Read inbound messages to draft relevant replies | Inbound message content (in memory) |
| `gmail.compose` | **Option B (planned, CASA-gated)** | Create/edit drafts + send | Draft content |

Option B scopes are **not requested today**. Adding them requires a new Google
verification + this CASA validation.

## 2. Data flow

```
User → Google OAuth consent → KeiroAI receives access + refresh token
     → token encrypted at rest (AES-256) in Supabase profiles
     → Hugo (email agent) uses the token server-side to call the Gmail API
        • Option A: messages.send only (outbound)
        • Option B: messages.list/get (read, in memory) → draft reply → user reviews → send
```

- All Gmail API calls are **server-side** (Node on the VPS). Tokens are never exposed to the browser.
- Message bodies (Option B) are processed **in memory** to generate a draft; **not persisted in full** (see retention policy).

## 3. Storage & encryption
- OAuth tokens: stored in Supabase `profiles`, **encrypted at rest** (AES-256-GCM via `lib/token-crypto.ts`, key `SMTP_ENC_KEY`), on top of Supabase's own at-rest encryption.
- In transit: TLS 1.2+ everywhere.
- No Google user data is copied to analytics, logs (bodies are redacted/omitted), or third parties.

## 4. Limited Use compliance
KeiroAI's use and transfer of information received from Google APIs adheres to
the **Google API Services User Data Policy**, including the **Limited Use**
requirements:
- Data is used **only** to provide the user-facing email features.
- **No sale** of Google user data.
- **No transfer** except as needed to provide the feature (and to sub-processors under contract — Supabase for storage, the LLM provider only for the minimal text needed to draft a reply, never for training).
- **No advertising** use.
- **No use to train** generalized/AI-ML models. Any performance learnings are aggregated and anonymized and contain no message content or PII.

This is disclosed publicly in the Privacy Policy §4.4 (`/legal/privacy`).

## 5. Human access
Access to production data is limited to the security owner. No routine human
reads mailbox content. Debugging never logs message bodies. Any exceptional
access is logged.

## 6. Revocation & deletion
On disconnect or account deletion, tokens are revoked (`oauth2.googleapis.com/revoke`)
and removed. See `data-retention-and-deletion.md`.
