# V10 DBCL12 — Final Burden Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_DBCL12_FINAL_BURDEN_AUDIT` |
| **Date** | 2026-09-27 |
| **Mode** | **READ ONLY** — compare DBCL02/03 baseline vs current tree |
| **Prerequisite** | DBCL01–DBCL11 complete (DBCL11 `DBCL11_POST_CLEANUP_FRESH_DB_PASS`) |

---

## Baseline (DBCL02/03)

| Metric | Value |
|--------|-------|
| `ACTIONABLE_LOC_BASELINE` | **~1900** (`~310` SAFE_REMOVE_NOW + `~1570` SAFE_REMOVE_AFTER_TEST) |
| Out of scope keepers (not in 1.9k) | Website classic↔engine dual-write / bridge (product), V4/V5/V7 migrators (rollback), `server.legacy.js` (ACTIVE until fail-closed deploy decision) |

---

## What was actually removed (DBCL05–DBCL10)

Measured vs `HEAD` on the DBCL cleanup surface set (media, auth, staff/entitlements/HQ roles, registration lifecycle/status maps, AC schema probe, phone/reg soft-lag, geography probe, foundation tombstone wiring):

| Metric | Value |
|--------|-------|
| **LOC_ACTUALLY_REMOVED** | **~915 gross deleted** / **~403 net** after canonical replacements |
| **FILES_DELETED** | **2** — `src/platform/registration/statusCompatibility.js`, `src/activeclinic/services/activeClinicPublicSchemaStatus.js` |
| **FILES_SIMPLIFIED** | **14** — `mediaService`, `blessBoardAuthRepository`, `staffAccessService`, `entitlementRepository`, `hqRoleManagementService`, `lifecycle`, `phoneRulesService`, `registrationApplicationsAdminService`, `provisionRegisteredBlessBoardChurch`, `activeClinicFoundationServer`, `activeClinicWebsiteRoutes`, `locationRepository`, `provisioningRecovery`, `auditEventRepository` (comment/deferral only) |
| **FUNCTIONS_REMOVED** | **≥8 named** — `insertRole`, `updateRoleStatus`, `isReviewHold`, `isOperational`, statusCompatibility helpers (`isCanonicalStorage`, review/active predicates, …), `inspectActiveClinicPublicSchema` (+ media `42703` ladder branches) |

DBCL10 attribution for the final dead-code sweep alone: `LOC_REMOVED ~266`, `FILES_DELETED 2`, `FUNCTIONS_REMOVED 5`.

Of the ~1900 actionable baseline, the remainder that was **not** deleted is intentionally retained as justified compatibility (below), not unfinished cleanup debt.

---

## Runtime `user_roles`

| Metric | Result |
|--------|--------|
| **USER_ROLES_RUNTIME_READERS** | **0** (product `src/` — no `FROM`/`JOIN`/`SELECT` on `blessboard.user_roles`; staff/entitlements/HQ use `user_role_assignments` only) |
| **USER_ROLES_RUNTIME_WRITERS** | **0** (freeze trigger + `insertRole`/`updateRoleStatus` removed; catalogue assign only) |

Non-runtime remainders (classified, not product auth):

| Surface | Class |
|---------|-------|
| `src/migration/v4ToV5/loadPg.js` INSERT/SELECT | `ROLLBACK_INFRASTRUCTURE` |
| `testingDataResetRepository` DELETE | Ops reset / `ROLLBACK_INFRASTRUCTURE` |
| Table retained + freeze trigger | Frozen schema object (disposable rows) |

DBCL11 instrumented fresh bootstrap: runtime reads=0, writes=0.

---

## `42703` schema fallbacks

| Metric | Count / notes |
|--------|----------------|
| **42703_SCHEMA_FALLBACKS_BEFORE** | **7 surfaces** (DBCL03 D1–D7): audit `COLS_LEGACY`, media pre-035 ladder, auth phone probe, `website_published` soft-tolerate, reg/admin/phone soft-maps, AC public schema `information_schema` probe, geography table probe (~16 `42703` code-check sites in measured files) |
| **42703_SCHEMA_FALLBACKS_AFTER** | **1 surface** — `auditEventRepository` `COLS_LEGACY` insert+list (`PRODUCTION_SCHEMA_LAG`; prod ledger still pre-037 per DBCL08 D1 deferral) |

Other remaining `42703` **mentions** are logging / operator messaging / comments (not alternate-SQL ladders).

---

## Legacy registration status branches

| Metric | Result |
|--------|--------|
| **LEGACY_STATUS_BRANCHES_BEFORE** | **8** alias keys in `statusCompatibility` (`pending_review`, `approved`, `withdrawn`, `duplicate`, `duplicate_review`, `pending`, `closed`, `cancelled`) + lifecycle historical branches |
| **LEGACY_STATUS_BRANCHES_AFTER** | **0** application-status alias branches (`lifecycle.js` canonical-only; `statusCompatibility.js` deleted; DBCL07 scanner green) |

Unrelated product workflows (website change submissions, pastoral forms, billing reviews, etc.) still use their **own** `pending_review` / `approved` domain statuses — not registration application aliases.

---

## Remaining compatibility classification

| Artefact | Classification | Status |
|----------|----------------|--------|
| `syncDraftToEngine` | `CURRENT_PRODUCT_SEMANTICS` | **KEEP** — live draft→engine sync still called from inline/structured draft services |
| Overlay dual-write | `CURRENT_PRODUCT_SEMANTICS` | **KEEP** — `blessboardWebsiteEditorRoutes` classic overlay until public projection cutover |
| `publishFromLegacy` | `CURRENT_PRODUCT_SEMANTICS` | **KEEP** — `churchWebsitePublishService` / restore / backfill |
| `blessboardBridge` | `CURRENT_PRODUCT_SEMANTICS` | **KEEP** — active bridge module |
| `v7CompatibleWebsitePublish` | `CURRENT_PRODUCT_SEMANTICS` | **KEEP** — publish shape gate for shared engine |
| Classic CMS adapters | `CURRENT_PRODUCT_SEMANTICS` | **KEEP** — `blessboardClassicCmsAdapter` + classic publish paths (PL05 proven) |
| `v4ToV5` | `ROLLBACK_INFRASTRUCTURE` | **KEEP** |
| `v5ToV7` | `ROLLBACK_INFRASTRUCTURE` | **KEEP** |
| Website backfills | `ROLLBACK_INFRASTRUCTURE` | **KEEP** — `blessboardBackfillService` |
| `server.legacy.js` | `CURRENT_PRODUCT_SEMANTICS` (ACTIVE bootstrap) | **KEEP** — DBCL09; unprofiled `server.js` still requires it |
| `user_roles` table | Frozen schema / disposable data | **KEEP table**; **runtime R/W = 0** |
| Audit `COLS_LEGACY` | `PRODUCTION_SCHEMA_LAG` | **KEEP until production receives 037+ / reset** |
| Hostinger/media service failure paths | `EXTERNAL_SERVICE_RESILIENCE` | **KEEP** (genuine provider failure — not schema lag) |
| `compareLegacyHostContext` | Tied to `server.legacy.js` | **KEEP** |
| `v8DbCompatibilityContract` / `organizationKeyCompat` | Policy / current key helpers | **KEEP** |

No `UNKNOWN` blockers remain for the DBCL02/03 actionable set.

---

## Architecture + regression

| Suite | Result |
|-------|--------|
| `npm run test:architecture` | **7/7 PASS** |
| DBCL04 + DBCL07–DBCL11 cluster | **42/42 PASS** |

Broader V8 host-matrix / AC publish residual failures noted in DBCL10 remain **pre-existing** and outside this cleanup burden.

---

## Closure

```text
V10_DB_CODE_BURDEN_CLEANUP_COMPLETE

P0_OPEN: none
P1_OPEN: production audit facility_id/product_code lag (COLS_LEGACY); website classic↔engine dual-write (product); server.legacy unprofiled bootstrap (deploy fail-closed decision)

DB_COMPATIBILITY_STATE: CANONICAL_WITH_JUSTIFIED_COMPATIBILITY

NEXT_MAJOR_DB_CLEANUP_REQUIRED: NO

NEXT_RECOMMENDED_ACTIVITY: V2.03 QA
```
