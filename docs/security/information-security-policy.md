# Information Security Policy — KeiroAI

Version 1.0 · Effective 2026-07-20 · Owner: Founder/CTO (mrzirraro@gmail.com) · Reviewed: annually.

## 1. Purpose & scope
This policy defines how KeiroAI protects customer data and Google user data
across its application (Next.js), infrastructure (OVH VPS, nginx), and data
store (Supabase). It applies to all personnel with access to production systems
and to all code deployed to production.

## 2. Roles & responsibilities
- **Security owner** (Founder/CTO): owns this policy, approves access, leads incident response, maintains the Google Cloud project owner/editor list.
- **Operators**: anyone with SSH/console access to production. Must follow this policy.
- Least-privilege: access is granted per need, reviewed each quarter, revoked on offboarding.

## 3. Data classification
- **Sensitive**: OAuth tokens, credentials, API keys, customer PII, Google user data (email content when Option B is active).
- **Internal**: application logs, business data (CRM, content).
- **Public**: marketing site, blog.

## 4. Encryption
- **In transit**: TLS 1.2+ everywhere (nginx, Let's Encrypt). Plain HTTP is redirected to HTTPS. All third-party API calls (Google, Supabase, providers) are HTTPS.
- **At rest**: Supabase Postgres encrypts data at rest (AES-256, managed keys). VPS disk hosts only transient build artifacts and env files (permissions `600`, owned by the deploy user).

## 5. Secrets management
- All secrets (API keys, `CRON_SECRET`, OAuth client secret, DB service-role key) live in environment variables (`.env` on the VPS), **never** committed to git. `.gitignore` excludes `.env*`.
- Secrets are not logged. Log statements that could contain tokens are redacted/truncated.
- Rotation: on suspected exposure, on personnel change, and at least annually for the OAuth client secret and DB service-role key.

## 6. Access control & authentication
- **Application**: customers authenticate via Supabase Auth. Server-side API routes authorize every request; cron/internal routes require a bearer `CRON_SECRET`.
- **Infrastructure**: SSH to the VPS is key-based; password login disabled; `fail2ban` throttles brute force. Root actions are performed by the security owner only.
- **Admin consoles** (Google Cloud, Supabase, OVH, domain registrar, email): **MFA enforced** on every account. (Action item: capture screenshots as evidence — see remediation plan.)
- Access is least-privilege and reviewed quarterly.

## 7. Vulnerability & patch management
- **Dependencies**: `npm audit` is run in CI on every change and weekly (see `scripts/security-scan`). High/Critical advisories are triaged within 7 days.
- **Platform**: OS packages patched monthly and on critical CVEs; Node/Next kept on supported versions.
- **App scanning**: CASA static + dynamic scan run before each restricted-scope submission and annually.

## 8. Logging & monitoring
- Application and agent activity is logged to `agent_logs` (Supabase). Errors are captured and surfaced in the admin health digest.
- **Access to Google user data** is logged (who/when/scope/action) — see remediation plan for the dedicated access log when Option B activates.
- Anomalies (auth failures, provider errors, cost spikes) trigger admin alerts.

## 9. Data handling & privacy
- We collect and use data only for the user-facing features described in the public Privacy Policy (`/legal/privacy`).
- Google user data use complies with the **Google API Services User Data Policy**, including **Limited Use**: no sale, no transfer except to provide the feature, no advertising, no use to train generalized AI/ML models. Any performance learnings are aggregated and anonymized.
- Retention and deletion: see `data-retention-and-deletion.md`.

## 10. Vendor / sub-processor management
Primary sub-processors: **Supabase** (data store), **OVH** (hosting), **Google** (Gmail/OAuth), email providers (Brevo/Resend), image/LLM providers. Each is a reputable provider with its own security program; data shared is limited to what the feature requires.

## 11. Secure development
- Code review before merge to the deployed branch; deploys are scripted (`scripts/deploy.sh`) and verified live.
- Input from users and LLMs is validated/sanitized server-side; output that could contain secrets is never returned to clients.
- No secrets in client-side bundles.

## 12. Change management
Changes to production go through git + the scripted deploy, which builds, reloads, and verifies the served version. Security-relevant changes are noted in commit messages.

## 13. Policy review
Reviewed at least annually and after any major incident or architecture change.
