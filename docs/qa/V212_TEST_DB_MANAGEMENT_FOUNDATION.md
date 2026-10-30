# V2.12 Test Database Management Foundation

## Scope

Phase 2 implements inspection and dry-run preview only. It does not implement reset execution.

## Admin Console

Authorized platform administrators can open:

`Settings → Test Database Management`

The page reports:

- Explicit deployment environment
- Verified database identity and environment
- Sanitized connection status
- Host fingerprint and database name when provided by the identity record
- Tenant counts grouped by data environment
- Explicit table inventory and record counts
- Applied migration count and latest application time
- Four allowlisted reset scopes
- Preview-only eligibility and missing prerequisites

Credentials, URLs, passwords, tokens, and secrets are never rendered.

## Backend contract

- `GET /admin/settings/test-database` renders the read-only page.
- `GET /admin/settings/test-database/preview?scope=...` returns JSON.
- Scope values are allowlisted.
- `DEPLOYMENT_ENV=testing` is required.
- The database identity must pass the existing strict testing identity allowlist.
- Database connection and all inventory queries are read-only.
- No reset, truncate, delete, migration, backup, media cleanup, or session invalidation is reachable from these routes.
- Existing platform-admin middleware prevents tenant-admin access.

## Data ownership and protection

The inventory labels shared platform, BlessBoard, ActiveClinic, and protected records. `platform.schema_migrations` is protected. The existing reset repository's explicit BlessBoard organization-scoped table list is documented as an input to a future deletion graph; it is not treated as proof of ActiveClinic parity.

## Deferred gates

Reset execution requires an approved restorable backup mechanism, restore verification, complete cross-product FK/dependency inventory, reseeding contract, concurrent-operation lock, reauthentication, typed confirmation, immediate identity revalidation, session invalidation, protected audit logging, and disposable synthetic post-reset readiness tests.

## Verification

The locked npm dependency installation completed successfully. All 14 selected V2.12 version/About/legacy-route tests passed. No existing database was selected or mutated.
