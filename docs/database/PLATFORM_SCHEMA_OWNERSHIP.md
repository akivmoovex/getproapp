# Platform schema / migration ownership (PC06)

| Field | Value |
|-------|--------|
| **Doc ID** | `PLATFORM_SCHEMA_OWNERSHIP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC05 PASS |
| **Plan marker** | `PLATFORM_SCHEMA_OWNERSHIP_PLAN` |
| **Runtime/schema moves** | **NONE** (documentation + guard test only) |

Machine-readable allowlist: [`db/scripts/lib/migrationOwnershipPolicy.js`](../../db/scripts/lib/migrationOwnershipPolicy.js).

---

## 1. Non-negotiables

1. Do **not** rename, delete, or reorder already-applied migrations for organization.
2. Do **not** rewrite checksums or migrate ledgers to “fix” placement.
3. Do **not** mutate production (or shared testing) solely to relocate historical objects.
4. Migrator module order remains: **`platform` → `blessboard` → `activeclinic` → `getpro` → `ngo`**.

---

## 2. Forward rules (corrected ownership)

| Change type | Target folder | Target SQL schema |
|-------------|---------------|-------------------|
| Platform-neutral mechanism (identity, shared forms, media folders, verification challenges, shared jobs, …) | `db/migrations/platform/` | Prefer `platform.*` |
| BlessBoard-only domain | `db/migrations/blessboard/` | `blessboard.*` |
| ActiveClinic-only domain | `db/migrations/activeclinic/` | `activeclinic.*` |
| ActiveClinic RBAC catalogue grants (roles/permissions rows) | **`db/migrations/activeclinic/`** | May DML `blessboard.permissions` / `blessboard.roles` (catalogue tables remain shared) |
| BlessBoard RBAC catalogue grants | `db/migrations/blessboard/` | `blessboard.*` |

Additional forward hygiene:

- Do **not** name product tables `platform_*` unless the object truly lives in `platform` schema and is platform-owned.
- Cross-schema **FKs** from product tables to `platform.identities` / `platform.organizations` (etc.) are **allowed** and expected.
- Finder junk `* 2.sql` files are never part of discovery (already filtered by migrator).

---

## 3. Historical exceptions (do not relocate)

These files stay where they are. They are allowlisted in `migrationOwnershipPolicy.js`.

### 3.1 ActiveClinic RBAC history under BlessBoard migrations

| Paths | Why frozen |
|-------|------------|
| `blessboard/077`–`092` `*activeclinic*` | Early AC permission/role catalogue shipped via BB migrator module because shared catalogue tables are `blessboard.*` |
| `blessboard/115_activeclinic_patient_create_v202_alignment.sql` | AC patient.create alignment DML on catalogue |
| `blessboard/118_activeclinic_management_data_permissions.sql` | AC performance/import/export permissions |

**Forward fix:** new AC permission/role changes go under `db/migrations/activeclinic/` (still writing into `blessboard.permissions` / `roles` as needed).

### 3.2 Shared website permission files that also grant AC roles

| Paths | Why frozen |
|-------|------------|
| `blessboard/093_website_engine_permissions.sql` | Shared website catalogue + AC role grants |
| `blessboard/095_website_org_admin_publish.sql` | Same pattern |

### 3.3 Misnamed product contact table under ActiveClinic

| Path | Why frozen |
|------|------------|
| `activeclinic/035_platform_contact_inquiries.sql` | Creates **`activeclinic.platform_contact_inquiries`** for ActiveClinic.org public contact. Product-owned despite `platform_` naming. Already applied. |

**Forward fix:** platform-neutral inquiry storage → `platform` schema + platform migrations; product contact forms → product schema **without** `platform_` prefix.

### 3.4 Platform migrations that name a product (not exceptions)

Examples: `platform/018_activeclinic_application_code.sql`, `platform/026_activeclinic_patient_identity_profile.sql`.

These correctly extend **`platform.*`** catalogues/constraints so a product can participate in shared identity/deployment. Filenames may mention the product. **Do not move them to product folders.**

### 3.5 Not exceptions (allowed forever)

ActiveClinic migrations that **reference** `platform.*` for FKs/joins (staff → identities, clinics → organizations, etc.) are normal shared-foundation coupling, not misplaced ownership.

---

## 4. Implementation choice for PC06

| Option | Decision |
|--------|----------|
| Move/rename applied SQL files | **Rejected** |
| Dual-write / copy objects into platform schema now | **Rejected** (no production mutation; no behavior change required) |
| Document plan + automated ownership guard | **Accepted** |

Outcome marker for this pass: `PLATFORM_SCHEMA_OWNERSHIP_PASS` (plan established + guard enforced; no destructive history rewrite).

---

## 4b. V10 PL07 fresh-install path (strategy B)

Fresh empty databases use the **same ordered migration files** (no squash). Historical exceptions still apply so catalogue DML and product schemas reach V2.03; they do **not** authorize new cross-product DDL:

| Fresh-path guarantee | Enforcement |
|----------------------|-------------|
| No BB migration `CREATE`/`ALTER` of `activeclinic.*` objects | `scanCrossSchemaDdlSmells()` in `canonicalMigrationBaseline.js` |
| No AC migration `CREATE` of `platform.*` schema objects (except historical `035` allowlist) | same |
| New AC RBAC → `activeclinic/` | PC06 forward rule + ownership audit orphans = 0 |
| Ceiling recorded after migrate | `CANONICAL_CEILING` + `verifyCanonicalFreshSchema` |

Ephemeral dry-run: `npm run db:canonical-fresh-bootstrap` (never QA/prod).

---

## 5. Operator checklist for new migrations

1. Pick folder by **product ownership of the change**, not by which schema you `INSERT` into.
2. Prefer additive DDL (`IF NOT EXISTS` / nullable columns) per V8 compatibility contract.
3. If a filename must contain another product’s name (rare), add an explicit allowlist entry in `migrationOwnershipPolicy.js` **with justification** in the same PR — do not silently bypass the test.
4. Run: `npm run test:v8:migration-contract` and `node --test tests/v10-pc06-platform-schema-ownership.test.js tests/v7-migrate-identity-gate.test.js`.
