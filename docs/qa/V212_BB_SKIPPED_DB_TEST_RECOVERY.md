# BlessBoard V2.12 Skipped DB Test Recovery

Target: `tests/church-branch-announcements-events.test.js`

The Phase 5E TAP result explicitly skipped the suite because the local process had no `TEST_DATABASE_URL` or `GETPRO_TEST_DB` database intent. The approved running database is the isolated ActiveClinic database and cannot be used for BlessBoard testing. The prior BlessBoard PostgreSQL container is stopped; no approved disposable BB database was available in this phase.

Required prerequisite:

- Start or provision a dedicated disposable BlessBoard PostgreSQL database on `v212-qa-internal`.
- Verify its testing identity and ownership.
- Set `GETPRO_PG_SSL=off` and `TEST_DATABASE_URL` for the test process.
- Run the skipped suite with TAP capture.

The test was not falsely marked pass, and no cross-product database was used. Classification: `DATABASE_ENVIRONMENT`.
