# Next stage

Stop unless a later message already has all of these set:

- `GETPRO_V13_ALLOW_DB_WRITES=1`
- `GETPRO_V13_DB_STAGES_AUTHORIZED=1`
- `GETPRO_V13_BROWSER_AUTHORIZED=1` for any browser step
- `E2E_DATABASE_URL` passing `assertV13CiDatabaseUrl`
- `NODE_ENV=test`
- `DATABASE_IDENTITY_ENV=testing`
- `GETPRO_TEST_DB=1`
- `GETPRO_V13_CI_RUN_ID` matching `^[a-z0-9_-]{8,64}$`

If any of those is missing, report `NOT_RUN` and do not flip a flag.

When they are present:

1. Build one run-owned database name. Do not use `postgres`, a shared QA name, or a banned host.
2. Apply fixtures only after `assertApplyPermitted` returns. The provisioner mints `ac-hqa-` clinics. It does not insert Pat Ient or the AC-05 users.
3. Run one portal activation and expect `link_conflict` for a second owner. Do not revoke the booking token and do not issue a session from registration.
4. Run one same-tenant payment retry and expect `duplicate_submission`.
5. Run two connections against one stored appointment only as evidence of the open race. Do not add `FOR UPDATE` or `slot_capacity`.
6. For AC-05, a lower-privilege session must receive HTTP 403. A redirect to `/login` is not the denial.
7. Drop only the run-owned database after the guard still accepts the name.

Do not create an OTP migration, an outbox table, a representative record, an allergy blocker, a retention period, or a Juflona signing path. Do not mark any of the 84 cases `PASS` without the stored evidence for that case. Do not commit or push unless a later message asks for it.
