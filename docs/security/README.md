# KeiroAI — Security & CASA readiness pack

> Internal documentation prepared for the **CASA (Cloud Application Security
> Assessment) Tier 2** required by Google to obtain the **restricted** Gmail
> scopes (`gmail.readonly`, `gmail.compose`) — i.e. "Option B".
>
> **Nothing in this folder changes what a Google reviewer sees today.** The live
> app currently requests only the **sensitive** scope `gmail.send` (Option A),
> which does **not** require CASA. This pack is the groundwork so that, when a
> paying client needs inbox reading / draft management, we can pass CASA quickly.

Prepared: 2026-07-20 · Owner: founder (mrzirraro@gmail.com) · Review cycle: annual.

---

## 1. What CASA asks for

CASA Tier 2 is a security assessment mapped to **OWASP ASVS** (Application
Security Verification Standard). An authorized assessor (or an approved
self-scan tool) runs static + dynamic scans and reviews our documented
controls, then issues a **Letter of Validation (LOV)**, renewed every 12 months.

The assessor expects, for an app handling Google user data:
1. A public **privacy policy** with the exact scopes + **Limited Use** clause. ✅ live
2. **Encryption** in transit (TLS) and at rest. ✅
3. **Secrets management** (no secrets in code/version control). ✅
4. **Access control** with least privilege + MFA on admin/infra. ⚠️ enforce + evidence
5. **Vulnerability management** (dependency + platform patching). ⚠️ automate
6. A **data retention & deletion** policy, incl. deletion on request. → see `data-retention-and-deletion.md`
7. An **incident response** plan. → see `incident-response-plan.md`
8. **Logging & monitoring** of access to Google user data. ⚠️ add access log
9. A written **information security policy**. → see `information-security-policy.md`
10. Pass the CASA **static + dynamic scan** with no High/Critical findings. ⚠️ run + remediate

## 2. System overview (assessment scope)

| Layer | Detail |
|---|---|
| App | Next.js (App Router, TypeScript), server-side API routes |
| Runtime | Node.js under **pm2** on an **OVH VPS** (Gravelines, FR) |
| Edge | **nginx** reverse proxy, **TLS** (Let's Encrypt), HTTP→HTTPS redirect |
| Data | **Supabase** (Postgres, encrypted at rest, RLS-capable) |
| Secrets | Environment variables in `.env` on the VPS (not in git) |
| Auth | Supabase Auth (client accounts) |
| Google data | OAuth tokens stored server-side in `profiles` (Supabase); **send-only today** |

## 3. Google user data — what we touch

Today (Option A, live): `gmail.send` + `userinfo.email/profile` only. We **send**
emails from the user's address on their behalf; we **do not read, modify, label,
archive or delete** the mailbox. See `google-user-data-handling.md`.

Option B (post-CASA): `gmail.readonly` (read inbound to draft replies) +
`gmail.compose` (create/edit drafts, send). Same storage & Limited-Use rules.

## 4. Files in this pack

- `information-security-policy.md` — the umbrella policy (access, crypto, secrets, patching, logging, vendors).
- `data-retention-and-deletion.md` — retention periods + user-initiated deletion + Google data specifics.
- `incident-response-plan.md` — roles, severity, steps, breach notification.
- `google-user-data-handling.md` — scope-by-scope data flow, storage, Limited Use.
- `casa-asvs-l2-checklist.md` — ASVS L2 requirement → status → evidence → remediation.
- `remediation-plan.md` — the concrete to-do list to pass the scan (owners + order).
