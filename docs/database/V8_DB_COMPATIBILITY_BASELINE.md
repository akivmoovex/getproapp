# V8 Database Compatibility Baseline

**Status:** Active baseline  
**Branch:** `V8`  
**Shared database:** one PostgreSQL instance for V7 and V8 (no separate V8 database)  
**V7 baseline SHA (branch root):** `03a89106e2fef8a93e31015d160acf73ab59fd40`  
**Policy:** [`V8_DEVELOPMENT_POLICY.md`](../platform/V8_DEVELOPMENT_POLICY.md)  
**Machine contract:** `src/platform/schema/v8DbCompatibilityContract.js`  
**Runtime V7 capability gate:** `src/platform/schema/v7RuntimeSchemaCompatibility.js`

## 1. Objective

V7 (pronline.org) and V8 (neuniversity.org) must share the **existing** PostgreSQL database safely. V8 schema work is **additive** and must not break V7 readers or writers.

This baseline documents the V7-required surface, migration risks, expand/contract rules, locking/idempotency, startup behavior, and read/write compatibility.

## 2. Access paths (current)

| Path | Role |
|------|------|
| `db/migrations/{platform,blessboard,activeclinic,getpro,ngo}/*.sql` | Authoritative DDL modules |
| `db/scripts/lib/migrator.js` | `npm run db:migrate` — ledger, advisory lock, checksums |
| `platform.schema_migrations` | Schema version tracking (`module`, `version`, `checksum`) |
| `platform.database_identity` | Purpose/environment gate for migrate |
| `src/db/pg/` + product repositories | Application I/O |
| `assertV7RuntimeSchemaCompatibilityOrExit` | Hosted startup **read-only** capability check |
| `npm run db:schema:compat` | Operator inspect; **never migrates** |

**Application startup does not run migrations.** Servers assert schema compatibility and refuse unsafe hosted start; remediation is explicit `db:migrate`.

## 3. Schema inventory (shared vs product)

### 3.1 Shared platform (both products)

| Area | Tables (V7-required core) |
|------|---------------------------|
| Org / tenancy | `platform.organizations`, `organization_products`, `products`, `domains`, `deployments` |
| Identity / auth | `platform.identities`, `identity_product_profiles`, `identity_action_tokens`, `identity_action_token_rate_limits` |
| Sessions | `platform.deployment_sessions`, `auth_transfers`, website `website_edit_sessions` |
| Audit | `platform.audit_events` (append-only), `website_audit_events` |
| Website engine | `website_instances`, `website_content`, `website_versions`, `website_media`, moderation/lifecycle tables |
| Media folders | `platform.media_folders` (+ product media tables) |
| Ops | `schema_migrations`, `database_identity`, onboarding progress |

Branches are **not** shared on `platform` (product meaning differs). Facility ≈ AC product concept; church/branch ≈ BB.

### 3.2 BlessBoard

| Area | Tables |
|------|--------|
| Org bridge | `blessboard.churches` ↔ `platform.organizations` |
| Branch | `blessboard.branches`, `branch_settings` |
| User | `blessboard.users`, roles/permissions catalogue |
| Invitation | `blessboard.user_invitations` (hash-only tokens) |
| Media | `blessboard.media_assets` |
| Website (legacy + engine) | structured drafts, publication versions, governance |
| Registration | `platform_church_registration_applications` (+ provision stage) |

### 3.3 ActiveClinic

| Area | Tables |
|------|--------|
| Org bridge | `activeclinic.healthcare_organizations` |
| Facility | `activeclinic.facilities`, departments, staff assignments |
| Staff / invite | `staff_members`, `staff_invitations` (tokens in `platform.identity_action_tokens`) |
| Clinical / billing | encounters, pharmacy, diagnostics, cashier (product-owned) |
| Registration | `clinic_registration_applications` (+ provision stage, terms) |
| Patient portal | patient identity / booking (public surface) |

## 4. V7-required columns, constraints, formats

Authoritative list: `V7_REQUIRED_RELATIONS` in `v8DbCompatibilityContract.js`.

Highlights:

| Concern | V7 contract |
|---------|-------------|
| Org keys | `organization_key` / `church_key` / `facility_key` lowercase slug format; org key immutable via trigger |
| Status enums | Keep existing CHECK membership; append-only new values |
| Phones | E.164 `^\+[1-9][0-9]{6,14}$` on normalized columns |
| Emails | `lower(trim)` normalized; length bounds |
| Session / action tokens | **sha256 hex length 64 only**; never store raw secrets |
| Website JSON | `draft_value` / `published_value` / `snapshot_json` must remain objects readable by V7 engine |
| BB invite | `users.status='invited'` ⇒ `password_hash` NULL; otherwise NOT NULL |
| Audit | INSERT-only; mutation triggers block UPDATE/DELETE |

Required migration markers for hosted V7 capabilities remain those in `REQUIRED_MIGRATIONS` (website engine 027/029/031, BB 093–099, AC 019/026/030/031/033/034, …).

## 5. V8 migration risks

| Risk | Why it breaks V7 | Rule |
|------|------------------|------|
| DROP/RENAME column or table | V7 SQL/ORM assumes names | Forbidden while V7 active |
| Narrow CHECK / remove enum value | Existing rows + V7 writers fail | Append-only |
| NOT NULL without DEFAULT/backfill | Legacy rows reject migrate | Nullable or DEFAULT + backfill in expand |
| Incompatible JSON / content shape | V7 website readers fail | Dual representation + adapter |
| Changing token/hash format | Sessions/invites invalid | New column or new purpose; keep old |
| Purpose CHECK on `identity_action_tokens` | AC activate/reset fail | Append purposes only |
| Auto-migrate on V8 deploy | Unexpected DDL on shared prod DB | Forbidden; explicit operator migrate |
| Separate V8 database | Diverges identity/org truth | Forbidden by policy |

## 6. Shared records sensitive to V8 writes

See `SHARED_WRITE_RISKS` in the contract module. Highest priority:

1. `platform.organizations` status / `data_environment` / key format  
2. `platform.identities` contact normalization and credential fields  
3. `platform.deployment_sessions` hash + expiry semantics  
4. `platform.website_content` / `website_versions` JSON  
5. `platform.identity_action_tokens` purposes  
6. BB `users` + `user_invitations` and AC `staff_invitations`

If V8 needs an incompatible format, introduce an **isolated V8 representation** (new nullable column, side table, or namespaced JSON key) and a **compatible adapter** so V7 continues to read/write the old shape.

## 7. Concurrent V7/V8 access and startup

- Both apps may read/write the same rows concurrently.
- Writers must preserve V7-required columns and formats.
- Hosted startup: **compatibility assert only** — no DDL.
- Operator migrate: single-flight via `pg_advisory_lock(824510017)` in `migrator.js`.
- Identity gate: refuse migrate when `DATABASE_IDENTITY_EXPECTED` / env mismatch (including production-vs-testing guards).

## 8. Additive migration strategy

1. **Expand:** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN` nullable **or** NOT NULL with stable `DEFAULT`, additive indexes, append CHECK/enum values that accept all existing rows.  
2. **Dual-read / dual-write:** V8 may read new fields; keep writing V7 fields until V7 is retired.  
3. **Adapters:** map V8-only shapes ↔ V7 shapes in application code.  
4. **No contract** that drops V7 dependencies while V7 remains active on the shared DB.  
5. Prefer `IF NOT EXISTS` / idempotent SQL matching the existing migrator style.

## 9. Expand / contract rules

| Phase | Allowed while V7 active? |
|-------|--------------------------|
| Expand | Yes |
| Migrate readers (V8 reads old+new) | Yes |
| Migrate writers (dual-write) | Yes |
| Contract (drop old columns/tables) | **No** until V7 is fully retired from this database |

Machine rules: `PHASE_RULES` + `lintMigrationSqlForV7Compatibility()`.

## 10. Locking, idempotency, schema version

| Mechanism | Behavior |
|-----------|----------|
| Advisory lock | `FOUNDATION_MIGRATE_LOCK_KEY = 824510017` |
| Ledger | `platform.schema_migrations (module, version)` PK |
| Checksum | SHA-256 of file contents; drift ⇒ refuse |
| Idempotency | Re-run skips applied versions with matching checksum |
| Transaction | Each file `BEGIN` → SQL → ledger insert → `COMMIT`; failure `ROLLBACK` |
| Seeds | Same ledger module `seeds` |
| Status | `migrator.statusReadOnly()` — no ledger create |

There is **no automatic down-migration**. Rollback of a failed file is transactional undo of that file only. Intentional reverse DDL is a new forward migration (still additive while V7 is active).

## 11. Scripts that must not auto-run on startup

| Script / entry | Startup? | Notes |
|----------------|----------|-------|
| `npm run db:migrate` / `db/scripts/migrate.js` | **No** | Operator only |
| `db/scripts/migrate-testing.js` | **No** | Testing tooling |
| `db/scripts/migrate-v5-to-v7*.js` | **No** | One-shot data migration |
| `db/scripts/migrate-v4-to-v5*.js` | **No** | Historical |
| `schema-compat-check.js` | **No** | Read-only inspect |
| App servers (`moovexPlatformRuntimeServer`, `activeClinicFoundationServer`, `v5FoundationServer`) | Assert only | Explicit “Do not run migrations from application startup” |

## 12. Read / write compatibility matrix

| Actor | Read | Write |
|-------|------|-------|
| V7 app | All V7-required columns/formats | Must satisfy V7 CHECKs/triggers |
| V8 app | V7 surface + additive V8 columns | Must keep V7 columns valid; V8-only data in additive fields |
| Shared row update from V8 | — | Must not clear/null V7-required fields V7 still reads |
| Concurrent session use | Independent cookies per deployment | Same `deployment_sessions` table; hash format stable |

## 13. Tests

| Suite | Purpose |
|-------|---------|
| `tests/v8-db-compatibility-baseline.test.js` | Contract lint, V7-required columns on disposable migrate, additive column safety, migrate re-run idempotency, failed-DDL rollback pattern, no startup migrate |
| `tests/v7-runtime-schema-compatibility.test.js` | Existing hosted capability gate |
| `npm run test:v8:db-compat` | Runs the V8 baseline suite |

Tests use **disposable local PostgreSQL fixtures** only (`tests/helpers/foundationDb.js`). They never target production or mutate shared hosted data.

## 14. Operator checklist (V8 DDL)

1. Confirm change is expand-only; run `lintMigrationSqlForV7Compatibility` mentally / in CI.  
2. Add migration under the correct module with next numeric version.  
3. Apply on disposable DB; run `test:v8:db-compat` and `db:schema:compat` against that fixture.  
4. Explicitly migrate testing (`neuniversity` / platform-testing) with identity gate set.  
5. Never auto-migrate production; never contract while V7 is live.
