# Data Retention & Deletion Policy — KeiroAI

Version 1.0 · Effective 2026-07-20 · Owner: Founder/CTO · Reviewed: annually.

## 1. Principles
We keep personal and Google user data only as long as needed to provide the
service, and we delete it on request. Retention periods are the minimum that
still lets the product function and meet legal/accounting duties.

## 2. Retention schedule

| Data | Store | Retention | Notes |
|---|---|---|---|
| Account (email, name) | Supabase `profiles` | Life of account + 30 days after deletion request | Then hard-deleted |
| Google OAuth tokens | Supabase `profiles` | Until user disconnects or deletes account | Revoked + row cleared on disconnect |
| Gmail message content (Option B only) | Not persisted long-term | Transient — processed to draft a reply, then only a minimal summary is kept | Full bodies are not stored; see §5 |
| CRM (prospects, activities) | Supabase | Life of account | Deletable on request |
| Content (posts, images) | Supabase + storage | Life of account | Deletable on request |
| Application/agent logs | Supabase `agent_logs` | 12 months rolling | Then pruned |
| Backups | Supabase managed | Per Supabase policy (≤ 30 days) | Encrypted at rest |

## 3. User-initiated deletion
Users can request deletion two ways:
1. **In-app**: disconnect a Google account at any time (Settings / agent panel) — this **revokes the token** and clears it from `profiles`.
2. **Account deletion**: on request (in-app control or email to contact@keiroai.com), we delete the account and all associated personal data within **30 days**, and revoke any Google tokens.

**Action item (remediation plan):** ship a self-serve "Delete my account & data" endpoint that (a) revokes Google tokens via the token-revocation endpoint, (b) deletes `profiles` + owned rows, (c) confirms by email. Until then, deletion is handled manually within the 30-day SLA.

## 4. Google token revocation
On disconnect or deletion we call Google's OAuth token revocation endpoint
(`https://oauth2.googleapis.com/revoke`) and remove the stored refresh/access
tokens. No Google data is retained after revocation beyond anonymized,
aggregated performance metrics that contain no message content or PII.

## 5. Gmail content handling (Option B)
When restricted scopes are active, inbound message bodies are read **in memory**
to generate a draft reply and are **not** persisted in full. What we may store:
sender address, subject, a short classification, and the draft we produced — the
minimum needed to show the conversation in-app and let the user review/send.
Users can purge this at any time via account deletion.

## 6. Limited Use restatement
Google user data is used **only** to provide the user-facing email features. We
do not sell it, do not transfer it except as needed to provide the feature, do
not use it for advertising, and do not use it to train generalized AI/ML models.
