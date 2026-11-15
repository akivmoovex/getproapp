# G2 execution plan

Do not run this command. Both write flags are off, no database URL is set, and migration is not approved.

When those approvals exist, the command is:

```bash
export NODE_ENV=test DATABASE_IDENTITY_ENV=testing GETPRO_TEST_DB=1
export GETPRO_V13_ALLOW_DB_WRITES=1 GETPRO_V13_DB_STAGES_AUTHORIZED=1
export GETPRO_V13_CI_RUN_ID=<8-to-64-chars>
export DATABASE_URL=postgresql://<local-user>@127.0.0.1:5432/getpro_v13_int_<runid>
npm run test:v13:integration:gated
```

`npm run test:v13:integration:gated` is `node --test --test-concurrency=1 tests/v13/integration/*.test.js`. `runGated` opens a pool only after both flags are `1`. The URL must pass `assertV13CiDatabaseUrl` and `assertV13CiEnvironmentIdentity`. The database name must match `^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$`. The host must be `127.0.0.1`, `localhost`, or `::1`.

Thirteen files are the prepared set. Eighty-three acceptance cases are `NOT_RUN`. `SEC-01-02` is blocked until a live denial exists. Opening the gate does not make `d25-appointment-concurrency` pass: that body throws `APT-01-03_NOT_IMPLEMENTED`. Portal activation, clinical rows, billing, and documents have no stored-result assertion in this command yet.

No migration command is part of this plan. Production OTP is excluded.
