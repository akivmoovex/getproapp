# V10 PC06 — Platform Schema Ownership

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC06_PLATFORM_SCHEMA_OWNERSHIP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC05 PASS |
| **Plan** | `PLATFORM_SCHEMA_OWNERSHIP_PLAN` — [`docs/database/PLATFORM_SCHEMA_OWNERSHIP.md`](../database/PLATFORM_SCHEMA_OWNERSHIP.md) |
| **Verdict** | **`PLATFORM_SCHEMA_OWNERSHIP_PASS`** |
| **Runtime / applied migrations** | **UNCHANGED** |
| **Production** | **NOT MUTATED** |

---

## 1. Decision

No rename/delete/reorder of applied migrations. No dual-write relocation of historical tables. PC06 is **documentation + automated ownership guard** only.

---

## 2. Historical exceptions (separate from future rules)

| Class | Examples | Why frozen |
|-------|----------|------------|
| AC RBAC under BB module | `blessboard/077`–`092`, `115`, `118` `*activeclinic*` | Catalogue tables live in `blessboard.*`; early AC seeds shipped via BB migrator |
| Shared website perms + AC grants | `blessboard/093`, `095` | Primarily BB website catalogue; also grants AC roles |
| Misnamed product contact table | `activeclinic/035_platform_contact_inquiries.sql` | Table is `activeclinic.platform_contact_inquiries` (AC.org contact); `platform_` is naming debt only |

Allowlist source of truth: `db/scripts/lib/migrationOwnershipPolicy.js` (`HISTORICAL_EXCEPTIONS`).

**Not exceptions:** AC migrations with FKs to `platform.*`; platform migrations that name a product while extending `platform.*` catalogues (e.g. `018_activeclinic_application_code`, `026_activeclinic_patient_identity_profile`).

---

## 3. Corrected future rules

| New change | Folder |
|------------|--------|
| Platform-neutral schema | `db/migrations/platform/` |
| BB domain | `db/migrations/blessboard/` |
| AC domain (incl. new AC RBAC grants) | `db/migrations/activeclinic/` |

Do not use `platform_` prefixes for product-owned objects. Never rewrite applied history for cosmetics.

---

## 4. Artifacts added

| Path | Role |
|------|------|
| `docs/database/PLATFORM_SCHEMA_OWNERSHIP.md` | Plan + operator checklist |
| `db/scripts/lib/migrationOwnershipPolicy.js` | Frozen exceptions + audit helper |
| `db/migrations/README.md` | Pointer for migrators |
| `tests/v10-pc06-platform-schema-ownership.test.js` | Guard: no new cross-product filename placements outside allowlist |

---

## 5. Tests

| Suite | Result |
|-------|--------|
| `tests/v10-pc06-platform-schema-ownership.test.js` | PASS |
| `tests/v8-migration-contract.test.js` | PASS |
| `tests/v7-migrate-identity-gate.test.js` | PASS |

---

## 6. Behavior / schema changes

**None.** Discovery order, checksums, and applied ledgers unchanged.

---

## 7. Verdict

```text
PLATFORM_SCHEMA_OWNERSHIP_PASS
```
