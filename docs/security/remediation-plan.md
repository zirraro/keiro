# CASA Remediation Plan — to pass the Tier 2 scan (Option B)

Version 1.0 · 2026-07-20. The concrete, ordered work to close the 🟡/⬜ items from
`casa-asvs-l2-checklist.md` before submitting Option B (`gmail.readonly` + `gmail.compose`).
None of this touches the live Option A consent screen.

## Order of work

1. **MFA on all admin/infra accounts + evidence** (owner: founder)
   - Enforce 2FA on Google Cloud, Supabase, OVH, domain registrar, Meta Business.
   - Capture screenshots as evidence for the assessor.
   - *Effort: 1h. No code.*

2. **Automated dependency scanning** (owner: dev) — ✅ DONE (2026-07-21)
   - `.github/workflows/security-audit.yml` runs `npm audit --audit-level=high` on push/PR + weekly + on demand; uploads a JSON report (90-day retention). Local: `npm run security:audit`.
   - Triage High/Critical within 7 days (policy §7).

3. **Self-serve data deletion endpoint** (owner: dev) — ✅ DONE (2026-07-21)
   - `POST /api/me/delete-account` revokes Google tokens immediately, clears all OAuth credentials, logs the request, emails confirmation; full purge within 30 days. Satisfies ASVS V8 + Limited Use deletion-on-request.

4. **Explicit Google-data access log** (owner: dev) — ✅ DONE (2026-07-21)
   - `lib/security/access-log.ts` → `logGoogleDataAccess(user, access, scope)` writes `{access, scope, ts}` (no body) to `agent_logs.action='google_data_access'`. Wired on `gmail.send`; read/compose calls log automatically when Option B activates.

5. **zod validation on key inputs** (owner: dev)
   - Validate the highest-risk request bodies (auth, publish, ingest, webhooks) with zod.
   - *Effort: 1 day. Repo-only.*

6. **Document patch cadence** (owner: founder)
   - One paragraph: OS monthly + critical CVEs; Node/Next on supported versions. Add to `information-security-policy.md` §7 (done) + keep a changelog.
   - *Effort: 15 min.*

## Option B code (prepared, gated OFF)
The scope wiring for `gmail.readonly` + `gmail.compose` will sit behind an env flag
(`GMAIL_OPTION_B=on`, default **off**) so it is inert and the **live consent screen
stays `gmail.send` only** until CASA passes and a new Google verification is submitted.
Nothing changes for the current reviewer until we explicitly flip the flag.

## Then: submission sequence
1. Close items 1–6 above.
2. Run the CASA self-scan (approved tool) → remediate any High/Critical → get the Letter of Validation.
3. In Google Cloud console: add `gmail.readonly` + `gmail.compose` to the consent screen → submit a **new** verification (video showing reading inbox + drafting) + attach the LOV.
4. Option A keeps working throughout; Option B activates on approval (flip `GMAIL_OPTION_B=on`).

Estimated total: **~1 week of engineering** + **2–4 weeks** Google/CASA turnaround.
