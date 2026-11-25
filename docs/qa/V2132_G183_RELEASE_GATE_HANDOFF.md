# G183 release-gate handoff

Implementation evidence is `abad603c3086a5bce1d4de58996e3cd3102ca2b2`. This file does not name its own commit. Branch `V13`. Product version `2.13.2`. QA is NO-GO. Release is not ready.

G180 at `3a8d7c434c8a7f8bdfc75c5c0e3bb2fc4ec7023c` stays the last full HTTP and browser pair. This cycle did not change those tests. D14C, D16, and D25 slot stay failed. Same-staff overlap stays the passing G180 result. ActiveClinic 30 and BlessBoard 23 were not edited. The safe suite was run once after the new contract test: 575 executed, 573 passed, 0 failed, 2 skipped.

## Prepared and not executed

The reviewed OTP script is `docs/qa/V2132_G181_OTP_CHALLENGES.sql`. It is not under `db/migrations/`, and `048_otp_challenges.sql` is still absent. The script was not applied. `platform.otp_challenges` was not created. Applying that script alone would not make D16 pass: two `createOtpService()` calls do not share a store, `verifyChallenge` does not set `sessionComplete`, and the HTTP OTP env has no pepper.

`pronline.org` DNS is present. Resend verification was not observed. `RESEND_API_KEY` is unset. No email was sent. Production senders were not changed.

D21-05 is still unapproved. No capacity integer was added. `createAppointment` still does not call `evaluateSlotCapacity`.

## Required approvals

1. Apply the reviewed OTP script only on `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`, and only together with the contract update that still forbids `048_otp_challenges.sql` until that path is intentionally replaced. Then connect both OTP workers to one store without making `verifyChallenge` complete a session.
2. Confirm `pronline.org` is verified in the Resend dashboard, then install a sending-only key outside the repository.
3. Approve either a named capacity integer and its scope, or a decision that assigned-staff overlap is the whole rule. Until then the slot test stays failed.

No deployment was performed. `main` was not modified.
