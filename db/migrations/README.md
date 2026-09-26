# Migration modules

Authority: `db/migrations/<module>/*.sql` applied by `db/scripts/lib/migrator.js`.

**Module order:** `platform` → `blessboard` → `activeclinic` → `getpro` → `ngo`.

## Ownership (forward)

See [`docs/database/PLATFORM_SCHEMA_OWNERSHIP.md`](../../docs/database/PLATFORM_SCHEMA_OWNERSHIP.md).

- Platform-neutral schema → `platform/`
- BlessBoard domain → `blessboard/`
- ActiveClinic domain → `activeclinic/` (including new AC RBAC catalogue grants)

Do **not** rename or reorder already-applied files. Historical exceptions are frozen and allowlisted in `db/scripts/lib/migrationOwnershipPolicy.js`.
