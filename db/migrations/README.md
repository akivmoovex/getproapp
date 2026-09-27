# Migration modules

Authority: `db/migrations/<module>/*.sql` applied by `db/scripts/lib/migrator.js`.

**Module order:** `platform` → `blessboard` → `activeclinic` → `getpro` → `ngo`.

## V10 canonical fresh baseline (PL07)

**Strategy B — cleaned ordered migrations** (no history squash).

| Module | Ceiling (V2.03) |
|--------|-----------------|
| `platform` | `043_shared_data_jobs_and_preferences.sql` |
| `blessboard` | `118_activeclinic_management_data_permissions.sql` |
| `activeclinic` | `042_patient_visit_summary_releases.sql` |
| `getpro` | `001_create_getpro_schema.sql` |
| `ngo` | `001_create_ngo_schema.sql` |

Machine-readable baseline: [`db/scripts/lib/canonicalMigrationBaseline.js`](../scripts/lib/canonicalMigrationBaseline.js).

**Fresh-bootstrap (ephemeral local dry-run only — never QA/prod):**

```bash
npm run db:canonical-fresh-bootstrap
```

Historical ownership exceptions (AC RBAC seeds under `blessboard/`, misnamed AC contact table) remain on disk and **still run** on fresh install so the shared catalogue + product schemas reach the required shape. They are documented, not relocated. Forward placements follow the ownership rules below.

QA/production database reset is **not** part of PL07 (see PL10 after `V10_FRESH_DB_BOOTSTRAP_PASS`).

## Ownership (forward)

See [`docs/database/PLATFORM_SCHEMA_OWNERSHIP.md`](../../docs/database/PLATFORM_SCHEMA_OWNERSHIP.md).

- Platform-neutral schema → `platform/`
- BlessBoard domain → `blessboard/`
- ActiveClinic domain → `activeclinic/` (including new AC RBAC catalogue grants)

Do **not** rename or reorder already-applied files. Historical exceptions are frozen and allowlisted in `db/scripts/lib/migrationOwnershipPolicy.js`.
