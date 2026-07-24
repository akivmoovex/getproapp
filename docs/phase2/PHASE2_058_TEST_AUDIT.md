# PHASE2_058 — Route and Database Test Audit

**Date:** 2026-07-24  
**Mode:** Full Phase2 Prompts **1–7** test run (unit, rendering, route, CSRF, permission, migration/repository, Platform Admin regression)  
**Scope:** BlessBoard V5 Platform Admin registration review surfaces + adjacent CSRF/security coverage  
**Rule:** Do **not** mark PostgreSQL-gated tests as passed when the database is unavailable  
**Fixes:** Only Phase2 Prompt 1–7 defects (stale assertions / broken Postgres fixture)

---

## Executive summary

| Metric | Count |
|--------|------:|
| **Files run** | 48 |
| **Tests** | 597 |
| **Suites** | 90 |
| **Passed** | **597** |
| **Failed** | **0** |
| **Skipped** | **0** |
| **Blocked** | **0** |
| **Exit code** | **0** |
| **Duration** | ~30s (`--test-concurrency=1`) |

**Overall:** **PASS** — all in-scope Phase2 Prompts 1–7 tests passed against a **local** PostgreSQL foundation fixture.

---

## Database environment

| Item | Value |
|------|--------|
| Hosted `DATABASE_URL` | Present (Supabase pooler) — **not** used for ephemeral foundation fixtures |
| `TEST_DATABASE_URL` | **Unset** |
| Foundation admin URL | `FOUNDATION_ADMIN_DATABASE_URL=postgresql://localhost:5432/postgres` |
| Local PostgreSQL | **Available** (Postgres.app 16 on `127.0.0.1:5432`) — started for this audit |
| Fixture helper | `tests/helpers/foundationDb.js` → unique `blessboard_ft_*` databases + migrate |

**Honesty note:** If local Postgres had been unavailable, PostgreSQL-gated suites would be reported as **BLOCKED** / skipped — never as passed. This run did **not** treat unavailable DB as green.

---

## Category coverage

| Category | Files | Role |
|----------|------:|------|
| Unit / services / loaders | 20 | Facts, recommendation, checklist, phone/email services, duplicate scoring/query/decision, presenters |
| Rendering / UI | 10 | Queue, overview, verification/recommendation/checklist UI, phone/email forms, duplicate screens |
| Routes / HTTP (stubbed + integration) | 6 | Phone attempt, email resend/public, duplicate routes + query integration |
| CSRF / security | 2 | `blessboard-v5-csrf-action-audit`, `blessboard-phase2-056-security` |
| Permissions / registration ops | 4 | Admin applications HTTP, ops CSRF/auth, operator approval, risk review |
| Migration / repository | 3 | Phone attempts (036), email tokens (037), duplicate matches (038) |
| Platform Admin regression | 3 | Shell, registration nav, mobile burger/drawer |

### File inventory

**PA regression:**  
`blessboard-platform-admin-registration-nav.test.js`, `blessboard-platform-admin-shell.test.js`, `blessboard-platform-admin-mobile-nav.test.js`

**Queue / applications:**  
`blessboard-registration-queue-view-parity.test.js`, `blessboard-admin-registration-applications.test.js`

**Status / overview:**  
`blessboard-registration-status-presentation.test.js`, `blessboard-registration-detail-overview.test.js`

**Verification / recommendation / checklist:**  
`blessboard-registration-verification-facts.test.js`, `blessboard-registration-detail-verification-load.test.js`, `blessboard-registration-verification-ui.test.js`, `blessboard-registration-review-recommendation.test.js`, `blessboard-registration-detail-recommendation-load.test.js`, `blessboard-registration-recommendation-ui.test.js`, `blessboard-registration-approval-checklist.test.js`, `blessboard-registration-detail-checklist-load.test.js`, `blessboard-registration-approval-checklist-ui.test.js`

**Phone:**  
`blessboard-registration-phone-verification-storage.test.js`, `blessboard-registration-phone-verification-service.test.js`, `blessboard-registration-detail-phone-verification-load.test.js`, `blessboard-registration-phone-verification-ui.test.js`, `blessboard-registration-phone-verification-attempt-route.test.js`, `blessboard-registration-phone-verification-form.test.js`, `blessboard-registration-phone.test.js`

**Email:**  
`blessboard-registration-email-verification-storage.test.js`, `blessboard-registration-email-verification-service.test.js`, `blessboard-registration-email-verification-message.test.js`, `blessboard-registration-email-verification-delivery.test.js`, `blessboard-registration-email-verification-resend-route.test.js`, `blessboard-registration-email-verification-ui.test.js`, `blessboard-registration-email-verification-public-route.test.js`, `blessboard-registration-email-ownership-facts.test.js`

**Duplicates:**  
`blessboard-registration-duplicate-normalization.test.js`, `blessboard-registration-duplicate-scoring.test.js`, `blessboard-registration-duplicate-match-storage.test.js`, `blessboard-registration-duplicate-match-query.test.js`, `blessboard-registration-duplicate-match-query-integration.test.js`, `blessboard-registration-duplicate-matches-route.test.js`, `blessboard-registration-duplicate-matches-screen.test.js`, `blessboard-registration-duplicate-comparison-screen.test.js`, `blessboard-registration-duplicate-decision-service.test.js`, `blessboard-registration-duplicate-decision-route.test.js`, `blessboard-registration-duplicate-evidence-facts.test.js`

**CSRF / security / ops:**  
`blessboard-v5-csrf-action-audit.test.js`, `blessboard-phase2-056-security.test.js`, `blessboard-admin-registration-ops.test.js`, `blessboard-registration-operator-presenter.test.js`, `blessboard-registration-operator-approval.test.js`, `blessboard-registration-risk-review.test.js`

---

## First-run defects (fixed in this prompt)

Initial run against local Postgres: **592 pass / 3 fail / 2 skip** (exit 1). Failures were Phase2 test drift, not product redesign.

| Failure | Cause | Fix |
|---------|--------|-----|
| `platform-admin-mobile-nav` CSS cache-bust | Expected `platform-admin.css?v=31`; shell is `?v=46` | Assert `?v=46` |
| `email-verification-ui` stylesheet version | Expected `?v=41`; shell is `?v=46` | Assert `?v=46` |
| `verification-ui` omits “Resend Verification” | Regex matched legitimate Prompt 040 **Resend verification email** | Allow email resend; still forbid override / Run again / Start call |
| Duplicate query integration (2 skips) | Fixture created two **active** apps with the same `contact_phone_normalized`, violating `platform_church_reg_apps_phone_normalized_active_uidx`; suite skipped with a misleading “Local PostgreSQL unavailable” label | Use distinct phones; overlap via identical church name; clearer skip reason |

**Re-run after fixes:** **597 pass / 0 fail / 0 skip / 0 blocked**.

---

## PostgreSQL-gated suites (exercised this run)

| Suite | Migrations / storage covered |
|-------|------------------------------|
| Phone verification storage | `036_registration_phone_verification_attempts.sql` + repository |
| Email verification storage | `037_registration_email_verification_tokens.sql` + repository |
| Duplicate match storage | `038_registration_duplicate_matches.sql` + repository |
| Duplicate match query integration | Persist + list + comparison against real DB |
| Admin registration applications / ops / shell / phone / risk / operator approval | Full foundation migrate + HTTP |

None of these were marked passed without a live local DB.

---

## Explicit non-goals

- Approve / Reject / provision UX redesign  
- Real outbound email delivery (stub remains honest)  
- Document upload storage  
- Hosted Supabase as a destructive test target  
- Unrelated V4 / marketing / tenant admin suites outside the Phase2 1–7 inventory above  

---

## Related documents

- `PHASE2_008_IMPLEMENTATION_PLAN.md` — batch/test map  
- `PHASE2_055_FUNCTIONAL_AUDIT.md` — functional completeness  
- `PHASE2_056_SECURITY_AUDIT.md` — security  
- `PHASE2_057_RESPONSIVE_PARITY_AUDIT.md` — layout parity  

---

## Conclusion

Phase2 Prompts **1–7** route and database coverage is **green** on local PostgreSQL foundation fixtures: **597 passed, 0 failed, 0 skipped, 0 blocked**. Four test defects (three stale assertions, one duplicate-integration fixture) were fixed within Prompt scope; no product redesign outside Phase2 was required.
