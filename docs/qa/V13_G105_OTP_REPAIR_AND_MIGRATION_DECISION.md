# V13 G105 OTP repair and migration decision

D14C and D16 platform OTP still fail because `platform.otp_challenges` is absent. Both tests throw inside the gated runner and stay red. They were not skipped and the table was not created.

BlessBoard member OTP uses `blessboard.phone_otp_verifications`. That store does not satisfy the platform challenge tests. The browser runner leaves `BLESSBOARD_OTP_EXPOSE_TEST_CODE` unset. The browser recovery test therefore cannot read a code, and it also asserts that the page does not show one.

Decision: `BLOCKED_BY_MIGRATION_AUTHORIZATION`.

A future migration, which this phase did not apply, would need:

1. A new authorized file for `platform.otp_challenges`, not an edit of 043 or 044.
2. Challenge id, subject, purpose, hashed code, expiry, attempt count, and consumed-at.
3. Fail closed when the table is missing.
4. No production SMS or email.
5. Replay and expiry tests on the disposable database only.
6. No change to CSRF, RBAC, or tenant isolation.

Production OTP stays disabled.
