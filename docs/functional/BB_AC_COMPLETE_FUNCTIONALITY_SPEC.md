# BlessBoard and ActiveClinic complete functionality specification

G120 ran the disposable database twice. Each HTTP run passed 30 of 34. Each Playwright run passed 43 of 43. The four HTTP failures are the unauthorized OTP challenge table and the unauthorized appointment locks. BlessBoard member login, staff invitation, and member recovery now pass in the browser. QA is NO-GO until those four HTTP gates pass. See `docs/qa/V13_G120_FINAL_MORNING_HANDOFF.md`.

Product version 2.13.2 development candidate. Branch `V13`. QA remains NO-GO. Hosted QA is not verified. This specification describes the system that is in the repository after G82. It does not describe a production deployment.

G82 executed safe tests, HTTP tests, and Playwright against the disposable database `getpro_v13_e2e_g78d2301` only. G88, after the G83–G87 repairs, recorded safe tests 526 passed, 0 failed, 2 skipped; HTTP 34 executed, 20 passed, 14 failed, 0 skipped; Playwright 43 executed, 19 passed, 24 failed, 0 skipped. Migrations 043 and 044 are applied on that disposable database and were not applied to hosted QA or production. Implementation counts below are unchanged. AC-REG-01, AC-AUTH-04, and AC-REC-03 are `VERIFIED_E2E`. The release is not ready.

The healthcare brief PDF and both office QA documents are `SOURCE_UNAVAILABLE`. Repository evidence is the source, the migrations, the database-free tests, and the G01–G36 reports.

## 1. Executive overview

ActiveClinic covers organisation setup, patients, visits, reception, nursing, consultation, laboratory, pharmacy, billing, closeout, and text records. BlessBoard covers church registration, branches, members, the public website, themes, sermons, events, announcements, and a fail-closed media switch. The shared platform covers sessions, CSRF, OTP, roles, and jobs.

Sixteen ActiveClinic requirements and thirteen BlessBoard requirements are implemented and unverified as product rows. Seven ActiveClinic and three BlessBoard requirements are partial. Six ActiveClinic requirements and one BlessBoard requirement are blocked. One ActiveClinic requirement is deferred. Those are implementation counts. G82 browser passes cover staff sign-in, portal activation, appointment collision, selected clinical denials, G66 preview, G67 queue notice, AC-REG-01, AC-PUB-01’s disabled state, BB-05 member registration, and the D14C OTP gate staying blocked. Those passes do not change the 30 and 17 implementation totals, and they do not make the release ready.

## 2. Product architecture

Node.js, Express, EJS, and PostgreSQL. ActiveClinic code is under `src/activeclinic`. BlessBoard code is under `src/blessboard`. Shared code is under `src/platform`. Tests for this release line are under `tests/v13` and `tests/e2e/v13`. Marketing visual rules for other worktrees do not change these QA boundaries.

## 3. Tenant and organisation models

An ActiveClinic tenant is an organisation with healthcare organisations and facilities. A BlessBoard tenant is a church with branches. Writes carry the organisation or church id. Cross-tenant ids fail closed.

## 4. User roles

ActiveClinic uses organisation admin, receptionist, nurse, clinician, laboratory, pharmacy, and billing permissions. BlessBoard uses HQ and branch roles. A receptionist does not triage. A nurse’s triage permission does not grant pharmacy dispense. Portal activation is not part of member create.

## 5. Permission model

Routes call the existing permission gates. Receptionist organisation-scoped role assignment is `invalid_scope`. Laboratory queue, pharmacy, billing, documents, and the practitioner worklist each have their own permission. Denial tests exist and are `NOT_RUN`.

## 6. ActiveClinic modules

See [ACTIVECLINIC_FUNCTIONALITY.md](ACTIVECLINIC_FUNCTIONALITY.md). The journey is registration, encounter, reception, triage, consultation, laboratory, pharmacy, billing, closeout, and text retrieval.

## 7. BlessBoard modules

See [BLESSBOARD_FUNCTIONALITY.md](BLESSBOARD_FUNCTIONALITY.md). Public pages are partial because fixture rows are absent. Media is partial because the deployment switch defaults off.

## 8. Shared platform modules

See [SHARED_PLATFORM_FUNCTIONALITY.md](SHARED_PLATFORM_FUNCTIONALITY.md).

## 9. Feature configuration

Public booking stays disabled unless `publicBookingEnabled` is true. Coupons are deferred. Media uploads stay off unless `BLESSBOARD_MEDIA_UPLOADS_ENABLED` is an explicit enable value. Juflona two-screen signing is not turned on globally. Product version stays 2.13.1.

## 10. Database and migration dependencies

See [DATABASE_AND_MIGRATION_DEPENDENCIES.md](DATABASE_AND_MIGRATION_DEPENDENCIES.md). Migration 043 is prepared and not executed. The safe suite expects 222 migration files.

## 11. User journeys

See [COMPLETE_USER_JOURNEYS.md](COMPLETE_USER_JOURNEYS.md).

## 12. APIs and routes

ActiveClinic: `/app/patients`, `/app/clinical`, `/app/clinical/start-encounter`, encounter triage, vitals, diagnosis, and `order/:orderType`, `/app/reception`, `/app/diagnostics/laboratory/queue`, `/app/pharmacy`, `/app/billing`, `/app/clinical/patients/:patientId/documents`, `/app/offline`. BlessBoard: `/hq/members`, `/hq/announcements`, `/hq/content` structured drafts, `/invite/accept`. These are server-rendered posts, not a separate public API catalogue.

## 13. Browser screens

ActiveClinic screens are the EJS app pages for those routes. BlessBoard screens are the HQ and website editors. Playwright specs exist and call `hold()` before navigation. They were not run.

## 14. Business rules

Laboratory urgency is only routine, urgent, or stat. A laboratory result is abnormal or critical only when the component includes an approved reference rule for that organisation, facility, test, and unit. No default range is stored in code. Migration 044 can hold those rules later and has not been applied. Prescription entry is manual and requires drug name, dose, frequency, and duration. An optional unit and an optional catalogue item id do not choose a drug. Dispense quantity must be a positive integer within the remaining amount, the same item cannot be repeated in one request, and dispense requires the dispense permission. Billing uses integer minor units. A signed consultation cannot be overwritten. Paper disposal returns legal approval required and does not delete. Patient merge stays deferred. Diagnosis codes, reference ranges, and payment providers are not invented.

## 15. Security requirements

CSRF mismatch is 403. OTP is fail-closed. Queries include tenant and facility or branch scope. Appointment updates keep `STALE_VERSION`. No authorization flag was weakened to make a test pass.

## 16. Audit requirements

Existing audit helpers redact sensitive values. Role changes, clinical writes, payments, and publishes use the audit paths already in those services. This phase did not add an audit event by executing a workflow.

## 17. Reports and exports

The billing revenue report route exists and was not executed. `runDataJobExport` was not executed. No new clinical report metric was added. BlessBoard reporting stays blocked.

## 18. External integrations

No national registry, insurer, card processor, production SMS, production email, or object-storage provider was connected. Interoperability stays deferred.

## 19. Automated test coverage

Database-free unit and contract tests are the executed evidence. G46–G52 added encounter handoff behavior tests and a denied migration-batch call. The safe suite passed 475 and failed 0. Integration files remain 18 and must call `runGated`. ActiveClinic Playwright names remain 18. BlessBoard Playwright names remain 23. Gated results are `NOT_RUN`.

## 20. Manual QA acceptance criteria

See [QA_ACCEPTANCE_CHECKLIST.md](QA_ACCEPTANCE_CHECKLIST.md). Every box is open.

## 21. Deferred features

AC-29 interoperability. Enabled public booking. Booking coupons. Binary clinical files. A clinical amendments table. Automatic patient merge. A new prayer module.

## 22. Remaining development gaps

See [FEATURE_STATUS_AND_GAPS.md](FEATURE_STATUS_AND_GAPS.md). The actionable code that did not need a new policy is already present. Further completion needs authorization to apply 043, insert public pages, enable media, or approve a catalogue and clinical catalogues.

## 23. Migration readiness

043 can be reviewed as additive source. It is not ready to run until an isolated database authorization names that migration. There is no down script. Recovery is a later forward migration.

## 24. Deployment dependencies

Do not deploy. CI database stages stay disabled. V13 is not a push branch in the main CI workflow. Hosted QA and production were not targeted.

## 25. Release readiness

Not production-ready. Not healthcare-compliance-ready. The next safe action is an authorized isolated HTTP and Playwright run on `127.0.0.1:55432`, without applying 043, enabling booking, or turning on media uploads.

Counts: ActiveClinic 16 implemented, 7 partial, 6 blocked, 1 deferred. BlessBoard 13 implemented, 3 partial, 1 blocked.
