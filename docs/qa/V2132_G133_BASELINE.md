# V2.13.2 G133 — baseline, version, and QA inventory

Branch `V13`. Committed HEAD and `origin/V13` both equal `49763ea34233b0d5948c3f148e913f8bab1635f5` (`V2.13.2: fix ActiveClinic QA defects and harden BB AC regression coverage`). That matches `EXPECTED_BASE_SHA`. `main` was not modified. This file does not record a new commit SHA. G133–G135 source and test edits are uncommitted on top of that HEAD.

BlessBoard version 2.13.2. ActiveClinic version 2.13.2. The G132 version bump was not repeated.

## Version agreement

`VERSION_BASE_V8` and `PRODUCT_VERSION_V8` in `src/platform/build/applicationBuildInfo.js` are `2.13.2`. `VERSION_ORDER` in `src/platform/release-notes/releaseNotesCatalog.js` ends at `2.13.2` and still contains `2.13` and `2.13.1`. The 2.13 and 2.13.1 catalog entries were not rewritten.

Both About pages display 2.13.2:

- `views/blessboard/v5/apex/about.ejs`
- `views/activeclinic/public/about.ejs`

`tests/v213-version-initialization.test.js` still asserted that the current constants were 2.13.1. That assertion was updated to 2.13.2. The historical 2.13 and 2.13.1 checks in that file were left in place.

Release notes: `docs/releases/V2.13.2_RELEASE_NOTES.md`. Catalog `qaVerification` remains NO-GO. Hosted QA is not claimed.

## Incoming baseline from G132

Database-free suite: 551 passed, 0 failed, 2 skipped, of 553 tests.

HTTP: 31 passed, 3 failed, of 34. Failures were D14C, D16 platform OTP, and D25 slot. D25 overlap passed.

Playwright: ActiveClinic 20 passed, BlessBoard 23 passed, combined 43 passed, 0 failed.

## Outstanding items at the start of this cycle

| ID | Incoming status |
|---|---|
| AC-FU-PORTAL-01 | Implemented. Not a new browser proof. |
| AC-FU-PORTAL-02 | Public self-registration is a product-policy mismatch. |
| AC-FU-PORTAL-04 | OTP excluded. `platform.otp_challenges` is not created. |
| AC-FU-WEB-02 | New text and images were not publicly verified. Production upload stays off. |
| AC-FU-CLIN-03 | Correction form existed. Persistence was not its own HTTP case. |
| D25 slot | `BLOCKED_APPROVAL_REQUIRED`. Approval blocker. |
| D25 overlap | Passing inside the appointment transaction. |
| D14C / D16 | OTP persistence blocked. No migration 048. |

## ActiveClinic regression tests by path

Playwright file `tests/e2e/v13/v13-ac-platform-qa.spec.js` had 20 tests before this cycle. BlessBoard file `tests/e2e/v13/v13-bb-qa-regression.spec.js` has 23 tests.

HTTP coverage is the gated integration files, not a separate invented suite:

- `tests/v13/integration/d04-critical-regression.integration.test.js`
- `tests/v13/integration/d05-regression.integration.test.js` (AC-WEB-08, AC-WEB-09, AC-REC-02, AC-REC-03, AC-PUB-01)
- `tests/v13/integration/d14c-otp-auth.integration.test.js`
- `tests/v13/integration/d16-ac-auth.integration.test.js`
- `tests/v13/integration/d16-platform-otp.integration.test.js`
- `tests/v13/integration/d24-patient-portal.integration.test.js`
- `tests/v13/integration/d25-appointment-concurrency.integration.test.js`
- `tests/v13/integration/g03-laboratory.integration.test.js`
- `tests/v13/integration/g04-pharmacy-billing.integration.test.js`
- `tests/v13/integration/g05-records.integration.test.js`
- `tests/v13/integration/g66-reference-rules.integration.test.js`
- `tests/v13/integration/inv01-staff-invitation.integration.test.js`

Portal unit and contract coverage already on disk:

- `tests/v13/unit/d24-patient-portal-security.test.js`
- `tests/v13/unit/d47-patient-portal.test.js`
- `tests/v13/unit/d57-behavioral-strengthening.test.js`
- `tests/v13/unit/d72-patient-facility.test.js`
- `tests/v13/contract/d24-patient-portal-contract.test.js`
- `tests/v13/contract/g122-patient-activation.test.js`

Vitals unit coverage already on disk: `tests/v13/unit/g125-vitals-correction.test.js`.

About and release-note contracts: `tests/about-v11-platform.test.js`, `tests/v8-about-version-2.test.js`, `tests/v212-version-initialization.test.js`, `tests/v213-version-initialization.test.js`, `tests/v13/unit/d17-platform-http-behavior.test.js`.

## Tracked tree at inspection

Untracked files left untracked: `bb-lifecycle.log`, `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`. `.v13-isolated-pg/` stays gitignored.

Later results for this cycle are in `docs/qa/V2132_G134_PATIENT_AND_VITALS_RESULTS.md` and `docs/qa/V2132_G135_WEBSITE_PUBLICATION_RESULTS.md`.
