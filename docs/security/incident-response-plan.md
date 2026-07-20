# Incident Response Plan — KeiroAI

Version 1.0 · Effective 2026-07-20 · Owner: Founder/CTO (mrzirraro@gmail.com).

## 1. Scope
Any event threatening the confidentiality, integrity or availability of customer
data, Google/Meta user data, credentials, or the service.

## 2. Roles
- **Incident lead** (Founder/CTO): declares, coordinates, decides, communicates.
- Backup contact: contact@keiroai.com.

## 3. Severity
| Level | Definition | Target response |
|---|---|---|
| **P0 – Critical** | Data breach, credential/token leak, active intrusion, full outage | Immediate (< 1h) |
| **P1 – High** | Partial compromise risk, auth bypass, provider breach affecting us | < 4h |
| **P2 – Medium** | Vulnerability found, degraded feature, suspicious activity | < 24h |
| **P3 – Low** | Minor issue, no data risk | Best effort |

## 4. Process
1. **Detect** — via automated alerts (admin health digest, `security-check` cron, provider notifications, user report).
2. **Triage** — assign severity, open a timeline note.
3. **Contain** — revoke affected tokens/keys, disable the affected path, rotate secrets, block the source. For a token/key leak: rotate immediately (OAuth client secret, `CRON_SECRET`, DB service-role key, provider keys).
4. **Eradicate** — patch the root cause, deploy the fix, verify.
5. **Recover** — restore normal operation, monitor for recurrence.
6. **Notify** — see §5.
7. **Post-mortem** — within 5 business days: root cause, timeline, fixes, prevention. Update policies.

## 5. Breach notification
- **Users**: if personal data is affected, notify affected users without undue delay, describing what happened, data involved, and steps taken.
- **Regulator (GDPR / CNIL)**: if a personal-data breach is likely to risk individuals' rights, notify the CNIL **within 72 hours** of becoming aware.
- **Google / Meta**: if Google or Meta user data is involved, notify the platform per their developer policies.

## 6. Contacts
- Internal: contact@keiroai.com
- Security reports (external): `/.well-known/security.txt`
- CNIL: cnil.fr

## 7. Testing
Reviewed annually; a tabletop walkthrough is run after any major architecture change.
