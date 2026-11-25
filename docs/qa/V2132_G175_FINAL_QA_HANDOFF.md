# G175 final QA handoff

Implementation evidence is `4ede66938edb7825b1c9a25e57dffb4f657e108b`. This file does not name its own commit. Branch `V13`. Product version `2.13.2`. QA is NO-GO. Release is not ready.

## Executed after the last test edit

Two safe runs: 572 executed, 570 passed, 0 failed, 2 skipped. The version tests are inside that suite.

Two HTTP runs on `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432`: 35 executed, 32 passed, 3 failed. Failures are D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed both times.

Two Playwright cycles: ActiveClinic 29 passed, BlessBoard 23 passed.

The new browser journey uses the clinician, who is allowed to edit notes. The administrator can start the encounter and is shown that notes cannot be edited. The draft text is stored, Clinic B cannot change it, complete signs the same text, and a prescription without a catalogue id creates no pharmacy row.

## Still blocked

- `platform.otp_challenges` is absent. Migration 048 was not applied.
- Slot capacity stays unapproved.
- Resend verification was not observed. The API key is absent. No email was sent.
- A stocked dispense was not run. No inventory batch was seeded.
- Hosted QA was not deployed. `main` was not modified.

Next action: approve the OTP challenge migration, or verify `pronline.org` in Resend and install a QA-only key. Do not deploy this candidate as a release.
