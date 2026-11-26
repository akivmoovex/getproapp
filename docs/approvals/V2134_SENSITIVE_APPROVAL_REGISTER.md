# V2.13.4 Sensitive Approval Register

**Status:** ACTIVE — OWNER AUTHORIZATION 26 NOVEMBER 2026 (G301 re-execution)  
**Source attachment:** Prior attachment may be unavailable; this register is authoritative for authorized scope.  
**Unverified details:** Resend dashboard verification timestamps, concrete QA mailbox identities, and secret-store path names remain `UNVERIFIED_ATTACHMENT` / operator-supplied outside Git.

**Date of authorization:** 26 November 2026  
**Branch:** V13  
**Target version after completion:** 2.13.4  
**Starting tip (this re-execution):** `0b4058d8cf8d595c17878783a99dd76372174e6a`  
**Prompt tip note:** `1fd1144…` was historical; actual HEAD preserved without reset

This register records owner-approved QA operations and the hard limits that remain. It contains no secrets, patient data, OTP codes, or private QA-mailbox credentials.

---

## 1. Approved QA operations

The product owner explicitly approved the restricted QA recommendations dated 26 November 2026. This authorization permits:

1. Reviewed OTP schema execution on the named disposable database only.
2. QA-only Resend configuration using a verified sender and a securely stored sending-only API key.
3. Bounded real email testing to specifically approved QA recipients only.
4. Real OTP PostgreSQL, HTTP, security, and browser testing against that disposable environment.
5. Reviewed Community Benefits schema execution on the same disposable database.
6. Real synthetic Community Benefits persistence and browser testing.
7. Approved appointment overlap and clinical QA remediation.
8. Model B preview development and testing, without commercial activation.
9. Consent-notice drafting and testing, without live activation.
10. Complete system-wide QA coverage expansion.
11. Commit and push of tested work to `origin/V13`.
12. Preparation of a hosted QA deployment package for a **separate** later authorization.

---

## 2. Exact database scope

| Field | Authorized value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `55432` |
| Database | `getpro_v13_e2e_g78d2301` |
| Identity environment | `testing` |
| Shared PostgreSQL `5432` | FORBIDDEN |
| Production databases | FORBIDDEN |
| Hosted databases | FORBIDDEN |
| Database reset / truncate of unrelated data | FORBIDDEN |
| Unrelated migrations | FORBIDDEN |

OTP SQL source (reviewed, not a `db/migrations` copy):  
`docs/qa/V2132_G181_OTP_CHALLENGES.sql`

Community Benefits SQL source (reviewed, not a `db/migrations` copy):  
`docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql`

`db/migrations/platform/048_otp_challenges.sql` remains intentionally absent. Contract tests continue to require that path to stay absent. Disposable application of the reviewed docs/qa script is authorized; promoting that script into migrations is a separate deferred decision.

---

## 3. Real email restrictions

- Provider: Resend, QA-only profile.
- Domain verification claimed by authorization: `pronline.org` — operator must confirm actual Resend dashboard verification before live send (`UNVERIFIED_ATTACHMENT` for dashboard timestamp).
- API key: sending-only, stored only in the approved QA secret store — never in Git, logs, docs, or test fixtures.
- Recipients: exact allowlist of authorized QA recipients only (`UNVERIFIED_ATTACHMENT` for concrete mailbox list until operator supplies them outside Git).
- SMS: not authorized by this register.
- Unrestricted or production mailbox delivery: FORBIDDEN.
- A provider HTTP 2xx response is **not** proof of mailbox delivery.
- Plaintext OTP codes must never be logged, committed, or written into evidence files.

If dashboard access or credential provisioning is unavailable, record the precise operator dependency and continue independent non-email work.

---

## 4. Clinical safety

- Preserve correct patient, encounter, clinic, facility, role, and audit binding.
- Laboratory and radiology journeys must verify persisted status transitions and clinician read-back.
- Print-ready views may be completed only for supported contracts already implied by product sources; do not invent unapproved document formats.
- Do not invent clinical status rules, reference ranges, room capacity, equipment capacity, overbooking, or group-booking policy.
- Preserve existing same-practitioner appointment overlap protection.
- D25 slot-capacity remains a separate deferred policy decision unless this register later records a more specific approval.

---

## 5. Community commercial restrictions

- Apply reviewed schema only on the disposable QA database.
- Keep all agreements inactive in real E2E.
- Model B 10% contribution is preview/development only — no commercial activation.
- Consent-notice drafting and testing only — no live activation and no real patient enrollment under unapproved consent text.
- Settlement preparation may be idempotent and previewed; financial posting remains DISABLED.
- No live clinic agreements.
- No live financial transactions.
- Mock-backed browser tests must never be classified as PostgreSQL E2E.

---

## 6. Deferred approval decisions

The following remain **not** authorized by this register and require a future separate approval:

- Production database changes
- Shared database resets
- Hosted or production deployment (preparation only is allowed)
- Unrestricted email or SMS delivery
- Production OTP activation
- Live clinic agreements
- Live financial transactions / posting
- Real patient enrollment under unapproved consent text
- Public appointment booking activation
- Production binary uploads
- Changes to `main`
- Promotion of reviewed docs/qa SQL into `db/migrations/`
- D25 room/equipment/group capacity policy invention
- Activation of Community Benefits commercial rates or consent notices

---

## 7. Future-version reconsideration

Items deferred above may be reconsidered for a later version only after a new written owner approval. Passing disposable QA in 2.13.4 does not imply production readiness, hosted readiness, or commercial activation.

---

## 8. Required operator actions

1. Confirm Resend dashboard verification for `pronline.org` and provision a sending-only QA API key into the approved secret store.
2. Supply the exact allowlisted QA recipient addresses through the approved secret channel (not Git).
3. Confirm disposable database reachability at `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301` before schema apply.
4. After agent push to `origin/V13`, separately authorize any hosted QA deployment.
5. Do not apply OTP or Community Benefits scripts outside the disposable database named above.

---

## 9. Evidence and release gates

Evidence files expected under `docs/qa/`:

- `V2134_G301_APPROVAL_EXECUTION_AUDIT.md`
- `V2134_G301_OTP_LIVE_QA_EVIDENCE.md`
- `V2134_G301_COMMUNITY_POSTGRES_EVIDENCE.md`
- `V2134_G301_OPEN_RELEASE_GATES.md`
- `V2134_G315_FINAL_QA_HANDOFF.md`

Release gates that stay NO until separately cleared:

- Production OTP activation
- Hosted/production deployment
- Community financial posting
- Public booking
- Production media upload
- Live agreements / live consent enrollment
- D25 capacity policy (unless later approved)

QA GO/NO-GO for production remains **NO-GO** until hosted retest and the deferred gates above are cleared by separate approvals.

---

## 10. Secrets policy

Never store in this repository:

- Resend API keys
- OTP peppers beyond test-only fixtures already governed by existing tests
- QA mailbox passwords
- Plaintext OTP codes
- Real patient identifiers
- Production connection strings
