# G165 exhaustive QA handoff

Implementation evidence is `31e8bf0582d87fb0f81c3df68e8ef7e3746452bc`. This handoff file does not name its own commit. Branch `V13`. Product version `2.13.2` for BlessBoard and ActiveClinic. QA is NO-GO. Release is not ready.

## What was executed

Two safe runs: 572 executed, 570 passed, 0 failed, 2 skipped.

Two HTTP runs on `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432`: 35 executed, 32 passed, 3 failed. The failures are D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed both times.

Two Playwright cycles: ActiveClinic 28 passed, BlessBoard 23 passed.

New browser tests: patient number search with logout, and staff phone search that keeps one patient row. `BB-MEM-01` now searches the member directory, reloads the profile, and logs out of HQ. A separate BlessBoard login was not added because the in-memory limit is 20 attempts for the fixture administrator.

## What remains blocked

- `platform.otp_challenges` is absent. Migration 048 was not created or applied.
- Slot capacity is `BLOCKED_APPROVAL_REQUIRED`. No capacity integer was added.
- Resend account is not connected. `RESEND_API_KEY` is absent. DNS records for `pronline.org` are published and were not verified in a dashboard. No email was sent.
- Public booking, public self-registration, and binary upload stay disabled.
- Consultation signing and a stocked dispense have routes and no new success-path browser journey.
- Hosted QA was not deployed. `main` was not modified.

## Documents

Coverage notes are `docs/qa/V2132_G150_BASELINE.md` through `docs/qa/V2132_G164_ADVERSARIAL_TEST_REVIEW.md`. The machine matrix is `docs/qa/V2132_G162_MACHINE_READABLE_MATRIX.json`.

Next action: approve the OTP challenge migration, or connect a QA-only Resend key after the dashboard verifies `pronline.org`. Do not deploy this SHA as a release.
