# V2.13.2 G189 D16 contract reconciliation

`docs/platform/V213_D14A_OTP_FOUNDATION.md` says `completeProtectedAction` returns `sessionComplete: true` only after a matching single-use verification, and a begin result never completes a session. The service matches that contract: `verifyChallenge` sets `sessionComplete: false`, and `completeProtectedAction` consumes the verified row once.

The previous D16 body did not follow that boundary. After the missing-table check it constructed two `createOtpService()` calls with no pool and no pepper, then required `verifyChallenge` to return `sessionComplete: true`. Those calls do not share a database. Verification is not the session step. The expectation was obsolete. The table assertion was not.

`runPlatformOtp` now checks the security boundary before the schema gate:

- An unresolved account does not receive a challenge or a session.
- A missing pepper returns `pepper` and `sessionComplete: false`.
- A production service with no pool returns `store_unavailable` and `sessionComplete: false`.
- The wrong purpose and the wrong organization are rejected.
- Verification of the correct code still leaves `sessionComplete` false.
- One of two completions wins. The replay does not.

The same function then requires `platform.otp_challenges`. That assertion is unchanged, so D14C and D16 still fail while the table is absent. The database half, two independent pools and a read of the stored row, runs only after that assertion. It was not reached.

No test-only bypass was added. Production activation stays `BLOCKED`.
