# V10 PL10 — QA Canonical Reset (TESTING ONLY)

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_QA_CANONICAL_RESET` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Hard prerequisites** | `V10_FRESH_DB_BOOTSTRAP_PASS` · `QA_RESET_AUTHORIZED: YES` ([PL09](./V10_PL09_FRESH_DB_BOOTSTRAP.md)) |
| **Scope** | **TESTING/QA database only** |
| **Production** | **UNTOUCHED** (no production env load; no production writes) |
| **Historical QA user import** | **NONE** |
| **Verdict** | **`V10_QA_CANONICAL_RESET_PASS`** |

---

## Pre-destructive gates (all required)

| Check | Result |
|-------|--------|
| PL09 markers present | **PASS** |
| `DEPLOYMENT_ENV` | `testing` |
| `DATABASE_IDENTITY_EXPECTED` | `moovex-platform-v7` |
| `DATABASE_IDENTITY_ENV` | `testing` |
| `PLATFORM_DEPLOYMENT_CODE` | `moovex-platform-testing` |
| Live `platform.database_identity` | `moovex-platform-v7` / **`testing`** |
| Pre-reset instance id | `b5979443-0e93-4222-a979-9d4d6cd2ef9b` |
| Host / database | `aws-0-eu-central-1.pooler.supabase.com` / `postgres` |
| Production abort signals | **none** |
| `GETPRO_DATABASE_URL` | unset |

Pre-reset diagnostics: `docs/qa/references/v10-pl10-qa-reset/pre-reset-*.json`

Dry-run first: `V10_QA_CANONICAL_RESET_DRY_RUN` (no DROP).

---

## Destructive method (repository-supported)

```bash
scripts/local/run-with-blessboard-env.sh testing \
  node db/scripts/v10-qa-canonical-reset.js \
  --confirm 'CLEAR V10 QA CANONICAL SCHEMA'
```

npm alias: `npm run db:qa:canonical-reset -- --confirm 'CLEAR V10 QA CANONICAL SCHEMA'`

**Actions performed:**

1. `DROP SCHEMA IF EXISTS` for `ngo`, `getpro`, `activeclinic`, `blessboard`, `platform` (CASCADE)
2. Canonical migrate strategy **B** (205 migrations + 9 seeds)
3. `ensureDatabaseIdentity` → `moovex-platform-v7` / `testing` (new instance id)
4. Controlled BB + AC QA tenants via normal provision/registration (no old QA import)
5. Website CMS draft/edit/publish/version/restore + login checks

---

## Post-reset verification

| Item | Result |
|------|--------|
| DB identity | `moovex-platform-v7` / `testing` · instance `c9189f08-e8ab-432c-a454-5a609ac91e32` |
| Migration ceiling | platform/**043** · blessboard/**118** · activeclinic/**042** · getpro/**001** · ngo/**001** |
| Applied / seeds | **205** / **9** |
| Schema verify | **PASS** (`verifyCanonicalFreshSchema`) |
| AC V2.03 core tables | **PASS** |
| BB core tables | **PASS** |
| BB bootstrap | **PASS** (`pl10-bb-mujo4211` · login/publish/restore/CMS) |
| AC bootstrap | **PASS** (registration provision · login/publish/restore/CMS) |
| Tenant isolation (cross-product org ownership) | **PASS** (`bb_as_hco=0`, `ac_as_church=0`) |
| Isolation/RBAC suites (ephemeral) | **29/29 PASS** |
| Org counts after bootstrap | orgs **2** · churches **1** · healthcare_orgs **1** |
| Credentials | `.env.pl10-qa-tenants.local` (gitignored; not committed) |

---

## Production

```text
Production: UNTOUCHED
```

No `.env.production.local` load. No production host/identity targeted. Abort path would have fired on any production signal before DROP.

---

## Required marker

```text
V10_QA_CANONICAL_RESET_PASS

Target: moovex-platform-v7 / testing @ aws-0-eu-central-1.pooler.supabase.com / postgres
Migrations: 205 + 9 seeds · ceiling platform/043 · blessboard/118 · activeclinic/042
BB/AC controlled tenants: PASS (normal provision; no historical import)
Login / publication / CMS / V2.03 schema / isolation: PASS
Production: UNTOUCHED
```
