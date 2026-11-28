# V2134 G330 release manifest for the G329 booking patch

RELEASE_STATE=LOCAL_UNCOMMITTED  
PATCH_DEPLOYMENT_APPROVED=NO  
MIGRATION_REQUIRED=NO  
PUBLIC_BOOKING_REMAINS_CLOSED=YES  

The patch is the local G329 work on base `d5c5369d22fd825938fe1a9692dadee19bfd4a93`. It has no commit. This manifest reviews it. It does not set `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` and does not enable public booking.

## Exact G329 files

Application and tests:

| File | State |
| --- | --- |
| `src/activeclinic/services/publicBookingAdmission.js` | new |
| `src/activeclinic/services/activeClinicPublicBookingService.js` | modified |
| `src/activeclinic/http/activeClinicPublicBookingRoutes.js` | modified |
| `tests/v13/unit/g329-public-booking-admission.test.js` | new |
| `tests/v13/unit/d48-appointment-engineering.test.js` | modified |
| `tests/v13/integration/d05RegressionRunners.js` | modified |

G329 reports, also uncommitted:

| File | State |
| --- | --- |
| `docs/qa/V2134_G329_BOOKING_POLICY_PATCH.md` | new |
| `docs/qa/V2134_G329_LOCAL_REGRESSION.md` | new |
| `docs/qa/V2134_G329_CONTROLLED_DEPLOYMENT_REQUEST.md` | new |

Tracked diff at review time: 4 files, 91 insertions. The two new source and test files are untracked, so they are outside that stat and must be included in the future commit. `docs/qa/V2134_G328_HOSTED_SAFETY_AUDIT.md` stays untracked and is not part of the patch.

Leave these existing untracked files out of the patch commit: `bb-lifecycle.log`, `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`.

## Source diff summary

`publicBookingAdmission.js` is the contract.

- Missing, empty, `1`, and `true` stay closed.
- The only opening value is the exact string `enabled`.
- `DEPLOYMENT_ENV`, `DATABASE_IDENTITY_ENV`, or `EXPECTED_DATABASE_ENV` of `production`, or `PLATFORM_DEPLOYMENT_CODE=moovex-platform-production`, stays closed even when the value is `enabled`.
- `NODE_ENV=production` on the testing host does not by itself close a future approved value. The hosted testing process already reports `nodeEnv=production` with `deploymentEnv=testing`.

`activeClinicPublicBookingRoutes.js` mounts `app.use("/clinics/:clinicKey/book")` before the wizard. GET and POST, including consultation submit and procedure submit, resolve the clinic and return HTTP 403 while the contract is closed. An unknown clinic returns the existing HTTP 404 page. `resolveBookableClinic` repeats the same refusal. The clinic column `public_booking_enabled` is consulted only after the platform contract is open.

`activeClinicPublicBookingService.js` returns `{ ok: false, code: "booking_not_enabled", booking: null }` from `createConsultationBookingRequest` and `createProcedureBookingRequest` before any query.

`createAppointment` in `activeClinicAppointmentService.js` does not reference the contract. Appointment routes are unchanged. My-booking lookup, cancel, reschedule, and patient-portal management of an existing booking stay outside the `/book` mount.

The `d48` test passes the exact testing value only inside that test so its mock insert can still run. The process environment is left unset.

## Database

No SQL file is in the patch. No migration is required to deploy it. Do not apply platform `048`, ActiveClinic `043` or `044`, or BlessBoard `123`–`130` as part of this release. `schemaCompatible=true` on the host remains the V7 health check only.

Denied requests return before an insert. The local AC-PUB-01 run kept `activeclinic.public_booking_requests` unchanged and left that clinic’s appointment count at 0. Do not update `public_booking_enabled` on the hosted database. A true clinic flag does not open the platform contract.

## Environment

Leave unset on the testing app:

- `GETPRO_AC_PUBLIC_BOOKING_ADMISSION`

Also leave inactive, as already required by G326: production OTP activation, a fixed OTP code, live OTP delivery, Community Benefits financial posting, and SMS delivery.

The running testing identity stays `DEPLOYMENT_ENV=testing`, `DATABASE_IDENTITY_ENV=testing`, and `PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing`.

## Expected HTTP responses after the patch SHA is running

| Request | Expected |
| --- | --- |
| `GET /clinics/julflona-clinic/book` | HTTP 403. Title `Booking not available`. Lead contains `Online booking is not currently offered` |
| `GET /clinics/activeclinic-demo/book` | the same 403 |
| `POST` to either booking URL, including `/book/submit` and `/book/procedures/.../submit` | HTTP 403, and no new `public_booking_requests` row |
| Unknown clinic `GET /clinics/<unknown>/book` | HTTP 404, with no booking form |
| Staff appointment routes | still available to an authorized tester |

On the current hosted SHA those two clinic GET URLs return HTTP 200 and a live wizard. That is the unpatched behavior. Do not POST to them while this SHA is running.

## Rollback

Before the patch has a commit, rollback is to leave the worktree unpushed. The host stays on `d5c5369d22fd825938fe1a9692dadee19bfd4a93`.

After an approved deploy, the code rollback is a controlled checkout of that same pre-patch SHA. The patch has no migration, so the code rollback does not restore the database and does not delete appointment rows. Restore the testing database only if a later approved action wrote data and the owner approves that restore. Do not restore a production database.

## Backup required before an intentional restart

G326 still stands. Record a testing snapshot id, time, and retention outside git after `platform.database_identity` is confirmed `moovex-platform-v7` / `testing`. A written plan is not a snapshot. `HOSTED_BACKUP_VERIFIED=NO`.

## Local regression commands

Use only `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`. G329 already ran these on the settled patch:

| Command | Result |
| --- | --- |
| `npm run test:v13:contract` | 687/687 twice |
| `node .v13-isolated-pg/g79-run.cjs` | 41/41 twice |
| `node .v13-isolated-pg/g80-playwright.cjs ac` | 36/36 twice |
| `node .v13-isolated-pg/g80-playwright.cjs bb` | 23/23 twice |
| `npm run test:v13:otp-security` | 15/15 twice |

Run them again on the future patch commit before that commit is deployed. The preflight must still refuse a database whose `public_booking_enabled` count is not zero.

## Hosted smoke, only after the patch SHA is the running SHA

1. Read both `/healthz` endpoints. Require the approved patch SHA, `environment=testing`, and `deploymentCode=moovex-platform-testing`.
2. GET `/clinics/julflona-clinic/book` and `/clinics/activeclinic-demo/book`. Require HTTP 403 and the sentence `Online booking is not currently offered`. If either page is still the wizard, stop. Do not POST.
3. After both GETs show the patched page, one synthetic POST to each clinic’s `/book` and `/book/submit` must return HTTP 403. Use synthetic names only. Then read the request count for those two clinics and require it to be unchanged. If the count moved, stop and use the code rollback.
4. Staff scheduling is a separate authorized QA session. Do not create a public booking to prove it.
5. Hosted acceptance of the 64 cases, and one real email OTP, remain separate. This smoke does not mark the release GO.
