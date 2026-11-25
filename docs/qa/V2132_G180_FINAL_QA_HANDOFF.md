# G180 final QA handoff

Implementation evidence is `a7d2329328124ea45aedbc9a703d418a18c55f0c`. This file does not name its own commit. Branch `V13`. Product version `2.13.2`. QA is NO-GO. Release is not ready.

## Executed after the last test edit

Two safe runs: 573 executed, 571 passed, 0 failed, 2 skipped.

Two HTTP runs on `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432`: 36 executed, 33 passed, 3 failed. Failures are D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed both times. The stocked-dispense scenario passed both times. Preflight churches were 78. Clinics were 909, then 926. Public booking stayed off.

Two Playwright cycles: ActiveClinic 30 passed, BlessBoard 23 passed. The new ActiveClinic journey dispenses a synthetic catalogue item once and leaves the quantity unchanged on a later load.

## Coverage

Major journeys 38. Browser covered 36. HTTP covered 32. Persistence verified 14. Historical QA bugs 32 verified and 4 blocked. P0 gaps 0. P1 gaps 0. The closed P1 is the stocked dispense. AC-SLOT and D16 stay outside the browser count.

## Still blocked

- `platform.otp_challenges` is absent. No migration file was added and none was applied. The approval package is `docs/qa/V2132_G179_OTP_MIGRATION_APPROVAL_PACKAGE.md`.
- Slot capacity stays unapproved. The D25 slot test still fails.
- `pronline.org` DNS records were present. Resend domain verification was not observed. The API key is unset. No email was sent.
- Binary upload, public booking, production OTP, and financial benefits stay inactive.
- Hosted QA was not deployed. `main` was not modified.

Next action: approve the OTP challenge package on the disposable database, or verify `pronline.org` in Resend and install a QA-only key under a separate authorization. Do not deploy this candidate as a release.
