# V2.12 Test Database Management Design

## Phase 2 decision

Destructive reset execution remains `NOT IMPLEMENTED`. This phase adds only a read-only Admin Console foundation and reset preview.

The repository has test-database safety helpers and existing BlessBoard tenant purge utilities. No approved, verifiable backup/snapshot provider or complete dependency-aware reset plan covering both products, identities, sessions, audit records, migrations, and external media exists. A partial destructive implementation would not prove the required safety guarantees.

## Read-only foundation

- Page: `GET /admin/settings/test-database`
- Preview: `GET /admin/settings/test-database/preview?scope=...`
- Access: apex plus existing platform-admin middleware
- Environment gate: explicit `DEPLOYMENT_ENV=testing`
- Database gate: `platform.database_identity` verification through the existing identity checker and testing allowlist
- Scopes: selected test tenant, all BlessBoard test tenants, all ActiveClinic test tenants, and all application data
- Inventory: explicit allowlisted tables only; protected migration records are labelled and never selected for deletion
- Preview: reads identity, connection, tenants, migrations, table counts, affected-table candidates, and protected records

The preview endpoint has no mutation path and returns a blocked result when identity or environment verification fails.

## Required contract before implementation

1. A deployment assertion independent of `NODE_ENV`, with an explicit testing deployment identity.
2. A strict allowlist mapping approved deployment identities to approved database identities. `DATABASE_URL` alone is insufficient.
3. A read-only dry-run planner derived from catalogued foreign keys and protected-record rules; user input may select only enumerated scopes.
4. An approved backup provider that creates and verifies a restorable snapshot before confirmation.
5. Super Admin authorization, reauthentication, CSRF validation, typed confirmation, and immediate preflight revalidation.
6. A single-flight lock preventing concurrent resets.
7. Transactional, dependency-aware deletion for each supported scope, with schema, migration, essential administrators, and protected audit records preserved.
8. Session invalidation and append-only protected audit logging.
9. No media deletion in the initial implementation. Media cleanup requires a separate approved design.
10. Disposable synthetic fixtures and post-reset readiness checks for BlessBoard and ActiveClinic.

## Explicit prohibited behavior

- No production or ambiguous deployment/database identity.
- No public, tenant-admin, or arbitrary platform role access.
- No arbitrary table names or SQL fragments from request input.
- No shell command construction from request input.
- No startup reset or automatic reset.
- No execution when backup verification, identity, authorization, or scope validation is incomplete.

## Backup and deletion-contract analysis

1. Existing PostgreSQL capability: the application has `pg` access and read-only migration status; no approved application-level snapshot provider is established.
2. Restore procedure: must be supplied by the test-environment owner, verified by restoring into a disposable database, and recorded before any future reset.
3. Protected identity: active platform-administrator users and their organizations must survive; database identity and `platform.schema_migrations` are protected.
4. Foreign keys: the existing BlessBoard reset repository contains an explicit organization-scoped allowlist, but the full cross-product graph still requires validation.
5. Ownership: platform tables are shared; BlessBoard tables are organization/church scoped; ActiveClinic ownership needs a complete catalogue.
6. External media: no automatic media deletion is included; local and remote storage require a separate approved design.
7. Deletion order: must follow the explicit FK graph, child records before parent tenants, with post-delete orphan checks.
8. Reseeding: preserved administrators, required platform records, products, plans, deployments, and migrations must remain valid; product readiness fixtures are required.
9. Existing reset scripts: `testingDataResetService` and `testingDataResetRepository` support existing BlessBoard testing maintenance, but are not sufficient for the four new cross-product scopes or verified backup requirement.

## Current blocker

The required backup/snapshot mechanism and complete cross-product deletion inventory are not established in V12. Therefore reset execution remains disabled and no reset is executed against any database.

Phase 3B additionally confirmed that a real authenticated Super Admin fixture and complete BB/AC application fixtures are prerequisites. The disposable database currently has synthetic organizations and product enrollments, but authenticated route QA and administrator recovery remain blocked until supported deployment provisioning is completed.
