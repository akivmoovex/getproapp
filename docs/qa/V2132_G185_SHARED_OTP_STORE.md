# V2.13.2 G185 shared OTP store

`src/platform/otp/otpPostgresStore.js` is the shared repository. Two services constructed with the same pool read and update one row. The module does not create tables and does not send email.

`createOtpService({ pool })` selects that repository. `createOtpService({ store })` still accepts the in-memory store for tests. A production process, or a service constructed with a production environment, receives `createUnavailableOtpStore()` when neither a pool nor a store is injected. That store fails closed. It does not keep a private memory challenge.

Verification and consumption are single conditional updates:

- `compareAndVerify` sets `verified` only while the row is pending, unconsumed, unexpired, and under the attempt cap.
- `consumeVerified` sets `consumed` only while the row is verified and unconsumed.
- `recordFailedAttempt` increments only a pending row and stops at `exhausted`.
- A query error becomes `store_unavailable` or `otp_store_unavailable`. The original database message is not returned.

`tests/v13/unit/g185-shared-otp-store.test.js` covers two workers, one winning completion, expiry, exhaustion, cancellation, tenant and product boundaries, a missing pepper, a wrong pepper, a thrown database error, and a production service without a pool. `tests/v13/integration/g185SharedOtpPersistence.js` is the PostgreSQL body. `tests/v13/integration/g185-otp-store.integration.test.js` runs it only when database writes are authorized and `GETPRO_V13_OTP_PERSISTENCE_AUTHORIZED=1`, and only if the table is already present. This cycle left that flag unset. The test did not create the table.

D16 still constructs two services without a pool, so it remains a failing gate after a future apply until that test is separately updated to use the shared pool and `completeProtectedAction`.
