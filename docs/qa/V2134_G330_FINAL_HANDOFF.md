# V2134 G330 final handoff

FINAL=V2134_G330_BOOKING_PATCH_RELEASE_READINESS

BASE_SHA=`d5c5369d22fd825938fe1a9692dadee19bfd4a93`  
G329_PATCH_PRESERVED=YES  
G328_AUDIT_PRESERVED=YES  
PUBLIC_ADMISSION_DEFAULT_DENY=YES  
PRODUCTION_DENIAL=YES  
STAFF_SCHEDULING_PRESERVED=YES  
MIGRATION_REQUIRED=NO  
AUTO_DEPLOYMENT_STATUS=ACTIVE_BY_G328_BEHAVIOR  
HOSTED_RUNNING_SHA=`d5c5369d22fd825938fe1a9692dadee19bfd4a93`  
HOSTED_BACKUP_VERIFIED=NO  
DEPLOYMENT_CONTROL_APPROVED=NO  
PATCH_DEPLOYMENT_APPROVED=NO  
SOURCE_CHANGED=G329 application patch remains uncommitted. G330 added four local documents.  
COMMIT=NO  
PUSH=NO  
DEPLOYMENT=NOT_PERFORMED  
HOSTED_DB_WRITES=NO  
MAIN_UNCHANGED=YES  

QA_GO_NO_GO=NO-GO.  
RELEASE_READY=NO.

BLOCKERS=Automatic deployment is still the behavior G328 verified, and the panel control was not opened. No testing snapshot or scratch restore exists. The G329 patch is not approved for deployment. The running SHA still serves the public booking wizard. Live OTP and the 64-case hosted acceptance are still open.

NEXT_REQUIRED_OWNER_ACTION=Disable automatic deployment on `moovex-platform-testing` without a test push. If that control restarts workers or replaces the checkout, stop for backup proof and a separate restart approval. Confirm both hosts remain on `d5c5369d22fd825938fe1a9692dadee19bfd4a93`. Leave `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` unset. Approve the G329 deployment only after that pin and the backup proof.

## What was preserved

Local HEAD, `origin/V13`, and `main` were unchanged: `d5c5369d22fd825938fe1a9692dadee19bfd4a93` and `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. Nothing was staged.

The nine G329 files are present and uncommitted:

- `src/activeclinic/services/publicBookingAdmission.js`
- `src/activeclinic/services/activeClinicPublicBookingService.js`
- `src/activeclinic/http/activeClinicPublicBookingRoutes.js`
- `tests/v13/unit/g329-public-booking-admission.test.js`
- `tests/v13/unit/d48-appointment-engineering.test.js`
- `tests/v13/integration/d05RegressionRunners.js`
- `docs/qa/V2134_G329_BOOKING_POLICY_PATCH.md`
- `docs/qa/V2134_G329_LOCAL_REGRESSION.md`
- `docs/qa/V2134_G329_CONTROLLED_DEPLOYMENT_REQUEST.md`

`docs/qa/V2134_G328_HOSTED_SAFETY_AUDIT.md` is still untracked. No local change was reset, stashed, or discarded.

## Admission contract

The contract defaults closed. Only the exact value `enabled` opens it, and a production deployment identity stays closed with that value present. A clinic `public_booking_enabled` flag cannot open it. The `/clinics/:clinicKey/book` mount refuses GET and POST, including consultation and procedure submission, before an insert. Staff `createAppointment` does not reference the contract.

## Host read

Both public health endpoints returned the base SHA, testing environment, and `moovex-platform-testing`. Process ids changed during the read-only probes while the SHA did not. That is recorded in the deployment-control checklist. No panel setting was changed.

## Documents written

- `docs/qa/V2134_G330_DEPLOYMENT_CONTROL_CHECKLIST.md`
- `docs/qa/V2134_G330_G329_RELEASE_MANIFEST.md`
- `docs/qa/V2134_G330_CONTROLLED_DEPLOYMENT_RUNBOOK.md`
- `docs/qa/V2134_G330_FINAL_HANDOFF.md`

Stages A through I in the runbook were not performed.
