# V2134 G328 hosted safety and deployment control audit

FINAL=V2134_G328_HOSTED_SAFETY_AUDIT

HEAD_SHA=`d5c5369d22fd825938fe1a9692dadee19bfd4a93`  
AUTO_DEPLOY_VERIFIED=YES  
AUTO_DEPLOY_ROOT_CAUSE=Hostinger git deploy is following `origin/V13`. The panel toggle was not opened.  
PUBLIC_BOOKING_GET_EXPOSURE=YES  
BOOKING_SUBMISSION_POLICY_SOURCE=clinic column `public_booking_enabled` only  
BOOKING_POLICY_VIOLATION=YES  
MINIMAL_PATCH_REQUIRED=YES  
SCHEMA_COMPATIBILITY=V7_HEALTH_PASS_SOURCE_LEDGER_BEHIND  
MISSING_MIGRATIONS_CLASSIFIED=YES  
BACKUP_EVIDENCE=NONE  
RESTORE_VERIFICATION_STATUS=NOT_VERIFIED  
HOSTED_QA_READINESS=NO-GO  
OWNER_APPROVAL_NEEDED=A backup proof; B any hosted data change; C pin and auto-deploy control; D the booking gate patch; E real email OTP  
SOURCE_CHANGED=NO  
COMMIT=NO  
PUSH=NO  
DEPLOYMENT=NOT_PERFORMED  
HOSTED_DB_WRITES=NO  
MAIN_UNCHANGED=YES  

NEXT_SAFE_ACTION=Leave the host untouched. The owner disables automatic deployment for the testing app and pins one named SHA. Do not restart, do not write the database, and do not apply the booking patch until those approvals are separate and explicit.

This file is local and uncommitted. No Hostinger setting, worker, or database row was changed. No booking was submitted.

## Phase 1 — automatic deployment

### Verified

| Evidence | Result |
| --- | --- |
| Local `V13` and `origin/V13` | `d5c5369d22fd825938fe1a9692dadee19bfd4a93` |
| Both `/healthz` endpoints during this audit | `gitSha=d5c5369d22fd`, `branch=V11`, `branchSource=GETPRO_GIT_BRANCH`, `environment=testing`, `deploymentCode=moovex-platform-testing`, `ok=true`, `jobsEnabled=false` |
| Shared checkout | Both hostnames report hbuild version `01a22101-fd7a-70b4-8fd2-2a5a6c32a9c2`. Worker start `2026-11-28T07:23:55.656Z` |
| `origin/V11` | `fbe7bea01f4e8d107b519b52b68e42e5b1c55686`. It does not contain the running commit |
| Local `main` | `44eafec486a18aeef2777bbcc9683e43f68ebe0d`, unchanged |
| GitHub Actions, repo webhooks, deployment records | No webhook. No deployment object. No deploy workflow ran for these commits |
| Branch label | `src/platform/runtime/buildIdentity.js` uses live `GETPRO_GIT_BRANCH` before the git branch. `GETPRO_GIT_SHA` is unset, so the SHA comes from the checkout |

Documentation-only pushes that became the hosted SHA:

| Commit | What it contains | Hosted result |
| --- | --- | --- |
| `5ae57d1f3195` | G326 QA documents | New shared checkout after the push. Label stayed `V11` |
| `5550bc0eabf7` | ActiveClinic Stitch inventory documents | New hbuild `01a220fc-6fa0-732b-ae91-d5c4bce32234` about two minutes after the commit |
| `d5c5369d22fd` | G327 QA documents | New hbuild `01a22101-fd7a-70b4-8fd2-2a5a6c32a9c2` at 07:23:55Z. This is the SHA running now |

The application code under those three commits is the same as `c947d26cb57e`. The hosted process still changed directory and restarted.

### Inferred

The panel page that turns automatic deployment on was not opened. The inferred control is Hostinger's git integration for the testing Node app, tracking `V13`. That is the mechanism described in `docs/platform/V7_HOSTINGER_TESTING_ENV.md`: a push is followed, within minutes, by a Hostinger git deploy. The observations match that mechanism and do not match GitHub Actions or `origin/V11`.

A process restart of the current directory would keep the current hbuild id. Each advance above replaced the directory. Changing `GETPRO_GIT_BRANCH` does not pin the SHA. The label stayed `V11` through every checkout.

### How to pin a release

This is a recommendation. It was not performed.

1. Stop pushing to `origin/V13` until the owner finishes this list. A push of this audit would itself become the next hosted SHA.
2. On the testing app only, turn off automatic git deployment.
3. Choose one SHA in writing. `d5c5369d22fd` is what both hosts run now. `c947d26cb57e` is the last commit that changed application code. They are the same application code. The owner names one of them. Do not deploy a third SHA as part of the pin.
4. If the panel can deploy an exact commit with automatic deployment left off, deploy that named SHA once and restart only the testing workers. If the running SHA is already the named SHA, do not restart.
5. Read both `/healthz` endpoints. Require that SHA, `environment=testing`, and `deploymentCode=moovex-platform-testing`.
6. Take backup approval A before any restart that is not already completed by the deploy above.
7. Leave the `V11` label for approval C. The label does not select the checkout.

Do not point the checkout at `origin/V11`.

## Phase 2 — public booking

Anonymous GET on the current SHA:

| URL | HTTP | What rendered |
| --- | --- | --- |
| `/clinics/julflona-clinic/book` | 200 | Wizard step, service choices, `POST` form to that URL, button "Continue to provider" |
| `/clinics/activeclinic-demo/book` | 200 | The same wizard and form |
| `/clinics/qa-visual-check/book` | 403 | "Booking not available" and "Online booking is not enabled for this clinic yet. Use the contact page to request an appointment — this page does not take live bookings." |

No form was posted.

### Why the wizard renders

`GET /clinics/:clinicKey/book` in `src/activeclinic/http/activeClinicPublicBookingRoutes.js` has three outcomes:

1. `publicBookingEnabled !== true` and the visitor is not a website editor: HTTP 403 and the unavailable page. `qa-visual-check` took this path.
2. `publicBookingEnabled !== true` and `websiteEdit`: an intro page whose copy says booking is off for visitors. That page has no submit button.
3. Otherwise: the live wizard, a draft cookie, and a `POST` form. The two named clinics took this path.

An anonymous request cannot take path 2. `websiteEdit` requires an authenticated clinic session for that organization and the website edit permission (`sameClinicOrganization` and `allowsClinicWebsiteAction` in `src/activeclinic/http/attachActiveClinicWebsiteChrome.js`). The live pages contain "Continue to provider" and do not contain "Online booking is off for visitors." The clinic flag is therefore true for those two clinics.

The services on the form come from `listPublicServices`, which returns rows with `status='active'` and `public_bookable=true`. They are not a disabled service advertised by mistake. The page also includes the static note that SMS reminders are not sent.

The demo seed sets `public_booking_enabled=true` when it updates a healthcare organization (`src/activeclinic/services/activeClinicDemoClinicSeedService.js`). This audit did not read that column with SQL. The HTTP response is the evidence the effective flag is true.

### Submission

`resolveBookableClinic` returns the 403 page when `publicBookingEnabled !== true`. `POST /clinics/:clinicKey/book/submit` and the wizard posts use that function. `createConsultationBookingRequest` queries `public_booking_enabled` again and refuses the insert when it is not true.

When the column is true, those functions accept the booking. CSRF and the rate limiter still apply. There is no environment kill switch and no second policy flag. `financialPostingEnabled()` is a hard `false`. Public booking is not.

BOOKING_SUBMISSION_POLICY_SOURCE=the clinic column only.  
BOOKING_POLICY_VIOLATION=YES. The release rule is that public booking stays disabled. Two anonymous clinic URLs render a submittable wizard. One other clinic correctly shows the unavailable page, so the 403 path works.

### Proposed patch, not applied

Add one helper, `publicBookingAdmissionEnabled()`, that returns `false`.

Use it in two places:

- At the start of `GET /clinics/:clinicKey/book`, before the live wizard. Anonymous visitors receive the existing 403 unavailable page even when the clinic column is true. A signed-in website editor may still see the existing intro that says booking is off for visitors.
- Inside `resolveBookableClinic`, before the clinic-column check. Every wizard `POST` and `POST /book/submit` then returns that same 403 page and does not call `createConsultationBookingRequest`.

Do not change the stored column in this patch. Do not add an environment value that turns booking on. A later approval can add an explicit opt-in. Until then the helper stays `false`, on the same pattern as `financialPostingEnabled()`.

The public nav still says "Book Appointment" when the column is true. The route change makes that link land on the unavailable page. A follow-up in the same patch can force the public label to the request wording while admission is false. That label change is presentation only.

Regression to run locally, on a disposable database, before any push:

- Anonymous GET of a clinic with the column true returns 403 and the unavailable copy, with no "Continue to provider" control.
- Anonymous GET of a clinic with the column false stays 403.
- `POST /book/submit` with the column true does not insert a booking row.
- The editor intro still has no submit button.
- Existing clinic-flag tests still pass.
- SMS copy still says reminders are not sent.
- No hosted request is part of this regression.

This patch is not in the worktree.

## Phase 3 — schema

`/healthz` reports `schemaCompatible=true` and an empty missing list. That check is the V7 set in `src/platform/schema/v7RuntimeSchemaCompatibility.js`. The newest required ActiveClinic file in that set is `034`. The newest required BlessBoard file in that set is `099`. Platform `047` is applied. The check does not include `043`, `044`, or BlessBoard `123` through `130`.

The hosted ledger from the G327 read-only transaction, which was not repeated here:

| Gap | Class | Why |
| --- | --- | --- |
| ActiveClinic `043_record_migration_inventory.sql` | OPTIONAL | Creates record-migration and retention tables. The record-migration service writes them only when that feature is used. Boot, `/healthz`, and the 64 clinical rows do not require them |
| ActiveClinic `044_laboratory_reference_rules.sql` | OPTIONAL | Creates `activeclinic.laboratory_reference_rules`. Application runtime does not query that table. Laboratory result entry in the current source does not depend on it |
| BlessBoard `123_public_contact_submissions.sql` | OPTIONAL | BlessBoard V5 contact storage. ActiveClinic acceptance does not read it. A BlessBoard contact write would need it |
| BlessBoard `124_activeclinic_facility_view_all.sql` | OPTIONAL | Inserts one permission and two role grants. Missing, the extra permission is absent. Existing facility screens do not require the new key to boot |
| BlessBoard `125_branch_service_times_mode.sql` | OPTIONAL | Adds `blessboard.branches.service_times_mode`. The service-times repository selects it. Public BlessBoard pages already return 200 without that screen. Opening the service-times editor before the migration would fail |
| BlessBoard `126` and `127` website restore provenance | OPTIONAL | Columns on `blessboard.website_publication_versions`. Needed for that restore path, not for the clinical acceptance rows |
| BlessBoard `128_canonical_hq_website_scope_ref.sql` | OPTIONAL | Church-wide website ownership backfill. Not part of the 64 rows |
| BlessBoard `129` and `130` member portal invitations | DEFERRED_BY_POLICY | Member invitation storage. Staff invitations stay on `blessboard.user_invitations`. Do not apply during this acceptance. Using the ordinary-member invitation flow first would fail |
| Platform `048_otp_challenges.sql` | DEFERRED_BY_POLICY | The file is not in source. Do not create it. Production OTP stays inactive. `deliveryActivated` is false on the OTP adapters |

Every row above also REQUIRES_OWNER_APPROVAL before it is applied. None is REQUIRED_FOR_CURRENT_WORKFLOW for boot or for the 64 ActiveClinic acceptance rows. Applying one is a hosted write and stays unauthorized.

## Phase 4 — backup and restore

BACKUP_EVIDENCE=NONE. No snapshot id, retention period, or encryption setting is recorded. The Supabase backup screen was not opened. A plan in `docs/qa/V2134_G326_BACKUP_ROLLBACK_PLAN.md` is not a snapshot. `docs/qa/V212_BACKUP_RESTORE_VERIFICATION.md` restored a local disposable database.

The testing credential and the production credential use the same pooler host, `aws-0-eu-central-1.pooler.supabase.com`, the same port `5432`, and the same database name `postgres`. Their project logins differ. They are two projects on one regional pooler. A testing snapshot does not protect production. A restore aimed at the wrong project would. The G327 identity read, not repeated here, found `moovex-platform-v7` / `testing` on the testing credential. Confirm that row again immediately before any backup.

Minimum verification, after approval A, and not done now:

1. Confirm the provider project is the testing project, and that `platform.database_identity` is `moovex-platform-v7` / `testing`.
2. Take one provider snapshot of that project. Record the snapshot id, the clock time, the retention, and whether the provider encrypts it. Keep the id outside git.
3. Restore that snapshot into a new empty database or a provider scratch branch. Do not restore onto the live testing database. Do not restore onto production. Do not dump through a laptop connection to port `5432`.
4. On the scratch target, read the identity row, the migration counts by module, and one non-clinical aggregate such as the `platform.schema_migrations` count.
5. Discard the scratch target. If the live database was not written, it does not need a rollback.
6. If a later approved action writes the live testing database and must be undone, stop workers, restore that snapshot onto the testing project only, and read both `/healthz` endpoints before opening the app again.

RESTORE_VERIFICATION_STATUS=NOT_VERIFIED.

## Phase 5 — release readiness

Hosted execution on `5550bc0eabf7`, re-read on `d5c5369d22fd`. Those SHAs differ by the G327 documents only. The booking GET results in this audit are from `d5c5369d22fd`.

| Result | Rows |
| --- | --- |
| Hosted PASS | RT-01, RT-02 |
| Hosted FAIL | RT-03 |
| NOT_RUN | the other 61 rows |

RT-01 is the ActiveClinic origin, HTTP 200. RT-02 is the published Julflona demonstration page, HTTP 200. RT-03 fails because booking is publicly reachable. The 60 local workflow passes stay local. They are not hosted passes.

Preserved, and not retested as hosted passes:

| Rule | State |
| --- | --- |
| RT-31 chart-first refusal | Unchanged in source. Not executed on the host |
| Public booking disabled | Violated on two clinic URLs. The proposed gate is not applied |
| SMS | The booking page says reminders are not sent. The booking service has no SMS send. RT-08 was not submitted |
| Community financial posting | `financialPostingEnabled()` returns false |
| Production OTP | Adapters keep `deliveryActivated` false. Migration `048` does not exist |
| Real email OTP | Not sent. RT-07 remains unverified |

HOSTED_QA_READINESS=NO-GO.

## Approvals still required

| ID | Decision | Why it is separate |
| --- | --- | --- |
| A | Create a testing snapshot and prove a scratch restore | No snapshot exists |
| B | Any hosted write, including turning `public_booking_enabled` off or running the 64 write cases | This audit did not write |
| C | Turn off automatic deployment, pin one SHA, and restart only if that pin requires it | A push currently replaces the running checkout |
| D | Apply the booking admission patch on a branch and run the local regression | The patch is a proposal |
| E | One real Resend message to the approved QA mailbox | RT-07 is open |

Approving one row does not approve another.

NEXT_SAFE_ACTION=Do not push this report. The owner turns off Hostinger automatic deployment for the testing app and records the pinned SHA. Backup proof A comes before a restart or any database write. The booking patch stays unapplied until approval D.
