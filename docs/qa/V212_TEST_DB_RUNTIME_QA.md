# V2.12 Test Database Runtime QA

## Environment

- Worktree: `/private/tmp/getpro-v12`
- Branch: `V12`
- Application version: `2.12`
- QA database: `getpro_v212_reset_qa_01`
- QA database host: local Unix socket / local Postgres
- PostgreSQL server: 16.9 (Postgres.app)
- Database identity: `moovex-platform-v7`
- Database environment: `testing`
- Applied migrations: 232
- Existing application databases reset: no

## Admin Console foundation

The read-only inspection service passed against the disposable database:

- Environment and database identity accepted.
- Connection status returned connected.
- Tenant count returned four synthetic testing organizations.
- Inventory returned fourteen explicit allowlisted table entries.
- Migration status returned 232 applied migrations.
- Full-database preview scope was accepted and returned four affected test organizations.
- Invalid scopes are rejected before database inspection.
- Production or unknown deployment environments are rejected by the testing gate.
- The preview response no longer exposes the internal signed preview token.

No platform administrator identity was seeded in this database. Consequently, authenticated browser access and the Super Admin route authorization could not be exercised against this fixture; this is recorded as blocked rather than pass.

## Fixture result

Created synthetic platform organizations and product enrollments for:

- BlessBoard: `v212-bb-one`, `v212-bb-two`
- ActiveClinic: `v212-ac-one`, `v212-ac-two`

Attempts to create deeper BB/AC records were rejected by existing database constraints during fixture construction and rolled back. No invalid records were left behind. No reset or truncation was used to recover.

## Backup and restore

The source database was dumped to a path outside served directories and restored into a separate new local database. Representative counts matched:

`source=4 organizations, 232 migrations, 1 identity row`  
`restore=4 organizations, 232 migrations, 1 identity row`

## Classification

- PASS: local isolated database creation, migrations, identity gate, read-only inspection, scope validation, backup/restore count verification.
- BLOCKED: authenticated Admin Console route test, full product fixture workflows, post-reset readiness, and destructive reset cases.
- FAIL: none.
