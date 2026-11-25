# V2.13.2 G190 cross-worker database readiness

`startMoovexPlatformRuntimeServer` calls `attachOtpDatabase(getPgPool())` after the process pool is created. Each worker process builds its own pool. Two workers that use the same approved database URL therefore read and write the same `platform.otp_challenges` and `platform.otp_rate_buckets` rows. The pool is not a private memory store.

A production process that has no pool still receives `createUnavailableOtpStore()`. Rate-limit calls on that store throw, and the service returns `store_unavailable` or `rate_limit_unavailable`. They do not fall open. A query error from PostgreSQL is wrapped as `otp_store_unavailable` and the database message is not returned. The reviewed tables have no column for the code, the email, or the phone.

`compareAndVerify` and `consumeVerified` are single conditional updates. `recordFailedAttempt` increments only a pending row. The hourly counters are the `platform.otp_rate_buckets` upsert, not the in-memory map, once a pool is attached.

`tests/v13/integration/g185SharedOtpPersistence.js` opens a second pool from the same connection string, verifies from that pool, consumes once, and reads the row and the rate bucket back. `tests/v13/integration/g185-otp-store.integration.test.js` throws `BLOCKED_BY_SCHEMA` when either table is absent. It does not create either table. The database-free tests do not count as persistence proof.
