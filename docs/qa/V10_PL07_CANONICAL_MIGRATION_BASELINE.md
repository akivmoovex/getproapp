# V10 PL07 — Canonical Migration Baseline

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_CANONICAL_MIGRATION_BASELINE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PL01–PL06 PASS |
| **QA reset** | **NONE** |
| **Prod reset** | **NONE** |
| **Verdict** | **`V10_CANONICAL_MIGRATION_BASELINE_PASS`** |

---

## Strategy

**B — cleaned ordered migrations** (existing `db/scripts/lib/migrator.js`).

| Rejected | Why |
|----------|-----|
| **A** squash/baseline rewrite | Would rename/delete/reorder applied history |
| **C** bootstrap schema + forward-only | Duplicates ledger; not required by runner |

Fresh empty DB path = discover + apply all module SQL in order + seeds, with checksum ledger and identity/environment gates preserved.

---

## Ownership (fresh-install)

| Folder | Owns |
|--------|------|
| `db/migrations/platform/` | `platform.*` mechanisms |
| `db/migrations/blessboard/` | `blessboard.*` church domain (+ historical AC catalogue DML exceptions) |
| `db/migrations/activeclinic/` | `activeclinic.*` clinical domain (+ **new** AC RBAC grants) |

**Fresh-path DDL guarantees (enforced):**

- No BlessBoard migration `CREATE`/`ALTER` of `activeclinic.*` objects
- No ActiveClinic migration `CREATE` of `platform.*` schema objects (historical `035_platform_contact_inquiries` remain allowlisted — product table in `activeclinic.*`)
- Ownership audit orphans = **0**

Historical AC RBAC files under `blessboard/077–092,115,118` (etc.) stay archived in-place via `migrationOwnershipPolicy.js` so fresh migrate still seeds the shared catalogue. They are **not** relocated.

---

## Canonical migration ceiling (V2.03)

| Module | Version | Filename |
|--------|---------|----------|
| platform | **043** | `043_shared_data_jobs_and_preferences.sql` |
| blessboard | **118** | `118_activeclinic_management_data_permissions.sql` |
| activeclinic | **042** | `042_patient_visit_summary_releases.sql` |
| getpro | **001** | `001_create_getpro_schema.sql` |
| ngo | **001** | `001_create_ngo_schema.sql` |

Discovered migrations: **205** + **9** seeds.

Machine-readable: `db/scripts/lib/canonicalMigrationBaseline.js`.

---

## Fresh-bootstrap command

```bash
npm run db:canonical-fresh-bootstrap
```

**Behavior:** creates an **ephemeral local** Postgres database → `migrate()` (modules + seeds) → identity `moovex-platform-v7` / `testing` → `verifyCanonicalFreshSchema` → drops DB.

**Does not** read or mutate hosted QA/production `DATABASE_URL`.

QA reset remains **PL10** only after `V10_FRESH_DB_BOOTSTRAP_PASS` + `QA_RESET_AUTHORIZED: YES` (see [`V10_PL09_FRESH_DB_BOOTSTRAP.md`](./V10_PL09_FRESH_DB_BOOTSTRAP.md)). **Executed:** [`V10_PL10_QA_CANONICAL_RESET.md`](./V10_PL10_QA_CANONICAL_RESET.md) → `V10_QA_CANONICAL_RESET_PASS` (testing/QA only; production untouched).

---

## Tests

| Suite | Result |
|-------|--------|
| `tests/v10-pl07-canonical-migration-baseline.test.js` + PC06 ownership | **PASS** (16/16) |
| `npm run db:canonical-fresh-bootstrap` | **PASS** (`V10_CANONICAL_FRESH_BOOTSTRAP_DRY_RUN_PASS`; 205 migrations + 9 seeds applied) |

---

## Required marker

```text
V10_CANONICAL_MIGRATION_BASELINE_PASS

Strategy: B (ordered migrations)
Ceiling: platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001
Fresh-bootstrap: npm run db:canonical-fresh-bootstrap  (ephemeral only; no QA/prod reset)
```
