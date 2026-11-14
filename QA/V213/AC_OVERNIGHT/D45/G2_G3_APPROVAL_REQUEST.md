# G2 and G3 approval request

G2 and G3 are not ready to run. The plans in `QA/V213/AC_OVERNIGHT/D44/` name the gates, the two synthetic clinics, the AC-05 identities, and the rollback. Approval is still required before any of that starts.

A future approval must name one run id and allow, together:

- `GETPRO_V13_ALLOW_DB_WRITES=1`
- `GETPRO_V13_DB_STAGES_AUTHORIZED=1`
- `NODE_ENV=test`, `DATABASE_IDENTITY_ENV=testing`, `GETPRO_TEST_DB=1`
- a local URL whose database name matches `getpro_v13_(ci|bb_qa|int|e2e)_` plus 6 to 32 characters
- the browser flag only after that database exists, with `E2E_DATABASE_URL` pointing at it

Still excluded after that approval: a new migration, OTP delivery, slot capacity, retention, restore, offline writes, and Juflona. Drop only the run-owned database, and only while the guard still accepts its name.

This request does not grant the approval.
