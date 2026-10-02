# V10 DBCL11 — Post-Cleanup Fresh DB Bootstrap

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_DBCL11_POST_CLEANUP_FRESH_DB` |
| **Date** | 2026-09-27 |
| **Prerequisite** | DBCL10 `DBCL10_POST_CUTOVER_DEAD_CODE_PASS` |
| **Mode** | Isolated disposable Postgres only (`blessboard_ft_*`) — never QA/production |

---

## Scope exercised

From empty application schema on ephemeral foundation DB:

1. Canonical migrations + seeds (strategy B ceilings: platform/043, blessboard/118, activeclinic/042)
2. Fresh-schema contract (`verifyCanonicalFreshSchema`)
3. Platform + BlessBoard tenant bootstrap
4. ActiveClinic registration + tenant provision (canonical lifecycle only)
5. Registration / login / RBAC / HQ+branch role assignment / staff counts
6. Website editing, CMS, publication, versions/restore, media (BB + AC)
7. AC core V2.03 relation presence
8. Tenant isolation + audit `facility_id` / `product_code` without 42703 fallback

## Explicit invariants

| Check | Result |
|-------|--------|
| `user_roles` runtime writes | **0** |
| `user_roles` runtime reads | **0** (one intentional verification COUNT discounted) |
| Forbidden legacy registration statuses | not observed |
| Removed 42703 audit lag path | not triggered |
| `statusCompatibility.js` | absent (DBCL10) |
| `activeClinicPublicSchemaStatus.js` | absent (DBCL10) |

## Harness

`tests/v10-dbcl11-post-cleanup-fresh-bootstrap.test.js`

```bash
node --test --test-reporter=spec tests/v10-dbcl11-post-cleanup-fresh-bootstrap.test.js
```

Evidence run: **7/7 pass**, duration ~5.4s (ephemeral local Postgres).

---

```text
DBCL11_POST_CLEANUP_FRESH_DB_PASS

TARGET: ephemeral blessboard_ft_* only
USER_ROLES_RUNTIME_WRITES: 0
USER_ROLES_RUNTIME_READS: 0
ERRORS_42703: 0
LEGACY_REG_STATUSES: none
QA_OR_PROD_TOUCHED: no
TESTS: 7/7 pass
```
