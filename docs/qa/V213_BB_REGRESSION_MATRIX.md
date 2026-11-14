# V2.13 BlessBoard QA Regression Matrix (D04)

Baseline HEAD: `b8f6b420d25e908de64ba292866c218c32edc30c`  
Machine-readable source: `docs/qa/V213_BB_REGRESSION_MATRIX.json`

## Result taxonomy

| Result | Meaning |
|---|---|
| PASS | Assertion proved expected behavior |
| FAIL | Assertion failed against expected behavior |
| BLOCKED | Cannot execute safely (infra / DB hold / missing fixtures) |
| NOT_IMPLEMENTED | Product capability gap documented; not a concealed skip |
| NOT_RUN | Suite prepared but not executed (e.g. DB-writing stage gated off) |

Stable baseline contracts must PASS. Known V2.12 defects stay open until evidence closes them. Missing features use NOT_IMPLEMENTED contracts without inventing PASS evidence.

## Issues

| ID | Title | Unit | Integration | Browser | Product status |
|---|---|---|---|---|---|
| BB-01 | Homepage section editing | `tests/v13/unit/bb01-homepage-section-editor.test.js` + `tests/v13/contract/bb01-homepage-sections-contract.test.js` | `tests/v13/integration/bb01-homepage-sections.integration.test.js` | `tests/e2e/v13/v13-bb-qa-regression.spec.js` | REPAIRED_DB_INDEPENDENT_UNCOMMITTED (CTA button pending E2E) |
| BB-02 | Announcement image upload/visibility | `bb02-announcements-contract.test.js` | `bb02-announcements.integration.test.js` | same browser suite | REPAIRED_DB_INDEPENDENT_UNCOMMITTED |
| BB-03 | New event creation | `tests/v13/unit/bb03-event-creation.test.js` + `bb03-events-contract.test.js` | `bb03-events.integration.test.js` | same | REPAIRED_DB_INDEPENDENT_UNCOMMITTED |
| BB-04 | New sermon creation | `tests/v13/unit/bb04-sermon-creation.test.js` + `bb04-sermons-contract.test.js` | `bb04-sermons.integration.test.js` | same | REPAIRED_DB_INDEPENDENT_UNCOMMITTED |
| BB-05 | HQ member registration CSRF | `tests/bb05-hq-add-member-csrf-contract.test.js` + `bb05-member-registration-csrf-contract.test.js` | `bb05-member-registration.integration.test.js` | same | FIXED_LOCALLY_UNCOMMITTED |
| BB-06 | Member portal activation | `bb06-member-activation-contract.test.js` | `bb06-member-activation.integration.test.js` | same | REPAIRED_DB_INDEPENDENT_UNCOMMITTED |
| BB-24 | Public directory contact/join | `tests/v13/unit/bb24-public-directory.test.js` + `bb24-public-directory-contract.test.js` | `bb24-public-directory.integration.test.js` | same | REPAIRED_DB_INDEPENDENT_UNCOMMITTED |
| INV-01 | Invited staff password setup/login | `tests/v13/unit/inv01-staff-invitation.test.js` + `inv01-staff-invitation-contract.test.js` | `inv01-staff-invitation.integration.test.js` | same | LOGIN_NOT_EXECUTED |

## Previously passing sanity coverage

| ID | Scenario | Coverage |
|---|---|---|
| SANITY-01 | Platform admin login contract | `v13-previously-passing-sanity-coverage.test.js` |
| SANITY-02 | Public directory route | BB-24 contract + existing apex directory tests |
| SANITY-03 | Path-mode public church home | sanity coverage contract |
| SANITY-04 | HQ admin CSRF field contract | sanity coverage contract |
| SANITY-05 | Announcement admin routes mounted | BB-02 contract |
| SANITY-06 | About/version 2.13 | `tests/v213-version-initialization.test.js` |

## CI

Workflow: `.github/workflows/v13-bb-qa-regression.yml`

- Stage A: static + DB-independent unit/contracts (enabled on `workflow_dispatch`)
- Stage B/C: prepared disposable DB + browser stages; **not activated** in D04 (`GETPRO_V13_ALLOW_DB_WRITES` dual-gate required later)
- Stage D: consolidated QA report artifact

V12 workflows are untouched.
