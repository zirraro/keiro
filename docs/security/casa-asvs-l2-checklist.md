# CASA ASVS L2 — Readiness checklist

Version 1.0 · 2026-07-20. Maps the CASA Tier 2 (OWASP ASVS L2) themes to our
current state. Status: ✅ in place · 🟡 partial · ⬜ to do (see `remediation-plan.md`).

| # | ASVS theme | Requirement (summary) | Status | Evidence / gap |
|---|---|---|---|---|
| V1 | Architecture | Documented components, data flow, trust boundaries | ✅ | `README.md` + `google-user-data-handling.md` |
| V2 | Authentication | Strong auth; MFA on admin/infra | 🟡 | Supabase Auth for users; **MFA to enforce + evidence** on Google/Supabase/OVH/registrar |
| V3 | Session mgmt | Secure, httpOnly cookies; expiry | ✅ | Supabase Auth sessions |
| V4 | Access control | Least privilege; server-side authz on every route | ✅ | API routes authorize; cron routes require `CRON_SECRET` bearer |
| V5 | Validation & encoding | Validate input, prevent injection | 🟡 | `lib/safe-filter.ts` (PostgREST anti-injection) on webhooks; **extend + add zod on key inputs** |
| V6 | Cryptography | Encryption at rest & in transit; key mgmt | ✅ | TLS everywhere; tokens AES-256-GCM (`lib/token-crypto.ts`); Supabase at-rest |
| V7 | Error handling & logging | No sensitive data in logs; audit trail | 🟡 | `agent_logs` audit; bodies redacted; **add explicit Google-data access log** |
| V8 | Data protection | Retention, deletion, minimization, Limited Use | 🟡 | Policy written; **ship self-serve deletion endpoint** |
| V9 | Communications | TLS config, HSTS | ✅ | nginx TLS + HSTS + security headers (verified by `security-check` cron) |
| V10 | Malicious code | Dependency integrity | 🟡 | **Automate `npm audit` in CI** |
| V11 | Business logic | Rate limiting, abuse protection | ✅ | `lib/rate-limit.ts` on public endpoints; webhook signature verification |
| V12 | Files & resources | Safe upload handling | ✅ | Uploads to Supabase storage; no server-side exec |
| V13 | API | Auth on all APIs, no secrets client-side | ✅ | Bearer/session auth; no secrets in client bundle |
| V14 | Configuration | Secrets in env, secure defaults, patching | 🟡 | Secrets in `.env` (not in git); **document patch cadence + dependency scanning** |

## Summary
- **Strong already**: crypto (in transit + at rest + token encryption), access control, TLS/headers, rate limiting, webhook signatures, audit logging, documented architecture + data handling + Limited Use.
- **To close before the scan** (all in `remediation-plan.md`): MFA enforcement evidence, automated dependency scanning (CI), self-serve data deletion endpoint, explicit Google-data access log, zod validation on key inputs, documented patch cadence.

None of these block the current **Option A** (`gmail.send`, no CASA). They are the
prerequisites to pass the CASA scan for **Option B** (`gmail.readonly` / `gmail.compose`).
