# V2134 G330 controlled deployment runbook

STATUS=NOT_STARTED  
STAGES_PERFORMED=NONE  

Stages A through I are the future sequence. This review did not perform any of them.

The patch stays in the local worktree until A, B, C, and D are complete. A push before A deploys the patch through the Hostinger git integration that G328 verified.

## A. Owner disables automatic deployment

Owner approval C. The operator follows `docs/qa/V2134_G330_DEPLOYMENT_CONTROL_CHECKLIST.md` on the testing app `moovex-platform-testing` only.

If turning the control off restarts workers or replaces the checkout, stop. Complete stage C and get a separate restart approval before continuing. Do not prove the control with a test commit.

## B. Operator confirms the checkout is pinned

Both `/healthz` endpoints show `gitSha=d5c5369d22fd`, `environment=testing`, and `deploymentCode=moovex-platform-testing`. `origin/V13` is still `d5c5369d22fd825938fe1a9692dadee19bfd4a93`. The recorded git-deploy control is off.

That SHA is the pin. It does not contain G329. Do not restart a matching checkout. Do not move the app to `origin/V11`.

## C. Owner authorizes and verifies testing backup and restore safeguards

Approval A. Use `docs/qa/V2134_G326_BACKUP_ROLLBACK_PLAN.md` and the G328 restore limits.

Confirm `platform.database_identity` is `moovex-platform-v7` / `testing`. Take one provider snapshot of that testing project. Record the snapshot id, time, retention, and encryption outside git. Restore it only to a scratch target, read the identity row and migration counts there, and discard the scratch target. Do not restore onto the live testing database or onto production.

`HOSTED_BACKUP_VERIFIED` stays `NO` until that scratch restore is recorded.

## D. Owner explicitly approves the G329 deployment

Approval F in the G329 request. The approval names the reviewed patch files in `docs/qa/V2134_G330_G329_RELEASE_MANIFEST.md`. It leaves `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` unset. It does not approve hosted data changes, clinic flag edits, migrations, live OTP, or the 64-case hosted acceptance.

## E. Create and review a dedicated patch commit

Only after A through D.

On branch `V13`, commit the nine G329 files. Include the G330 documents in that commit only if the owner wants the runbook in the deployed tree. Exclude `bb-lifecycle.log`, `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`, and any secret file.

Review the diff against the manifest. Run the local regression commands in the manifest on `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`. Record the new commit SHA. Do not amend it after it is pushed.

## F. Deploy that exact SHA through the controlled mechanism

With automatic deployment still off, deploy the reviewed SHA once to the testing app. Restart only if that controlled deploy requires it, and only after stage C.

Do not push to `origin/V13` while automatic deployment is on. Do not deploy `main`. Do not deploy production.

## G. Verify both hosted applications and public booking denial

Follow the hosted smoke in the manifest. Both hosts must show the patch SHA. Both public booking GETs must be HTTP 403 with `Online booking is not currently offered` before any POST. A denied POST must leave the booking-request count unchanged.

If the SHA is wrong, either host is unhealthy, or a booking page is still a wizard, stop and roll back to `d5c5369d22fd825938fe1a9692dadee19bfd4a93`.

## H. Confirm staff scheduling through authorized QA

An authorized tester uses the existing staff appointment flow on the testing host. Public booking stays closed during that check. Do not create a public booking, and do not change `public_booking_enabled`.

## I. Resume hosted acceptance

Hosted acceptance is the G324 runbook on the patch SHA. It is still NO-GO until the 64 hosted cases and the live OTP proof are complete. Local passes do not close that gate. `financialPostingEnabled()` stays false. OTP adapters stay inactive until approval E.

## Release decision at the end of this document

QA_GO_NO_GO=NO-GO.  
RELEASE_READY=NO.

Completing the paperwork in this file does not complete stages A through I.
